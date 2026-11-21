/**
 * Isolated workerd test fixture. This is NOT a deployable Worker and MUST NOT
 * be mounted in any production route or bound to live services.
 * All accounts, offers, dates, leases and keys here are fictional constants.
 * Miniflare dispatches synthetic local requests against this module in CI.
 */
import {
 evaluateWorkerMobilePushPreflightLab,
 createWorkerMobilePushDryRunLab
} from '../mobile-push-worker-webcrypto-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEASE='77777777-7777-4777-8777-777777777777';
const OFFER='APD:LAB:SOURCE:456';
const SECRET='FAKE_SERVER_ONLY_SECRET_FOR_TESTS_DO_NOT_REUSE_123456789';
const NOW=Date.parse('2026-11-07T20:00:00Z');
const iso=x=>new Date(x).toISOString();
const encode=new TextEncoder();
const CASES=new Set([
 'ready','expired','closed','revoked','stale-plan',
 'forged-hmac','mismatch-user','missing-context','missing-secret',
 'mismatch-transport','unavailable','unauthorized'
]);
async function createClaim(){
 const key=await crypto.subtle.importKey('raw',encode.encode(SECRET),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,
  encode.encode(JSON.stringify([USER,DEVICE,OFFER]))));
 const event_key=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
 return {
  event_key,user_id:USER,device_id:DEVICE,lease_id:LEASE,
  source_offer_key:OFFER,transport:'expo',attempts:1
 };
}
function createContext(){
 return {
  user_id:USER,
  device:{id:DEVICE,user_id:USER,platform:'android',transport:'expo',
   enabled:true,opted_in:true,token_available:true,token_revoked:false},
  plan:{user_id:USER,access_active:true,verified_at:iso(NOW-20_000)},
  offer:{source_offer_key:OFFER,matched_user_id:USER,
   compatible:true,published:true,currently_available:true,
   source_current:true,estado:'PUBLICADA',
   verified_at:iso(NOW-60_000),expires_at:iso(NOW+3600_000)}
 };
}
function change(mode,claim,data){
 if(mode==='expired')data.offer.expires_at=iso(NOW);
 if(mode==='closed')data.offer.estado='CERRADA';
 if(mode==='revoked')data.device.enabled=false;
 if(mode==='stale-plan')data.plan.verified_at=iso(NOW-600_000);
 if(mode==='forged-hmac')claim.event_key='f'.repeat(64);
 if(mode==='mismatch-user')data.user_id=OTHER;
 if(mode==='missing-context'||mode==='unavailable')return null;
 if(mode==='mismatch-transport')claim.transport='fcm';
 return data;
}
const json=(value,status=200)=>Response.json(value,{
 status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
export default {
 async fetch(request){
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  const url=new URL(request.url);
  const segments=url.pathname.split('/').filter(Boolean);
  if(segments.length!==2||!['case','dryrun'].includes(segments[0])||
     !CASES.has(segments[1]))return json({error:'not_found'},404);
  const [kind,mode]=segments;
  const claim=await createClaim();
  const context=change(mode,claim,createContext());
  if(kind==='case'){
   const result=await evaluateWorkerMobilePushPreflightLab({
    claim,context,hmacSecret:mode==='missing-secret'?null:SECRET,
    now:NOW
   });
   return json(result);
  }
  const counters={claims:0,lookups:0,cancels:0,retries:0};
  const repository={
   async claimReserved({limit}){
    counters.claims++;
    if(limit!==10)throw Error('unexpected_limit');
    return [claim];
   },
   async loadVerifiedContext({eventKey,deviceId,leaseId,sourceOfferKey}){
    counters.lookups++;
    if(eventKey!==claim.event_key||deviceId!==DEVICE||
       leaseId!==LEASE||sourceOfferKey!==OFFER)
     throw Error('incorrect_server_claim');
    if(mode==='unavailable')throw Error('synthetic_read_failure');
    return context;
   },
   async cancelReserved({eventKey,leaseId}){
    counters.cancels++;
    return eventKey===claim.event_key&&leaseId===LEASE;
   },
   async retryReserved({eventKey,leaseId}){
    counters.retries++;
    return eventKey===claim.event_key&&leaseId===LEASE;
   }
  };
  const job=createWorkerMobilePushDryRunLab({
   authorizeScheduledRun:async()=>mode!=='unauthorized',
   repository,
   hmacSecret:mode==='missing-secret'?null:SECRET,
   now:()=>NOW
  });
  const outcome=await job({fixture:true});
  // No provider call, no token, no real endpoint or external binding.
  return json({...outcome,counters});
 }
};
