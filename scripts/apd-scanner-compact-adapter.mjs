// Offline candidate adapter for the current APD provincial scanner response.
// OFF by default; readPage/readScanState are injected. NO production wiring,
// fetch, Supabase, credentials, background work or message delivery.
import {createHash} from 'node:crypto';
import {compactCaptureFromPages} from './apd-offer-compact-capture.mjs';
import {parseVerifiedClosingTime} from './apd-offer-change-detector.mjs';

const MAX_TOTAL=25000,MAX_PAGES=100;
const plain=v=>String(v??'').trim();
const norm=v=>plain(v).toUpperCase().normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}\s/().,-]/gu,' ')
 .replace(/\s+/g,' ').trim();
const TURN_MAP=Object.freeze({
 M:'MANANA',MT:'MANANA',MANANA:'MANANA',T:'TARDE',TT:'TARDE',
 V:'VESPERTINO',VESPERTINO:'VESPERTINO',N:'NOCHE',A:'ALTERNADO'
});
const course=v=>plain(v).replace(/Â°/g,'°').replace(/º/g,'°')
 .replace(/Ş/g,'°').replace(/�/g,'°')
 .replace(/(\d)\s*°\s*(\d)\s*°?/g,'$1°$2°')
 .replace(/\s+/g,' ').trim();
const pick=(...v)=>v.find(x=>x!==null&&x!==undefined&&String(x).trim()!=='')??'';
const numeric=v=>{
 if(v===null||v===undefined||v==='')return '';
 const s=String(v);
 return /^\d{1,18}$/.test(s)?s:'';
};
const acceptedState=v=>norm(v)==='PUBLICADA';
const explicitTime=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s)
 &&parseVerifiedClosingTime(s)!==null;

export function projectCurrentAPDHeader(doc,scope){
 if(!doc||typeof doc!=='object'||Array.isArray(doc))
  throw Error('invalid_official_offer');
 const district=norm(doc.descdistrito);
 if(!district||district!==norm(scope))throw Error('unexpected_district_from_abc');
 if(!acceptedState(doc.estado))throw Error('non_published_state_in_current_feed');
 // Worker uses iddetalle || id and falls back to idoferta. Reject its
 // volatile text-derived fallback: it cannot attest a stable identity.
 const detail=numeric(pick(doc.iddetalle,doc.id));
 const offer=numeric(doc.idoferta);
 const source_offer_key=detail?'D_'+detail:offer?'O_'+offer:'';
 if(!source_offer_key)throw Error('missing_stable_official_offer_identifier');
 const turn=norm(pick(doc.turno,''));
 return {
  source_offer_key,
  estado:plain(doc.estado),
  finoferta:plain(doc.finoferta),
  turno:TURN_MAP[turn]||turn,
  jornada:plain(doc.jornada),
  hsmodulos:plain(pick(doc.hsmodulos,doc.modulos)),
  cursodivision:course(doc.cursodivision),
  supl_desde:plain(doc.supl_desde),
  supl_hasta:plain(doc.supl_hasta),
  escuela:plain(pick(doc.escuela,doc.nombreestablecimiento)),
  distrito:district,
  cargo:plain(pick(doc.descripcioncargo,doc.cargo)),
  area:plain(doc.descripcionarea),
  nivel_modalidad:plain(doc.descnivelmodalidad)
 };
}

function verifiedScan(s){
 if(s?.scope!=='PROVINCIA_FULL'||s?.mode!=='current_published'||
    s?.status!=='finished'||!Number.isSafeInteger(s.total_districts)||
    s.total_districts<1||s.districts_completed!==s.total_districts||
    !Number.isSafeInteger(s.offers_processed)||s.offers_processed<0||
    !explicitTime(s.started_at)||!explicitTime(s.finished_at)||
    Date.parse(s.finished_at)<Date.parse(s.started_at))return false;
 return true;
}
const stamp=s=>JSON.stringify([
 s.scope,s.mode,s.status,s.total_districts,s.districts_completed,
 s.offers_processed,s.started_at,s.finished_at
]);

export function createAPDScannerCompactAdapter({
 enabled=false,readPage,readScanState,pageSize=150,clock=()=>Date.now()
}={}){
 if(enabled!==true)throw Error('APD compact scanner candidate is disabled');
 if(typeof clock!=='function')throw Error('Missing trusted test clock');
 if(typeof readPage!=='function'||typeof readScanState!=='function')
  throw Error('Read-only source and scan-state callbacks are required');
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>150)
  throw Error('Unsupported APD page size');

 async function fetchPass(scope,pass){
  let expectedTotal=null,offset=0;
  const pages=[],identity=new Set();
  do{
   if(pages.length>=MAX_PAGES)throw Error('APD page limit exceeded');
   // Callbacks are supplied by an isolated test. This module never opens URLs.
   const packet=await readPage(Object.freeze({district:scope,start:offset,
    rows:pageSize,pass}));
   const response=packet?.response;
   if(!response||!Number.isSafeInteger(response.numFound)||
      response.numFound<0||response.numFound>MAX_TOTAL||
      !Number.isSafeInteger(response.start)||response.start!==offset||
      !Array.isArray(response.docs)){
    throw Error('ABC result has no verifiable numFound, start, or docs');
   }
   if(expectedTotal===null)expectedTotal=response.numFound;
   if(expectedTotal!==response.numFound)
    throw Error('ABC numFound changed during district capture');
   const required=Math.min(pageSize,expectedTotal-offset);
   if(required<0||response.docs.length!==required)
    throw Error('ABC page length does not match reported total');
   const projected=response.docs.map(doc=>projectCurrentAPDHeader(doc,scope));
   for(const item of projected){
    if(identity.has(item.source_offer_key))
     throw Error('ABC repeated an offer across pages');
    identity.add(item.source_offer_key);
   }
   pages.push({offset,sourceTotal:expectedTotal,rows:projected});
   offset+=projected.length;
  }while(offset<expectedTotal);
  if(offset!==expectedTotal)throw Error('ABC source coverage incomplete');
  const rows=pages.flatMap(p=>p.rows);
  const sha=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  return {pages,rows,sourceTotal:expectedTotal,digest:sha};
 }
 return Object.freeze({
  async capture({district,capturedAt}={}){
   if(typeof district!=='string'||district.length>120||
      !norm(district)||district!==norm(district)||
      !explicitTime(capturedAt))throw Error('Invalid canonical district or UTC capture time');
   const firstScan=await readScanState();
   if(!verifiedScan(firstScan))throw Error('Scanner state is not complete');
   const when=Date.parse(capturedAt),finished=Date.parse(firstScan.finished_at);
   const now=clock();
   if(!Number.isFinite(now)||when<finished||when-finished>15*60000||
      when>now+5*60000||now-when>12*3600000)
    throw Error('Capture is stale, future, or detached from finished scan');
   const first=await fetchPass(district,1);
   const second=await fetchPass(district,2);
   const lastScan=await readScanState();
   if(!verifiedScan(lastScan)||stamp(firstScan)!==stamp(lastScan))
    throw Error('Scanner changed during two-pass ABC read');
   if(first.sourceTotal!==second.sourceTotal||first.digest!==second.digest)
    throw Error('ABC contents shifted between complete source passes');
   const capture=compactCaptureFromPages({
    scope:district,capturedAt,pages:second.pages,
    scanMode:'current_published',scanStatus:'finished'
   });
   if(!capture.complete)throw Error('Compact capture rejected source: '+capture.reason);
   return Object.freeze({
    source:'abc_solr_double_pass_lab',
    candidateOnly:true,
    authorizedForProduction:false,
    capture,
    evidence:Object.freeze({
     pagesPerPass:second.pages.length,
     sourceTotal:second.sourceTotal,
     stableAcrossTwoPasses:true,
     scanFinishedAt:firstScan.finished_at
    })
   });
  }
 });
}
