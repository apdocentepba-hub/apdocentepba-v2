/* Presentation-only closing time formatter, based on the SAME guarded instant
 * used for alert eligibility. Never parse display labels as local deadlines.
 */
import {apdOfferDeadlineStatus} from "./apd-offer-close-guard.mjs";

export function apdMailClosingLabel(offer,nowMs=Date.now()){
  const status=apdOfferDeadlineStatus(offer,nowMs);
  if(!status.eligible) return {safe:false,text:"Cierre no verificable. Consultá ABC.",reason:status.reason};
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"America/Argentina/Buenos_Aires",
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23",hour12:false
  }).formatToParts(new Date(status.closes_at_ms));
  const get=t=>parts.find(p=>p.type===t)?.value||"";
  const text=get("day")+"/"+get("month")+"/"+get("year")+
    " a las "+get("hour")+":"+get("minute")+" hs (Argentina)";
  return {safe:true,text,closes_at_ms:status.closes_at_ms};
}
export function apdMailGeneratedAtLabel(nowMs=Date.now()){
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"America/Argentina/Buenos_Aires",
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23",hour12:false
  }).formatToParts(new Date(nowMs));
  const get=t=>parts.find(p=>p.type===t)?.value||"";
  return get("day")+"/"+get("month")+"/"+get("year")+
    " "+get("hour")+":"+get("minute")+" hs (Argentina)";
}
