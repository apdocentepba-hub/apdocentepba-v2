// Candidate: compare two complete official-source capture sets without sending anything.
// Read-only, no user data, no ABC credentials, no imports of production Worker.
import {createHash} from 'node:crypto';

const IMPORTANT_FIELDS=Object.freeze([
  'estado','finoferta','turno','jornada','hsmodulos','cursodivision',
  'supl_desde','supl_hasta','escuela','distrito','cargo','area','nivel_modalidad'
]);
const MINUTE=60000;
const HOURS=[72,24];
const OFFER_STATUSES=new Set(['PUBLICADA','PUBLICADO','PUBLICADAS']);
const EXPLICIT_END_STATES=new Set(['ANULADA','ANULADO','CANCELADA','CANCELADO','DESIERTA','DESIERTO','DESIGNADA','DESIGNADO','CERRADA','CERRADO']);

function norm(value) {
  return String(value??'').trim().replace(/\s+/g,' ');
}
function stableId(o) {
  return norm(o?.source_offer_key);
}
function normValue(value) {
  return norm(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
}
const MAX_CAPTURE_AGE_MS=12*3600000;
const MAX_CAPTURE_FUTURE_MS=5*60000;

function validCalendarDate(year,month,day) {
 if(!Number.isInteger(year)||year<2000||year>2100||
    !Number.isInteger(month)||month<1||month>12||
    !Number.isInteger(day)||day<1||day>31)return false;
 const d=new Date(Date.UTC(year,month-1,day));
 return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
}
export function parseVerifiedClosingTime(value,{abcWallTime=false}={}) {
 const text=norm(value);
 if(!text)return null;
 const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))$/i);
 if(iso){
  const year=Number(iso[1]),month=Number(iso[2]),day=Number(iso[3]);
  const hour=Number(iso[4]),minute=Number(iso[5]),second=Number(iso[6]||0);
  const offsetHour=Number(iso[9]||0),offsetMinute=Number(iso[10]||0);
  if(!validCalendarDate(year,month,day)||hour>23||minute>59||second>59||
     offsetHour>14||offsetMinute>59||(offsetHour===14&&offsetMinute!==0))return null;
  // Only ABC's finoferta field may opt into its Z-marked local ART clock.
  // Capture metadata and explicitly offset timestamps keep actual UTC semantics.
  if(abcWallTime&&iso[8].toUpperCase()==='Z'){
   const milli=iso[7]?Number(iso[7].slice(0,3).padEnd(3,'0')):0;
   return Date.UTC(year,month-1,day,hour+3,minute,second,milli);
  }
  const ms=Date.parse(text);
  return Number.isFinite(ms)?ms:null;
 }
 // Explicit Buenos Aires local datetime; no guessing midnight for bare dates.
 const ar=text.match(/^(\d{2})\/(\d{2})\/(20\d{2})\s+(\d{1,2}):(\d{2})$/);
 if(!ar)return null;
 const day=Number(ar[1]),month=Number(ar[2]),year=Number(ar[3]);
 const hour=Number(ar[4]),minute=Number(ar[5]);
 if(!validCalendarDate(year,month,day)||hour>23||minute>59)return null;
 return Date.UTC(year,month-1,day,hour+3,minute); // Argentina UTC-3 in 2026.
}
function scanTime(value) {
 const text=norm(value);
 if(!/^\d{4}-\d{2}-\d{2}T/.test(text))return null;
 return parseVerifiedClosingTime(text);
}
function makeIndex(rows) {
  if(!Array.isArray(rows)||rows.length>100000)return null;
  const out=new Map();
  for(const row of rows) {
    const id=stableId(row);
    if(!id||!row||out.has(id))return null;
    out.set(id,row);
  }
  return out;
}
function key(id,kind,field,before,after) {
  return createHash('sha256').update(JSON.stringify([id,kind,field,before,after])).digest('hex');
}
function candidate(id,kind,field,before,after,seenAt) {
  return {
    source_offer_key:id,
    type:kind,
    field:field||null,
    before:before??null,
    after:after??null,
    observed_at:seenAt,
    event_key:key(id,kind,field,before,after),
    push_title:'Actualización de una oportunidad APD',
    push_body:'Tenés una novedad en tus alertas. Abrí la app para ver el detalle.'
  };
}
export function detectOfferUpdates(previous,current,options={}) {
  const {
    previousComplete=false,currentComplete=false,
    previousCapturedAt='',currentCapturedAt='',scope='',previousScope='',
    nowMs=Date.now()
  }=options;
  const oldT=scanTime(previousCapturedAt),newT=scanTime(currentCapturedAt);
  if(!previousComplete||!currentComplete||!scope||scope!==previousScope||
     !Number.isFinite(nowMs)||
     oldT===null||newT===null||newT<=oldT||newT-oldT>48*3600000||
     newT>nowMs+MAX_CAPTURE_FUTURE_MS||nowMs-newT>MAX_CAPTURE_AGE_MS)
    return {verified:false,events:[],reason:'incomplete_or_incomparable_snapshots'};
  const oldIndex=makeIndex(previous),newIndex=makeIndex(current);
  if(!oldIndex||!newIndex)return {verified:false,events:[],reason:'ambiguous_offer_identity'};
  const events=[];
  for(const [id,item] of newIndex){
    const older=oldIndex.get(id);
    if(!older)continue; // New offers are handled by the existing alert pipeline.
    const priorState=normValue(older.estado),nowState=normValue(item.estado);
    if(OFFER_STATUSES.has(priorState)&&EXPLICIT_END_STATES.has(nowState)) {
      events.push(candidate(id,'official_state_changed','estado',norm(older.estado),norm(item.estado),currentCapturedAt));
      continue;
    }
    if(!OFFER_STATUSES.has(priorState)||!OFFER_STATUSES.has(nowState))continue;
    for(const field of IMPORTANT_FIELDS) {
      if(field==='estado')continue;
      const before=norm(older[field]),after=norm(item[field]);
      if(normValue(before)!==normValue(after)) {
        // Blank values should not overwrite a confirmed fact or generate a false change.
        if(!before||!after)continue;
        if(field==='finoferta'){
          // Two representations of the same ART closing time are NOT a change.
          const earlier=parseVerifiedClosingTime(before,{abcWallTime:true});
          const later=parseVerifiedClosingTime(after,{abcWallTime:true});
          if(earlier===null||later===null||earlier===later)continue;
        }
        events.push(candidate(id,'offer_modified',field,before,after,currentCapturedAt));
      }
    }
    const close=parseVerifiedClosingTime(item.finoferta,{abcWallTime:true});
    const earlierClose=parseVerifiedClosingTime(older.finoferta,{abcWallTime:true});
    if(close===null||earlierClose!==close||close<=newT||close<=nowMs)continue;
    for(const h of HOURS) {
      if(earlierClose-oldT>h*3600000 && close-newT<=h*3600000){
        events.push(candidate(id,'closing_soon',String(h)+'h',null,null,currentCapturedAt));
      }
    }
  }
  // Missing offers are NOT classified as closed. A disappearance is ambiguous even after a scan.
  return {verified:true,events,compared_offers:newIndex.size,source_scope:scope};
}
