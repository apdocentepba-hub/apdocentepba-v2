/** One-event sender candidate. No default fetch, no cron or public route.
 * Provider port is server-injected. Only a successful durable consume permits
 * the single submission; uncertain outcomes NEVER cause automatic resend.
 */
import {buildAndroidExpoPayload} from './mobile-push-android-payload-lab.mjs';
import {openBoundMobilePushRecipient} from './mobile-push-token-crypto-lab.mjs';
import {parseWorkerPushInstant} from './mobile-push-worker-webcrypto-lab.mjs';
import {classifyExpoPushTicketLab} from './mobile-push-provider-response-replay-lab.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function createAndroidExpoDispatchLab({authorizeRun,repository,database,submit,keys,hmacSecret,clock=Date.now}={}){
 if(typeof authorizeRun!=='function'||typeof submit!=='function'||typeof clock!=='function'||
 !['claimReserved','loadVerifiedContext','cancelReserved','retryReserved'].every(k=>typeof repository?.[k]==='function')||
 !['readOwnedExpoRecipient','prepareDispatch','consumeDispatch','recordExpoTicket','resolveWithoutProvider'].every(k=>typeof database?.[k]==='function')||
 !keys?.encryptionKey||!keys?.hmacKey||keys.encryptionKey===keys.hmacKey||typeof hmacSecret!=='string'||hmacSecret.length<32)
 throw Error('invalid_sender_dependencies');
 return async function run(runContext){
  let calls=0;
  const result=state=>Object.freeze({state,submission_attempts:calls,delivery_to_device_confirmed:false});
  try{if(await authorizeRun(runContext)!==true)return result('denied');}catch{return result('denied');}
  let claim,dispatchId;
  try{
   const claims=await repository.claimReserved({limit:1});
   if(!Array.isArray(claims)||claims.length>1)return result('claim_unverified');
   if(!claims.length)return result('empty');
   claim=claims[0];
   const context=await repository.loadVerifiedContext({eventKey:claim.event_key,leaseId:claim.lease_id,userId:claim.user_id,deviceId:claim.device_id,sourceOfferKey:claim.source_offer_key});
   const row=await database.readOwnedExpoRecipient({userId:claim.user_id,deviceId:claim.device_id});
   if(!row){await repository.cancelReserved({eventKey:claim.event_key,leaseId:claim.lease_id});return result('recipient_unavailable');}
   const recipient=await openBoundMobilePushRecipient({row,userId:claim.user_id,deviceId:claim.device_id,encryptionKey:keys.encryptionKey,hmacKey:keys.hmacKey});
   const built=await buildAndroidExpoPayload({claim,context,recipient,hmacSecret,clock});
   if(built.action!=='ready'){
    const fn=built.action==='cancel'?'cancelReserved':'retryReserved';
    await repository[fn]({eventKey:claim.event_key,leaseId:claim.lease_id});return result('preflight_blocked');
   }
   dispatchId=await database.prepareDispatch({eventKey:claim.event_key,leaseId:claim.lease_id});
   if(typeof dispatchId!=='string'||!UUID.test(dispatchId))return result('authorization_unconfirmed');
   if(await database.consumeDispatch({eventKey:claim.event_key,dispatchId,tokenHash:recipient.tokenHash})!==true)return result('consumption_denied');
   const expiry=parseWorkerPushInstant(context.offer.expires_at),now=clock();
   const ttl=Math.min(built.payload.ttl,Math.floor((expiry-now-5000)/1000));
   if(!Number.isFinite(now)||ttl<1){
    await database.resolveWithoutProvider({eventKey:claim.event_key,dispatchId,outcome:'uncertain'});return result('expired_after_consumption');
   }
   calls=1;
   const classified=classifyExpoPushTicketLab(await submit(Object.freeze({...built.payload,ttl})));
   if(classified.state==='awaiting_receipt'&&classified.receiptId){
    const stored=await database.recordExpoTicket({eventKey:claim.event_key,dispatchId,ticketId:classified.receiptId});
    if(stored===true)return result('awaiting_receipt');
   }
   const outcome=['rejected','invalid_device'].includes(classified.state)?'rejected':'uncertain';
   await database.resolveWithoutProvider({eventKey:claim.event_key,dispatchId,outcome});
   return result(outcome==='rejected'?'rejected':'uncertain');
  }catch{
   if(claim&&typeof dispatchId==='string'&&UUID.test(dispatchId)){
    try{await database.resolveWithoutProvider({eventKey:claim.event_key,dispatchId,outcome:'uncertain'});}catch{}
   }
   return result('uncertain');
  }
 };
}
