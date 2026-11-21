// APD audit-only candidate payload; no transport, recipients, storage or side effects.
import {detectBetweenCompactCaptures} from './apd-offer-compact-capture.mjs';

const ALLOWED_TYPES=new Set(['offer_modified','official_state_changed']);
const MAX_EVENTS=500;
export function prepareOfferAuditBatch(previous,current,{nowMs=Date.now()}={}){
 const detection=detectBetweenCompactCaptures(previous,current,{nowMs});
 if(detection.verified!==true)return {verified:false,reason:detection.reason||'unverified_captures',events:[]};
 const events=detection.events.filter(e=>ALLOWED_TYPES.has(e.type)).map(e=>({
  event_key:e.event_key,
  source_offer_key:e.source_offer_key,
  type:e.type,
  field:e.field,
  before:e.before,
  after:e.after
 }));
 if(events.length>MAX_EVENTS)return {verified:false,reason:'too_many_events_for_audit',events:[]};
 return {
  verified:true,
  scope:current.scope,
  capturedAt:current.capturedAt,
  events
 };
}
