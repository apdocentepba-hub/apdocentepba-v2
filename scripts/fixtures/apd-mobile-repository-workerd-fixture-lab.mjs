/**
 * Workerd-local repository adapter contract with synthetic SQL/ABC responses.
 * Never imported by production. All IDs, dates and secrets are fictitious.
 * Client-facing request only selects a predeclared QA scenario.
 */
import {
 createMobilePushServerRepositoryLab
} from '../mobile-push-server-repository-lab.mjs';
import {
 createWorkerMobilePushDryRunLab
} from '../mobile-push-worker-webcrypto-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEASE='77777777-7777-4777-8777-777777777777';
const OFFER='APD:LAB:SOURCE:456';
const SECRET='FAKE_SERVER_ONLY_SECRET_FOR_TESTS_DO_NOT_REUSE_123456789';
const NOW=Date.parse('2026-11-07T20:00:00Z');
const stamp=value=>new Date(value).toISOString();
const encoder=new TextEncoder();
const MODES=new Set(['ready','expired','closed','revoked','inactive',
 'stale','offline','lease-expired','cross-account','unauthorized','plan-down']);
async function claimFixture(){
 const secret=await crypto.subtle.importKey('raw',encoder.encode(SECRET),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=new Uint8Array(await crypto.subtle.sign('HMAC',secret,
  encoder.encode(JSON.stringify([USER,DEVICE,OFFER]))));
 return {
  event_key:Array.from(mac,x=>x.toString(16).padStart(2,'0')).join(''),
  user_id:USER,device_id:DEVICE,lease_id:LEASE,
  source_offer_key:OFFER,transport:'expo',attempts:1
 };
}
const json=(v,status=200)=>Response.json(v,{
 status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
export default {
 async fetch(request){
  const url=new URL(request.url);
  const mode=url.pathname.replace(/^\//,'');
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  if(!MODES.has(mode))return json({error:'not_found'},404);

  const claim=await claimFixture();
  const counts={claim:0,lease:0,device:0,plan:0,offer:0,cancel:0,retry:0};
  const database={
   async claim({limit,leaseSeconds}){
    counts.claim++;
    if(limit!==10||leaseSeconds!==60)throw Error('unexpected_sql_parameters');
    return [claim];
   },
   async readActiveLease({eventKey,leaseId}){
    counts.lease++;
    if(eventKey!==claim.event_key||leaseId!==LEASE)throw Error('wrong_lease');
    return {...claim,status:'leased',
     leased_until:stamp(NOW+(mode==='lease-expired'?-1000:60000))};
   },
   async readOwnedDevice({userId,deviceId}){
    counts.device++;
    if(userId!==USER||deviceId!==DEVICE)throw Error('wrong_user_query');
    return {id:DEVICE,user_id:mode==='cross-account'?OTHER:USER,
     platform:'android',transport:'expo',enabled:mode!=='revoked',
     opted_in:true,token_available:true,token_revoked:mode==='revoked',
     token_ciphertext:'PRIVATE_ONLY_FIXTURE_DO_NOT_RETURN'};
   },
   async cancel({eventKey,leaseId}){
    counts.cancel++;
    return eventKey===claim.event_key&&leaseId===LEASE;
   },
   async retry({eventKey,leaseId,sent}){
    counts.retry++;
    // A stale lease is recoverable only by a fresh SQL claim, not settle.
    return eventKey===claim.event_key&&leaseId===LEASE&&sent===false&&
     mode!=='lease-expired';
   }
  };
  const plans={
   async verify({userId}){
    counts.plan++;
    if(userId!==USER)throw Error('wrong_user_plan');
    if(mode==='plan-down')throw Error('fictional_plan_service_unavailable');
    return {user_id:USER,access_active:mode!=='inactive',
     verified_at:stamp(NOW-(mode==='stale'?600000:30000))};
   }
  };
  const offers={
   async verify({userId,sourceOfferKey}){
    counts.offer++;
    if(userId!==USER||sourceOfferKey!==OFFER)
     throw Error('wrong_source_offer');
    if(mode==='offline')throw Error('fictional_official_source_timeout');
    return {source_offer_key:OFFER,matched_user_id:USER,
     compatible:true,published:true,currently_available:true,
     source_current:true,estado:mode==='closed'?'CERRADA':'PUBLICADA',
     verified_at:stamp(NOW-30000),
     expires_at:stamp(NOW+(mode==='expired'?0:3600000))};
   }
  };
  const repository=createMobilePushServerRepositoryLab({
   database,plans,offers,now:()=>NOW
  });
  const run=createWorkerMobilePushDryRunLab({
   authorizeScheduledRun:async()=>mode!=='unauthorized',
   repository,hmacSecret:SECRET,now:()=>NOW
  });
  const result=await run({internalFixtureOnly:true});
  return json({...result,counts});
 }
};
