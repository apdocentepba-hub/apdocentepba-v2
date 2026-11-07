// Candidate: compare two complete official-source capture sets without sending anything.
// Read-only, no user data, no ABC credentials, no imports of production Worker.
import {createHash} from 'node:crypto';

const IMPORTANT_FIELDS=Object.freeze([
  'estado','finoferta','turno','jornada','hsmodulos','cursodivision',
  'supl_desde','supl_hasta','escuela','distrito'
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
export function parseVerifiedClosingTime(value) {
  const text=norm(value);
  if(!text)return null;
  const iso=/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/i;
  if(iso.test(text)) {
    const ms=Date.parse(text);
    return Number.isFinite(ms)?ms:null;
  }
  // Explicit Buenos Aires local datetime as ABC sometimes presents.
  const ar=text.match(/^(\d{2})\/(\d{2})\/(20\d{2})\s+(\d{1,2}):(\d{2})$/);
  if(!ar)return null; // Never guess midnight for bare dates or ambiguous strings.
  const [,day,month,year,hour,min]=ar.map(Number);
  if(hour>23||min>59||month<1||month>12||day<1||day>31)return null;
  const date=new Date(Date.UTC(year,month-1,day,hour+3,min));
  const normalized=new Date(Date.UTC(year,month-1,day));
  if(normalized.getUTCFullYear()!==year||normalized.getUTCMonth()!==month-1||normalized.getUTCDate()!==day)return null;
  return date.getTime(); // Argentina UTC-03, no DST in 2026.
}
function scanTime(value) {
  if(!/^\d{4}-\d{2}-\d{2}T/.test(norm(value)))return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms)?ms:null;
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
    previousCapturedAt='',currentCapturedAt='',scope='',previousScope=''
  }=options;
  const oldT=scanTime(previousCapturedAt),newT=scanTime(currentCapturedAt);
  if(!previousComplete||!currentComplete||!scope||scope!==previousScope||
     oldT===null||newT===null||newT<=oldT||newT-oldT>48*3600000)
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
        events.push(candidate(id,'offer_modified',field,before,after,currentCapturedAt));
      }
    }
    const close=parseVerifiedClosingTime(item.finoferta);
    const earlierClose=parseVerifiedClosingTime(older.finoferta);
    if(close===null||earlierClose!==close||close<=newT)continue;
    for(const h of HOURS) {
      if(earlierClose-oldT>h*3600000 && close-newT<=h*3600000){
        events.push(candidate(id,'closing_soon',String(h)+'h',null,null,currentCapturedAt));
      }
    }
  }
  // Missing offers are NOT classified as closed. A disappearance is ambiguous even after a scan.
  return {verified:true,events,compared_offers:newIndex.size,source_scope:scope};
}
