import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobilePushScheduledJobLab} from './mobile-push-worker-job-contract-lab.mjs';
import {evaluateMobilePushPreflightLab} from './mobile-push-dispatch-preflight-lab.mjs';
import {buildMobilePushCandidates} from './mobile-push-candidate-contract.mjs';
import {createPushOutboxLab} from './mobile-push-outbox-contract.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECRET='SYNTHETIC_SERVER_ONLY_TEST_HMAC_SECRET_123456789';
const OFFER='APD:JOB:FIXTURE';
const NOW=Date.parse('2026-11-07T20:00:00Z');
const iso=x=>new Date(x).toISOString();
function context(){
 return {user_id:USER,
  device:{id:DEVICE,user_id:USER,platform:'android',transport:'expo',
   opted_in:true,enabled:true,token_available:true,token_revoked:false},
  plan:{user_id:USER,access_active:true,verified_at:iso(NOW-60_000)},
  offer:{source_offer_key:OFFER,matched_user_id:USER,compatible:true,
   published:true,currently_available:true,source_current:true,
   verified_at:iso(NOW-60_000),expires_at:iso(NOW+3600_000),estado:'PUBLICADA'}
 };
}
function fixture({allow=true,ctx=context(),failure=false}={}){
 const calls={claim:0,context:0,cancel:0,retry:0,auth:0};
 const box=createPushOutboxLab({clock:()=>NOW});
 const events=buildMobilePushCandidates({
  authenticatedUserId:USER,verifiedPlan:{access_active:true},
  authorizedDevices:[{id:DEVICE,user_id:USER,platform:'android',
   transport:'expo',enabled:true,opted_in:true}],
  serverMatchedOffers:[{source_offer_key:OFFER,matched_user_id:USER,
   compatible:true,published:true,currently_available:true,
   expires_at:iso(NOW+3600_000)}],
  hmacSecret:SECRET,now:new Date(NOW)
 });
 assert.equal(box.enqueue(events).created,1);
 const repository={
  async claimReserved({limit}){calls.claim++;return box.claim({limit});},
  async loadVerifiedContext({eventKey,deviceId,leaseId}){
   calls.context++;
   assert.equal(eventKey,events[0].event_key);
   assert.equal(deviceId,DEVICE);
   assert.ok(leaseId);
   if(failure)throw Error('synthetic_sql_timeout');
   return ctx;
  },
  async cancelReserved({eventKey,leaseId}){
   calls.cancel++;return box.cancelEvent(eventKey,{leaseId});
  },
  async retryReserved({eventKey,leaseId}){
   calls.retry++;return box.settle({eventKey,leaseId,sent:false});
  }
 };
 const job=createMobilePushScheduledJobLab({
  authorizeScheduledRun:async()=>{calls.auth++;return allow;},
  repository,hmacSecret:SECRET,now:()=>NOW
 });
 return {job,box,calls,events};
}
test('scheduler denied: no claim, context lookup or event mutation',async()=>{
 const l=fixture({allow:false});
 const r=await l.job({isCron:true,admin:true});
 assert.deepEqual(r,{ok:false,reason:'not_authorized',provider_calls:0});
 assert.equal(l.calls.claim,0);
 assert.equal(l.box.summary().pending,1);
});
test('async repository port performs authoritative preflight without sending',async()=>{
 const l=fixture();
 const r=await l.job({});
 assert.equal(r.ok,true);
 assert.equal(r.ready.length,1);
 assert.equal(r.provider_calls,0);
 assert.equal(l.box.summary().leased,1);
 assert.equal(l.box.summary().sent,0);
 assert.equal(l.calls.context,1);
 assert.equal(l.calls.cancel,0);
});
test('revoked device produces durable-style cancel call with current lease',async()=>{
 const c=context();c.device.enabled=false;
 const l=fixture({ctx:c});
 const r=await l.job({});
 assert.equal(r.ready.length,0);
 assert.equal(r.cancelled[0],'device_unsubscribed_or_revoked');
 assert.equal(l.calls.cancel,1);
 assert.equal(l.box.summary().cancelled,1);
});
test('closed official offer cancels rather than ever reporting sent',async()=>{
 const c=context();c.offer.expires_at=iso(NOW);
 const l=fixture({ctx:c});
 const r=await l.job({});
 assert.equal(r.cancelled[0],'offer_already_expired');
 assert.equal(l.box.summary().sent,0);
 assert.equal(l.box.summary().cancelled,1);
});
test('repository outage is retried; neither raw exception nor token leaks',async()=>{
 const l=fixture({failure:true});
 const r=await l.job({});
 assert.equal(r.retried.length,1);
 assert.equal(l.calls.retry,1);
 assert.equal(l.box.summary().pending,1);
 assert.equal(l.box.summary().sent,0);
 assert.ok(!JSON.stringify(r).includes('synthetic_sql_timeout'));
 assert.ok(!JSON.stringify(r).includes(SECRET));
});
test('SQL UUID lease identifiers pass preflight syntax while identity stays HMAC-bound',()=>{
 const l=fixture();const lease=l.box.claim()[0];
 const decision=evaluateMobilePushPreflightLab({
  claim:{...lease,lease_id:'77777777-7777-4777-8777-777777777777'},
  context:context(),hmacSecret:SECRET,now:NOW
 });
 assert.equal(decision.action,'ready');
});
test('invalid batch fails closed, no provider call and no diagnostic leakage',async()=>{
 const l=fixture();
 const job=createMobilePushScheduledJobLab({
  authorizeScheduledRun:async()=>true,
  repository:{
   claimReserved:async()=>({not:'array'}),
   loadVerifiedContext:async()=>{throw Error('should_not_run');},
   cancelReserved:async()=>true,
   retryReserved:async()=>true
  },hmacSecret:SECRET,now:()=>NOW
 });
 const r=await job({});
 assert.deepEqual(r,{ok:false,reason:'repository_unavailable',provider_calls:0});
 assert.equal(l.box.summary().pending,1);
});
