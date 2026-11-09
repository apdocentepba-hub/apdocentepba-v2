// APD compact *candidate* capture. Deterministic and memory-only.
// Does not attest to real ABC freshness, atomicity, or authorize notifications.
import {createHash} from 'node:crypto';
import {detectOfferUpdates,parseVerifiedClosingTime} from './apd-offer-change-detector.mjs';

const FIELDS=Object.freeze([
 'source_offer_key','estado','finoferta','turno','jornada','hsmodulos',
 'cursodivision','supl_desde','supl_hasta','escuela','distrito',
 'cargo','area','nivel_modalidad'
]);
const MAX_TOTAL=25000,MAX_PAGE=500,MAX_PAGES=100;
const canon=v=>String(v??'').trim().replace(/\s+/g,' ');
const norm=v=>canon(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

export function compactCaptureFromPages({scope='',capturedAt='',pages=[],scanMode='current_published',scanStatus='finished'}={}){
 const sourceScope=canon(scope);
 const instant=parseVerifiedClosingTime(capturedAt);
 // This verifies the supplied page set, NOT the upstream scanner's truthfulness.
 if(!sourceScope||instant===null||scanStatus!=='finished'||scanMode!=='current_published'||
   !Array.isArray(pages)||!pages.length||pages.length>MAX_PAGES)
  return {complete:false,reason:'missing_or_untrusted_capture_metadata'};
 const rows=[],keys=new Set();
 let expectedTotal=null,nextOffset=0;
 for(const page of pages){
  if(!page||!Number.isSafeInteger(page.offset)||page.offset!==nextOffset||
    !Number.isSafeInteger(page.sourceTotal)||page.sourceTotal<0||
    page.sourceTotal>MAX_TOTAL||!Array.isArray(page.rows)||
    page.rows.length>MAX_PAGE)return {complete:false,reason:'invalid_page_coverage'};
  if(expectedTotal===null)expectedTotal=page.sourceTotal;
  if(expectedTotal!==page.sourceTotal)return {complete:false,reason:'source_total_changed_mid_scan'};
  if(expectedTotal>0&&page.rows.length===0)return {complete:false,reason:'empty_page_in_nonempty_scan'};
  if(nextOffset+page.rows.length>expectedTotal)
   return {complete:false,reason:'page_exceeds_source_total'};
  for(const row of page.rows){
   if(!row||typeof row!=='object'||Array.isArray(row)||
     !canon(row.source_offer_key)||canon(row.source_offer_key).length>160||
     norm(row.distrito)!==norm(sourceScope))
    return {complete:false,reason:'row_identity_or_scope_invalid'};
   const key=canon(row.source_offer_key);
   if(keys.has(key))return {complete:false,reason:'duplicate_offer_identity'};
   keys.add(key);
   const compact=Object.create(null);
   for(const f of FIELDS){
    const value=canon(row[f]);
    if(value.length>512)return {complete:false,reason:'field_too_large'};
    compact[f]=value;
   }
   rows.push(compact);
  }
  nextOffset+=page.rows.length;
 }
 if(nextOffset!==expectedTotal)return {complete:false,reason:'incomplete_page_coverage'};
 rows.sort((a,b)=>a.source_offer_key.localeCompare(b.source_offer_key,'en'));
 const digest=createHash('sha256').update(JSON.stringify([sourceScope,capturedAt,rows])).digest('hex');
 return {complete:true,scope:sourceScope,capturedAt,sourceTotal:expectedTotal,
  rows,digest,fieldCount:FIELDS.length};
}

export function detectBetweenCompactCaptures(previous,current,{nowMs=Date.now()}={}){
 if(previous?.complete!==true||current?.complete!==true)
  return {verified:false,events:[],reason:'incomplete_compact_capture'};
 return detectOfferUpdates(previous.rows,current.rows,{
  previousComplete:true,currentComplete:true,
  previousCapturedAt:previous.capturedAt,currentCapturedAt:current.capturedAt,
  scope:current.scope,previousScope:previous.scope,nowMs
 });
}
