/**
 * APDocentePBA — authorize-only Worker job (LAB, NO PROVIDER).
 *
 * Claim from SQL -> trusted context/recheck -> HMAC preflight -> atomic SQL
 * prepare_dispatch. The returned ticket never leaves this module. This
 * module cannot make provider HTTP calls or mark any event as delivered.
 *
 * PREPARED is NOT SENT. For real push, an explicitly authorized sender and
 * provider-level idempotency/reconciliation must be designed and tested.
 */
import {evaluateWorkerMobilePushPreflightLab}
 from './mobile-push-worker-webcrypto-lab.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable=Object.freeze({
 ok:false,reason:'authorization_storage_unavailable',provider_calls:0
});
const denied=Object.freeze({
 ok:false,reason:'not_authorized',provider_calls:0
});
export function createWorkerMobileAuthorizeOnlyLab({
 authorizeScheduledRun,repository,database,hmacSecret,
 now=()=>Date.now(),cryptoApi=globalThis.crypto
}={}){
 if(typeof authorizeScheduledRun!=='function'||typeof now!=='function'||
    typeof database?.prepareDispatch!=='function'||
    typeof hmacSecret!=='string'||hmacSecret.length<32||
    !repository||!['claimReserved','loadVerifiedContext',
     'cancelReserved','retryReserved'].every(
      key=>typeof repository[key]==='function'))
  throw Error('missing_authorization_lab_dependencies');

 return async function run(context){
  try{
   if((await authorizeScheduledRun(context))!==true)return denied;
  }catch{return denied;}

  let claimed;
  try{claimed=await repository.claimReserved({limit:10});}
  catch{return unavailable;}
  if(!Array.isArray(claimed)||claimed.length>10)return unavailable;

  let ready=0,prepared=0,cancelled=0,retried=0;
  for(const claim of claimed){
   let trusted=null;
   try{
    trusted=await repository.loadVerifiedContext({
     eventKey:claim?.event_key,leaseId:claim?.lease_id,
     userId:claim?.user_id,deviceId:claim?.device_id,
     sourceOfferKey:claim?.source_offer_key
    });
   }catch{}

   const decision=await evaluateWorkerMobilePushPreflightLab({
    claim,context:trusted,hmacSecret,cryptoApi,now:Number(now())
   });
   try{
    if(decision.action==='ready'){
     // This is the only point at which an event becomes authorized in DB.
     // Unique event key + current lease + device are checked atomically.
     // No sender receives the token, ticket or recipient from this lab.
     const ticket=await database.prepareDispatch({
      eventKey:claim.event_key,leaseId:claim.lease_id
     });
     if(typeof ticket==='string'&&UUID.test(ticket)){
      ready++;prepared++;
     }else if(ticket!==null){
      return unavailable;
     }else if(await repository.retryReserved({
      eventKey:claim.event_key,leaseId:claim.lease_id
     })){retried++;}
     continue;
    }
    if(decision.action==='cancel'){
     if(await repository.cancelReserved({
      eventKey:claim.event_key,leaseId:claim.lease_id
     }))cancelled++;
    }else if(await repository.retryReserved({
     eventKey:claim.event_key,leaseId:claim.lease_id
    })){retried++;}
   }catch{return unavailable;}
  }
  return Object.freeze({
   ok:true,ready,prepared,cancelled,retried,provider_calls:0
  });
 };
}
