/**
 * APDocentePBA — final safety gate BEFORE any mobile push delivery.
 * LAB ONLY. No provider imports, network, DB, credentials or push send.
 *
 * Context MUST come from fresh server-side device/plan/current-offer lookups.
 * This gate deliberately does not expose device tokens or provider payload.
 * A "ready" result is NOT a delivery; production still needs durable atomic
 * outbox claims, dispatcher authorization, provider handling and audit.
 */
import {createHmac,timingSafeEqual} from 'node:crypto';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY=/^[A-Za-z0-9_.:|-]{1,160}$/;
const HEX=/^[a-f0-9]{64}$/;
const FINISHED=new Set(['ANULADA','ANULADO','CANCELADA','CANCELADO','CERRADA','CERRADO','DESIERTA','DESIERTO','DESIGNADA','DESIGNADO']);
const RESULT=Object.freeze({READY:'ready',CANCEL:'cancel',RETRY:'retry'});
const decision=(action,reason)=>Object.freeze({action,reason});

export function parseStrictPushInstant(value){
 if(typeof value!=='string')return null;
 const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))$/i);
 if(!m)return null;
 const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
 const hour=Number(m[4]),min=Number(m[5]),sec=Number(m[6]||0);
 const oh=Number(m[9]||0),om=Number(m[10]||0);
 if(year<2000||year>2100||month<1||month>12||day<1||day>31||
    hour>23||min>59||sec>59||oh>14||om>59||(oh===14&&om!==0))return null;
 const d=new Date(Date.UTC(year,month-1,day));
 if(d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||d.getUTCDate()!==day)return null;
 const timestamp=Date.parse(value);
 return Number.isFinite(timestamp)?timestamp:null;
}
function fresh(instant,now,maxAge){
 const ms=parseStrictPushInstant(instant);
 return ms!==null&&ms<=now+5_000&&now-ms>=-5_000&&now-ms<=maxAge;
}
function expectedEventKey({hmacSecret,userId,deviceId,offerKey}){
 return createHmac('sha256',hmacSecret)
  .update(JSON.stringify([userId,deviceId,offerKey])).digest('hex');
}
function equalHash(a,b){
 if(!HEX.test(a)||!HEX.test(b))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}

/**
 * No implicit trust of a client-supplied "verified" flag.
 * Caller is responsible for loading context via the authenticated server,
 * with no client-provided user/plan/offer fields.
 */
export function evaluateMobilePushPreflightLab({
 claim,context,hmacSecret,now=Date.now(),
 planMaxAgeMs=5*60_000,offerMaxAgeMs=15*60_000
}={}){
 if(!claim||!HEX.test(claim.event_key)||!UUID.test(claim.device_id)||
    typeof claim.lease_id!=='string'||!(/^(?:LAB-LEASE-[0-9]+|[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(claim.lease_id))||
    !['expo','fcm','apns'].includes(claim.transport))
  return decision(RESULT.CANCEL,'invalid_claim');
 // A missing/rotated server secret is an operational fault, never an excuse
 // to permanently delete valid queued notifications.
 if(typeof hmacSecret!=='string'||hmacSecret.length<32||
    !Number.isFinite(now)||!Number.isInteger(planMaxAgeMs)||planMaxAgeMs<1||
    planMaxAgeMs>3600000||!Number.isInteger(offerMaxAgeMs)||offerMaxAgeMs<1||
    offerMaxAgeMs>3600000)
  return decision(RESULT.RETRY,'server_configuration_unavailable');
 if(!context||typeof context!=='object')return decision(RESULT.RETRY,'context_unavailable');
 const {user_id:userId,device,plan,offer}=context;
 if(!UUID.test(userId||'')||!device||!plan||!offer)
  return decision(RESULT.RETRY,'incomplete_server_context');
 const key=offer.source_offer_key;
 if(typeof key!=='string'||!KEY.test(key))
  return decision(RESULT.CANCEL,'invalid_offer_identity');
 if(!equalHash(claim.event_key,expectedEventKey({
  hmacSecret,userId,deviceId:claim.device_id,offerKey:key
 })))return decision(RESULT.CANCEL,'event_context_mismatch');
 if(device.id!==claim.device_id||device.user_id!==userId||
    device.transport!==claim.transport||!['android','ios'].includes(device.platform))
  return decision(RESULT.CANCEL,'device_ownership_or_transport_mismatch');
 if(device.enabled!==true||device.opted_in!==true||
    device.token_available!==true||device.token_revoked===true)
  return decision(RESULT.CANCEL,'device_unsubscribed_or_revoked');
 if(plan.user_id!==userId||plan.access_active===false)
  return decision(RESULT.CANCEL,'plan_inactive_or_other_account');
 if(plan.access_active!==true||
    !fresh(plan.verified_at,now,planMaxAgeMs))
  return decision(RESULT.RETRY,'plan_verification_stale_or_unknown');
 if(offer.matched_user_id!==userId||offer.compatible!==true||
    offer.published!==true||offer.currently_available===false||
    FINISHED.has(String(offer.estado||'').trim().toUpperCase()))
  return decision(RESULT.CANCEL,'offer_not_eligible');
 if(offer.currently_available!==true||offer.source_current!==true||
    !fresh(offer.verified_at,now,offerMaxAgeMs))
  return decision(RESULT.RETRY,'offer_current_state_unverified');
 const expiration=parseStrictPushInstant(offer.expires_at);
 if(expiration===null)return decision(RESULT.RETRY,'offer_expiry_invalid_or_unknown');
 if(expiration<=now)return decision(RESULT.CANCEL,'offer_already_expired');
 return decision(RESULT.READY,'all_current_checks_passed');
}
/**
 * The dispatcher is a *dry-run* handoff, not a sender. Only metadata leaves
 * this function, never a raw token, offer details, or push provider payload.
 */
export async function dryRunMobilePushDispatchLab({
 outbox,loadContext,hmacSecret,now=()=>Date.now(),limit=10
}={}){
 if(!outbox||typeof outbox.claim!=='function'||
    typeof outbox.cancelEvent!=='function'||typeof outbox.settle!=='function'||
    typeof loadContext!=='function'||typeof now!=='function')
  throw Error('missing_lab_dependencies');
 const claims=await outbox.claim({limit});
 if(!Array.isArray(claims)||claims.length>limit)
  throw Error('invalid_lab_claim_batch');
 const ready=[],cancelled=[],retried=[];
 for(const claim of claims){
  let context;
  try{context=await loadContext(claim.event_key,claim.device_id,claim);}
  catch{context=null;}
  const result=evaluateMobilePushPreflightLab({
   claim,context,hmacSecret,now:Number(now())
  });
  if(result.action===RESULT.READY){
   // This is NOT a provider send, and does not call outbox.settle(sent:true).
   ready.push(Object.freeze({event_key:claim.event_key,lease_id:claim.lease_id,
    device_id:claim.device_id,transport:claim.transport}));
  }else if(result.action===RESULT.CANCEL){
   const applied=await outbox.cancelEvent(claim.event_key,{leaseId:claim.lease_id});
   if(applied)cancelled.push(result.reason);
  }else{
   const applied=await outbox.settle({eventKey:claim.event_key,
    leaseId:claim.lease_id,sent:false});
   if(applied)retried.push(result.reason);
  }
 }
 return Object.freeze({ready,cancelled,retried,provider_calls:0});
}
