/**
 * Cloudflare Worker-compatible HMAC gate. Lab contract: NO network, DB,
 * providers, credentials, public endpoint or production side effects.
 * Unlike the Node-only evaluator, this uses the standard Web Crypto API.
 * Claim MUST originate from SQL lease; context MUST come from trusted server
 * lookups of account, device, plan and the exact source offer.
 */
const UID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[0-9a-f]{64}$/;
const OFFER_KEY=/^[A-Za-z0-9_.:|-]{1,160}$/;
const FINISHED=new Set(['ANULADA','ANULADO','CANCELADA','CANCELADO','CERRADA','CERRADO','DESIERTA','DESIERTO','DESIGNADA','DESIGNADO']);
const decision=(action,reason)=>Object.freeze({action,reason});
const encoder=new TextEncoder();

export function parseWorkerPushInstant(value){
 if(typeof value!=='string')return null;
 const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))$/i);
 if(!m)return null;
 const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
 const hour=Number(m[4]),minute=Number(m[5]),sec=Number(m[6]||0);
 const oh=Number(m[9]||0),om=Number(m[10]||0);
 if(year<2000||year>2100||month<1||month>12||day<1||day>31||
    hour>23||minute>59||sec>59||oh>14||om>59||(oh===14&&om!==0))return null;
 const d=new Date(Date.UTC(year,month-1,day));
 if(d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||d.getUTCDate()!==day)return null;
 const timestamp=Date.parse(value);
 return Number.isFinite(timestamp)?timestamp:null;
}
function fresh(value,now,maxAge){
 const v=parseWorkerPushInstant(value);
 return v!==null&&v<=now+5_000&&now-v>=-5_000&&now-v<=maxAge;
}
async function eventKeyMatches(secret,claim,cryptoApi){
 const raw=encoder.encode(secret);
 const key=await cryptoApi.subtle.importKey('raw',raw,
   {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=new Uint8Array(await cryptoApi.subtle.sign('HMAC',key,
  encoder.encode(JSON.stringify([claim.user_id,claim.device_id,claim.source_offer_key]))));
 if(mac.length!==32)return false;
 // Constant time over 32 bytes, with no Buffer or Node dependency.
 let diff=0;
 for(let i=0;i<32;i++){
  const byte=parseInt(claim.event_key.slice(i*2,i*2+2),16);
  diff|=mac[i]^byte;
 }
 return diff===0;
}
export async function evaluateWorkerMobilePushPreflightLab({
 claim,context,hmacSecret,now=Date.now(),cryptoApi=globalThis.crypto,
 planMaxAgeMs=300_000,offerMaxAgeMs=900_000
}={}){
 if(!claim||!HEX.test(claim.event_key||'')||!UID.test(claim.user_id||'')||
    !UID.test(claim.device_id||'')||!UID.test(claim.lease_id||'')||
    !OFFER_KEY.test(claim.source_offer_key||'')||
    !['expo','fcm','apns'].includes(claim.transport))
  return decision('cancel','invalid_sql_claim');
 if(typeof hmacSecret!=='string'||hmacSecret.length<32||
    !cryptoApi?.subtle||typeof cryptoApi.subtle.importKey!=='function'||
    typeof cryptoApi.subtle.sign!=='function'||!Number.isFinite(now)||
    !Number.isInteger(planMaxAgeMs)||planMaxAgeMs<1||planMaxAgeMs>3600000||
    !Number.isInteger(offerMaxAgeMs)||offerMaxAgeMs<1||offerMaxAgeMs>3600000)
  return decision('retry','crypto_or_configuration_unavailable');
 if(!context||typeof context!=='object')return decision('retry','context_unavailable');
 const {user_id:userId,device,plan,offer}=context;
 if(userId!==claim.user_id||!device||!plan||!offer)
  return decision('cancel','sql_claim_context_mismatch');
 if(offer.source_offer_key!==claim.source_offer_key)
  return decision('cancel','offer_identity_mismatch');
 try{
  if(!(await eventKeyMatches(hmacSecret,claim,cryptoApi)))
   return decision('cancel','event_hmac_mismatch');
 }catch{return decision('retry','crypto_or_configuration_unavailable');}
 if(device.id!==claim.device_id||device.user_id!==userId||
    device.transport!==claim.transport||!['android','ios'].includes(device.platform))
  return decision('cancel','device_ownership_or_transport_mismatch');
 if(device.enabled!==true||device.opted_in!==true||
    device.token_available!==true||device.token_revoked===true)
  return decision('cancel','device_unsubscribed_or_revoked');
 if(plan.user_id!==userId||plan.access_active===false)
  return decision('cancel','plan_inactive_or_other_account');
 if(plan.access_active!==true||!fresh(plan.verified_at,now,planMaxAgeMs))
  return decision('retry','plan_verification_stale_or_unknown');
 if(offer.matched_user_id!==userId||offer.compatible!==true||
    offer.published!==true||offer.currently_available===false||
    FINISHED.has(String(offer.estado||'').trim().toUpperCase()))
  return decision('cancel','offer_not_eligible');
 if(offer.currently_available!==true||offer.source_current!==true||
    !fresh(offer.verified_at,now,offerMaxAgeMs))
  return decision('retry','offer_current_state_unverified');
 const expiry=parseWorkerPushInstant(offer.expires_at);
 if(expiry===null)return decision('retry','offer_expiry_invalid_or_unknown');
 if(expiry<=now)return decision('cancel','offer_already_expired');
 return decision('ready','all_current_checks_passed');
}

/**
 * Worker-compatible orchestration dry run. No fetch/HTTP handler/scheduled
 * export. An actual Worker may only wrap this after explicit authorization,
 * trusted SQL repositories and source verification have been implemented.
 */
export function createWorkerMobilePushDryRunLab({
 authorizeScheduledRun,repository,hmacSecret,now=()=>Date.now(),cryptoApi=globalThis.crypto
}={}){
 if(typeof authorizeScheduledRun!=='function'||typeof now!=='function'||
    !repository||!['claimReserved','loadVerifiedContext','cancelReserved','retryReserved']
     .every(k=>typeof repository[k]==='function'))
  throw Error('missing_lab_dependencies');
 const denied=Object.freeze({ok:false,reason:'not_authorized',provider_calls:0});
 const failed=Object.freeze({ok:false,reason:'repository_unavailable',provider_calls:0});
 return async function run(context){
  let authorized=false;
  try{authorized=(await authorizeScheduledRun(context))===true;}catch{return denied;}
  if(!authorized)return denied;
  let claims;
  try{claims=await repository.claimReserved({limit:10});}
  catch{return failed;}
  if(!Array.isArray(claims)||claims.length>10)return failed;
  let ready=0,cancelled=0,retried=0;
  for(const claim of claims){
   let data=null;
   try{
    data=await repository.loadVerifiedContext({
     eventKey:claim?.event_key,deviceId:claim?.device_id,
     leaseId:claim?.lease_id,userId:claim?.user_id,
     sourceOfferKey:claim?.source_offer_key
    });
   }catch{}
   const result=await evaluateWorkerMobilePushPreflightLab({
    claim,context:data,hmacSecret,now:Number(now()),cryptoApi
   });
   try{
    if(result.action==='ready'){ready++;continue;}
    if(result.action==='cancel'){
     if(await repository.cancelReserved({eventKey:claim.event_key,leaseId:claim.lease_id}))
      cancelled++;
    }else if(await repository.retryReserved({eventKey:claim.event_key,leaseId:claim.lease_id}))
     retried++;
   }catch{return failed;}
  }
  // All counters represent reservations, never successful deliveries.
  return Object.freeze({ok:true,ready,cancelled,retried,provider_calls:0});
 };
}
