// Official ABC APD Solr READ-ONLY offer crosscheck. This file contains only public offer IDs.
// No account tokens, Supabase, posting actions, emails, SQL, or mutation.
import assert from 'node:assert/strict';
const ORIGIN='https://servicios3.abc.gob.ar';
const ENDPOINT=ORIGIN+'/valoracion.docente/api/apd.oferta.encabezado/select';
const EXPECTED=[
  {id:'4396000',parent:'4412278',district:'AVELLANEDA',cargo:'PR',shift:'MANANA'},
  {id:'4396004',parent:'4412282',district:'AVELLANEDA',cargo:'PR',shift:'TARDE'},
  {id:'4396014',parent:'4412292',district:'AVELLANEDA',cargo:'PR',shift:'TARDE'},
  {id:'4396087',parent:'4412365',district:'AVELLANEDA',cargo:'MTM',shift:'NOCHE'},
  {id:'4396314',parent:'4412593',district:'AVELLANEDA',cargo:'MCS',shift:'TARDE'},
  {id:'4396441',parent:'4412720',district:'GENERAL SAN MARTIN',cargo:'PR',shift:'MANANA'}
];
const DISTRICTS=['AVELLANEDA','GENERAL SAN MARTIN','PARTIDO DE LA COSTA'];
const FIELDS='iddetalle,idoferta,descdistrito,descripcioncargo,descripcionarea,descnivelmodalidad,turno,estado,finoferta,ult_movimiento,cargo';
let requests=0;
async function select(q,start=0,rows=200){
  assert.ok(requests++<36,'ABC request cap reached');
  const params=new URLSearchParams({q,start:String(start),rows:String(rows),wt:'json',fl:FIELDS});
  const url=new URL(ENDPOINT+'?'+params);
  assert.equal(url.origin,ORIGIN);assert.equal(url.pathname,'/valoracion.docente/api/apd.oferta.encabezado/select');
  const res=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{
    'accept':'application/json, text/javascript, */*; q=0.01',
    'user-agent':'Mozilla/5.0','referer':'http://servicios2.abc.gob.ar/','origin':'http://servicios2.abc.gob.ar'
  }});
  if(res.status!==200) throw new Error('Official ABC returned HTTP '+res.status+' to a read-only request');
  const raw=await res.arrayBuffer();
  assert.ok(raw.byteLength<5_000_000,'Oversized public response');
  const j=JSON.parse(new TextDecoder('iso-8859-1').decode(raw));
  assert.ok(j.response && Array.isArray(j.response.docs),'Unexpected official ABC JSON');
  return j.response;
}
function codeOf(doc){
 const v=String(doc.descripcioncargo||'')+' '+String(doc.descripcionarea||'')+' '+String(doc.cargo||'');
 if(/PRECEPTOR|\/PR\b|\bPR\b/i.test(v))return 'PR';
 if(/CICLO SUPERIOR|\bMCS\b/i.test(v))return 'MCS';
 if(/MATEM|\bMTM\b/i.test(v))return 'MTM';
 if(/\bELI\b/i.test(v))return 'ELI';
 if(/\bPLI\b/i.test(v))return 'PLI';
 return 'OTHER';
}
const canon=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
async function districtSnapshot(d){
 const q='descdistrito:"'+d+'" AND estado:"Publicada"';
 let start=0,docs=[],numFound=null;
 for(let page=0;page<16;page++){
   const r=await select(q,start);
   const n=Number(r.numFound);
   assert.ok(Number.isSafeInteger(n)&&n>=0,'Invalid ABC total');
   if(numFound===null)numFound=n;
   else assert.equal(n,numFound,'ABC results changed during pagination - incomplete snapshot');
   docs.push(...r.docs);
   start=docs.length;
   if(start>=n)return {docs,numFound,complete:true};
   if(r.docs.length===0) throw new Error('ABC pagination stalled for '+d);
 }
 throw new Error('ABC district pagination exceeds safety limit: '+d);
}
const started=new Date().toISOString();
const snapshots={};
const failures=[];
for(const d of DISTRICTS){
 try{snapshots[d]=await districtSnapshot(d)}
 catch(e){failures.push({district:d,error:String(e.message||e)})}
}
const byDistrictDocs=Object.values(snapshots).flatMap(x=>x.docs);
const report=[];
for(const item of EXPECTED){
 const currentByDistrict=byDistrictDocs.filter(doc=>String(doc.iddetalle||'')===item.id);
 let directDocs=[],directError='';
 try {
   // Exact lookup checks offers even when the published-only district list no longer contains them.
   const direct=await select('iddetalle:'+item.id,0,10);
   directDocs=direct.docs.filter(doc=>String(doc.iddetalle||'')===item.id);
 }catch(e){directError=String(e.message||e)}
 const matches=directDocs.length?directDocs:currentByDistrict;
 const doc=matches[0]||null;
 const state=doc?canon(doc.estado):null;
 const code=doc?codeOf(doc):null;
 const district=doc?canon(doc.descdistrito):null;
 const shift=doc?canon(doc.turno):null;
 const localClose=doc?String(doc.finoferta||''):null;
 const validDeadline=Boolean(localClose && /^2026-11-06T07:30:00Z$/i.test(localClose));
 const checks={
  unique:matches.length===1,
  idoferta:String(doc?.idoferta||'')===item.parent,
  district:district===canon(item.district),
  cargo:code===item.cargo,
  shift:shift===canon(item.shift),
  published:state==='PUBLICADA',
  close_matches_saved:validDeadline
 };
 const allPass=Object.values(checks).every(Boolean);
 report.push({offer:'D_'+item.id,found:matches.length,official_state:state,official_district:district,official_cargo_code:code,official_shift:shift,official_close:localClose,checks,all_pass:allPass,source_lookup_error:directError||null});
}
const result={
 time_utc:new Date().toISOString(),source:ENDPOINT,method:'GET_only',requests,
 districts:Object.entries(snapshots).map(([name,s])=>({district:name,total_published:s.numFound,complete:s.complete,loaded:s.docs.length})),
 district_errors:failures,
 six_offers:report,
 confirmed_all_six:failures.length===0 && report.every(r=>r.all_pass),
 match_count_in_saved_six:report.filter(r=>r.all_pass).length,
 unknown_or_mismatch:report.filter(r=>!r.all_pass).map(r=>r.offer),
 full_preference_universe_audited:false,
 no_writes:true,no_emails:true,no_user_secrets:true
};
console.log('APD_ABC_OFFICIAL_SIX_CROSSCHECK '+JSON.stringify(result));
if(failures.length||report.some(r=>!r.all_pass))process.exitCode=2;
