import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {
 createMobilePushServerRepositoryLab
} from './mobile-push-server-repository-lab.mjs';
import {
 createWorkerMobilePushDryRunLab
} from './mobile-push-worker-webcrypto-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OFFER='APD:LAB:SOURCE:456';
const LEASE='77777777-7777-4777-8777-777777777777';
const SECRET='FAKE_SERVER_ONLY_SECRET_FOR_TESTS_DO_NOT_REUSE_123456789';
const NOW=Date.parse('2026-11-07T20:00:00Z');
const iso=t=>new Date(t).toISOString();
const EVENT=createHmac('sha256',SECRET)
 .update(JSON.stringify([USER,DEVICE,OFFER])).digest('hex');
function fixture({
 allow=true,closed=false,expired=false,revoked=false,
 planInactive=false,planStale=false,sourceDown=false,
 leaseStale=false,wrongDeviceOwner=false,dbDown=false,duplicate=false
}={}){
 const calls={claim:0,lease:0,device:0,plan:0,offer:0,cancel:0,retry:0,sent:0,auth:0};
 const claim={
  event_key:EVENT,user_id:USER,device_id:DEVICE,lease_id:LEASE,
  source_offer_key:OFFER,transport:'expo',attempts:1
 };
 const database={
  async claim({limit,leaseSeconds}){
   calls.claim++;
   assert.equal(limit,10);assert.equal(leaseSeconds,60);
   if(dbDown)throw Error('private_postgres_unavailable');
   return duplicate?[claim,claim]:[claim];
  },
  async readActiveLease({eventKey,leaseId}){
   calls.lease++;
   assert.equal(eventKey,EVENT);assert.equal(leaseId,LEASE);
   return {...claim,status:'leased',leased_until:iso(NOW+(leaseStale?-5_000:60_000))};
  },
  async readOwnedDevice({userId,deviceId}){
   calls.device++;
   assert.equal(userId,USER);assert.equal(deviceId,DEVICE);
   return {
    id:DEVICE,user_id:wrongDeviceOwner?OTHER:USER,
    platform:'android',transport:'expo',opted_in:true,
    enabled:!revoked,token_available:true,token_revoked:revoked,
    token_ciphertext:'SHOULD_NEVER_LEAVE_DB',
    email:'SHOULD_NEVER_LEAVE_DB'
   };
  },
  async cancel({eventKey,leaseId}){
   calls.cancel++;
   assert.equal(eventKey,EVENT);assert.equal(leaseId,LEASE);
   return true;
  },
  async retry({eventKey,leaseId,sent}){
   calls.retry++;
   assert.equal(eventKey,EVENT);assert.equal(leaseId,LEASE);
   assert.equal(sent,false);
   if(sent)calls.sent++;
   // SQL apd_mobile_finish_push returns false for an expired lease.
   return !leaseStale;
  }
 };
 const plans={
  async verify({userId}){
   calls.plan++;assert.equal(userId,USER);
   return {user_id:USER,access_active:!planInactive,
    verified_at:iso(NOW-(planStale?700_000:40_000)),
    internal_billing_id:'SHOULD_NEVER_LEAVE_PLAN'
   };
  }
 };
 const offers={
  async verify({userId,sourceOfferKey}){
   calls.offer++;
   assert.equal(userId,USER);assert.equal(sourceOfferKey,OFFER);
   if(sourceDown)throw Error('synthetic_abc_timeout');
   return {source_offer_key:OFFER,matched_user_id:USER,
    compatible:true,published:true,currently_available:true,
    source_current:true,estado:closed?'CERRADA':'PUBLICADA',
    verified_at:iso(NOW-40_000),
    expires_at:iso(NOW+(expired?0:3_600_000)),
    personal_score:'SHOULD_NEVER_LEAVE_OFFER'
   };
  }
 };
 const repository=createMobilePushServerRepositoryLab({
  database,plans,offers,now:()=>NOW
 });
 const run=createWorkerMobilePushDryRunLab({
  authorizeScheduledRun:async()=>{
   calls.auth++;return allow;
  },repository,hmacSecret:SECRET,now:()=>NOW
 });
 return {calls,claim,database,plans,offers,repository,run};
}

test('trusted SQL → device → plan → ABC read → ready, no provider or database sent',async()=>{
 const f=fixture();
 const result=await f.run({isAdmin:'untrusted'});
 assert.deepEqual(result,{ok:true,ready:1,cancelled:0,retried:0,provider_calls:0});
 assert.equal(f.calls.claim,1);
 assert.equal(f.calls.lease,1);
 assert.equal(f.calls.device,1);
 assert.equal(f.calls.plan,1);
 assert.equal(f.calls.offer,1);
 assert.equal(f.calls.sent,0);
 assert.equal(f.calls.cancel,0);
 assert.equal(f.calls.retry,0);
});
test('untrusted scheduler cannot even claim any event',async()=>{
 const f=fixture({allow:false});
 assert.equal((await f.run({isAdmin:true})).reason,'not_authorized');
 assert.equal(f.calls.claim,0);
 assert.equal(f.calls.lease,0);
});
for(const [name,options] of [
 ['closed offer',{closed:true}],
 ['expired offer',{expired:true}],
 ['revoked device',{revoked:true}],
 ['inactive plan',{planInactive:true}],
 ['cross-account device',{wrongDeviceOwner:true}]
]){
 test(name+' cancels only the current reserved lease',async()=>{
  const f=fixture(options);
  const r=await f.run({});
  assert.deepEqual(r,{ok:true,ready:0,cancelled:1,retried:0,provider_calls:0});
  assert.equal(f.calls.cancel,1);
  assert.equal(f.calls.sent,0);
 });
}
for(const [name,options] of [
 ['stale plan',{planStale:true}],
 ['ABC lookup outage',{sourceDown:true}],
 ['expired SQL lease',{leaseStale:true}],
 ['private database outage',{dbDown:true}]
]){
 test(name+' fails closed without a provider call',async()=>{
  const f=fixture(options);
  const r=await f.run({});
  if(options.dbDown){
   assert.equal(r.ok,false);
   assert.equal(r.reason,'repository_unavailable');
  }else{
   assert.equal(r.retried,options.leaseStale?0:1);
   assert.equal(f.calls.retry,1);
  }
  assert.equal(r.provider_calls,0);
  assert.equal(f.calls.sent,0);
  assert.ok(!JSON.stringify(r).includes('synthetic_abc_timeout'));
  assert.ok(!JSON.stringify(r).includes('private_postgres_unavailable'));
 });
}
test('duplicated SQL claims reject entire batch before any context loads',async()=>{
 const f=fixture({duplicate:true});
 const r=await f.run({});
 assert.equal(r.ok,false);
 assert.equal(f.calls.lease,0);
 assert.equal(r.provider_calls,0);
});
test('server context does not include raw push token, user email or billing metadata',async()=>{
 const f=fixture();
 const [claim]=await f.repository.claimReserved({limit:10});
 const ctx=await f.repository.loadVerifiedContext({
  eventKey:claim.event_key,deviceId:claim.device_id,leaseId:claim.lease_id,
  userId:claim.user_id,sourceOfferKey:claim.source_offer_key
 });
 const text=JSON.stringify(ctx);
 for(const secret of [
  'SHOULD_NEVER_LEAVE_DB','SHOULD_NEVER_LEAVE_PLAN','SHOULD_NEVER_LEAVE_OFFER'
 ])assert.ok(!text.includes(secret),secret);
 assert.equal(ctx.offer.source_offer_key,OFFER);
 assert.equal(ctx.plan.user_id,USER);
});
test('fabricated reference cannot load real plan/device and cannot cancel valid claim',async()=>{
 const f=fixture();
 await f.repository.claimReserved({limit:10});
 await assert.rejects(()=>f.repository.loadVerifiedContext({
  eventKey:EVENT,leaseId:LEASE,userId:OTHER,deviceId:DEVICE,sourceOfferKey:OFFER
 }),/untrusted_claim_reference/);
 assert.equal(f.calls.lease,0);
 assert.equal(f.calls.plan,0);
 assert.equal(await f.repository.cancelReserved({eventKey:EVENT,
  leaseId:'66666666-6666-4666-8666-666666666666'}),false);
 assert.equal(f.calls.cancel,0);
});
test('retry method never turns into mark-as-sent, even when caller supplies sent:true',async()=>{
 const f=fixture();
 await f.repository.claimReserved({limit:10});
 assert.equal(await f.repository.retryReserved({
  eventKey:EVENT,leaseId:LEASE,sent:true
 }),true);
 assert.equal(f.calls.sent,0);
 assert.equal(f.calls.retry,1);
});
test('invalid dependencies, limits and SQL claims are rejected before a source lookup',async()=>{
 assert.throws(()=>createMobilePushServerRepositoryLab({}),/missing_server_dependency/);
 const f=fixture();
 await assert.rejects(()=>f.repository.claimReserved({limit:100}),/invalid_claim_limit/);
 assert.equal(f.calls.claim,0);
 const invalid={
  ...f.claim,event_key:'not_a_hash'
 };
 f.database.claim=async()=>[invalid];
 await assert.rejects(()=>f.repository.claimReserved({limit:10}),/invalid_sql_claim/);
 assert.equal(f.calls.plan,0);
});
