import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import {
 evaluateWorkerMobilePushPreflightLab,parseWorkerPushInstant,
 createWorkerMobilePushDryRunLab
} from './mobile-push-worker-webcrypto-lab.mjs';
import {evaluateMobilePushPreflightLab} from './mobile-push-dispatch-preflight-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECRET='FAKE_SERVER_ONLY_SECRET_FOR_TESTS_DO_NOT_REUSE_123456789';
const OFFER='APD:LAB:SOURCE:456';
const LEASE='77777777-7777-4777-8777-777777777777';
const NOW=Date.parse('2026-11-07T20:00:00Z');
const iso=v=>new Date(v).toISOString();
const claim=()=>({
 user_id:USER,device_id:DEVICE,source_offer_key:OFFER,
 event_key:createHmac('sha256',SECRET).update(
  JSON.stringify([USER,DEVICE,OFFER])).digest('hex'),
 lease_id:LEASE,transport:'expo',attempts:1
});
const context=()=>({
 user_id:USER,
 device:{id:DEVICE,user_id:USER,transport:'expo',platform:'android',
  enabled:true,opted_in:true,token_available:true,token_revoked:false},
 plan:{user_id:USER,access_active:true,verified_at:iso(NOW-20_000)},
 offer:{source_offer_key:OFFER,matched_user_id:USER,compatible:true,
  published:true,currently_available:true,source_current:true,
  verified_at:iso(NOW-60_000),expires_at:iso(NOW+3600_000),
  estado:'PUBLICADA'}
});
const verify=(c=claim(),x=context(),opts={})=>
 evaluateWorkerMobilePushPreflightLab({
  claim:c,context:x,hmacSecret:SECRET,now:NOW,...opts
 });

test('real WebCrypto HMAC equals the original Node HMAC event contract',async()=>{
 const a=await verify();
 const b=evaluateMobilePushPreflightLab({
  claim:claim(),context:context(),hmacSecret:SECRET,now:NOW});
 assert.equal(a.action,'ready');
 assert.equal(b.action,'ready');
 assert.equal(a.reason,'all_current_checks_passed');
});
test('WebCrypto and Node preflight agree on unsafe outcomes',async()=>{
 const cases=[];
 const add=(c,x)=>cases.push([c,x]);
 let x=context();x.device.enabled=false;add(claim(),x);
 x=context();x.device.opted_in=false;add(claim(),x);
 x=context();x.plan.access_active=false;add(claim(),x);
 x=context();x.plan.verified_at=iso(NOW-10*60_000);add(claim(),x);
 x=context();x.offer.currently_available=false;add(claim(),x);
 x=context();x.offer.currently_available=null;add(claim(),x);
 x=context();x.offer.verified_at=iso(NOW-20*60_000);add(claim(),x);
 x=context();x.offer.expires_at=iso(NOW);add(claim(),x);
 x=context();x.offer.expires_at='2026-11-07';add(claim(),x);
 x=context();x.offer.source_offer_key='APD:OTHER';add(claim(),x);
 x=context();x.user_id=OTHER;add(claim(),x);
 const bad=claim();bad.event_key='f'.repeat(64);add(bad,context());
 for(const [c,data] of cases){
  const worker=await verify(c,data);
  const node=evaluateMobilePushPreflightLab({
   claim:c,context:data,hmacSecret:SECRET,now:NOW});
  assert.equal(worker.action,node.action,JSON.stringify(data));
  assert.notEqual(worker.action,'ready');
 }
});
test('SQL claim binds immutable user, device and source key, not caller flags',async()=>{
 const mutations=[
  {user_id:OTHER},{device_id:OTHER},{source_offer_key:'APD:OTHER'},
  {event_key:'0'.repeat(64)},{transport:'fcm'},
  {lease_id:'BAD'},{source_offer_key:''},{user_id:''}
 ];
 for(const mutation of mutations){
  const response=await verify({...claim(),...mutation});
  assert.equal(response.action,'cancel',JSON.stringify(mutation));
 }
});
test('no server secret or crypto means retry, not consent or delivery',async()=>{
 for(const opts of [
  {hmacSecret:undefined},
  {hmacSecret:'short'},
  {cryptoApi:null},
  {cryptoApi:{subtle:{importKey:async()=>{throw Error('unavailable')}}}}
 ]){
  const d=await verify(claim(),context(),opts);
  assert.equal(d.action,'retry');
 }
});
test('timestamp checks are strict and timezone aware in WebCrypto contract',()=>{
 for(const v of ['2026-02-31T20:00:00Z',
  '2026-11-07T20:00:00','2026-11-07',
  '2026-11-07T30:00:00Z','2026-11-07T20:00:00+14:30'])
  assert.equal(parseWorkerPushInstant(v),null,v);
 assert.equal(parseWorkerPushInstant('2026-11-07T17:00:00-03:00'),NOW);
});
function job({allowed=true,data=context(),fail=false,claims=null}={}){
 const counts={auth:0,claim:0,lookup:0,cancel:0,retry:0,sender:0};
 const dbClaims=claims??[claim()];
 const repository={
  claimReserved:async({limit})=>{counts.claim++;assert.equal(limit,10);return dbClaims;},
  loadVerifiedContext:async(args)=>{
   counts.lookup++;
   assert.equal(args.userId,USER);
   assert.equal(args.sourceOfferKey,OFFER);
   assert.equal(args.leaseId,LEASE);
   if(fail)throw Error('synthetic_database_offline');
   return data;
  },
  cancelReserved:async({eventKey,leaseId})=>{
   counts.cancel++;assert.equal(eventKey,claim().event_key);
   assert.equal(leaseId,LEASE);return true;
  },
  retryReserved:async({eventKey,leaseId})=>{
   counts.retry++;assert.equal(eventKey,claim().event_key);
   assert.equal(leaseId,LEASE);return true;
  }
 };
 return {
  counts,run:createWorkerMobilePushDryRunLab({
   authorizeScheduledRun:async()=>{counts.auth++;return allowed;},
   repository,hmacSecret:SECRET,now:()=>NOW
  })
 };
}
test('unauthorized schedule never obtains SQL lease or loads user',async()=>{
 const j=job({allowed:false});
 const r=await j.run({client_claims_admin:true});
 assert.deepEqual(r,{ok:false,reason:'not_authorized',provider_calls:0});
 assert.equal(j.counts.claim,0);
 assert.equal(j.counts.lookup,0);
});
test('authorized dry run leaves ready lease untouched and reports zero sends',async()=>{
 const j=job();
 const r=await j.run({});
 assert.deepEqual(r,{ok:true,ready:1,cancelled:0,retried:0,provider_calls:0});
 assert.equal(j.counts.cancel,0);
 assert.equal(j.counts.retry,0);
});
test('revoked device forces SQL lease cancellation, never a send',async()=>{
 const data=context();data.device.enabled=false;
 const j=job({data});
 const r=await j.run({});
 assert.deepEqual(r,{ok:true,ready:0,cancelled:1,retried:0,provider_calls:0});
 assert.equal(j.counts.cancel,1);
});
test('closed ABC offer forces lease cancellation after selection',async()=>{
 const data=context();data.offer.estado='CERRADA';
 const j=job({data});
 const r=await j.run({});
 assert.equal(r.cancelled,1);
 assert.equal(r.provider_calls,0);
});
test('stale plan retries safely without claiming successful delivery',async()=>{
 const data=context();data.plan.verified_at=iso(NOW-600_000);
 const j=job({data});
 const r=await j.run({});
 assert.equal(r.retried,1);
 assert.equal(j.counts.retry,1);
 assert.equal(r.ready,0);
});
test('outage of server source lookup retries; errors are never exposed',async()=>{
 const j=job({fail:true});
 const r=await j.run({});
 assert.equal(r.retried,1);
 assert.ok(!JSON.stringify(r).includes('synthetic_database_offline'));
 assert.ok(!JSON.stringify(r).includes(SECRET));
});
test('fail closed if queue returns invalid batch, without reading context',async()=>{
 const j=job({claims:{not:'an array'}});
 const r=await j.run({});
 assert.deepEqual(r,{ok:false,reason:'repository_unavailable',provider_calls:0});
 assert.equal(j.counts.lookup,0);
});
test('no provider, fetch, email, network, Node crypto or token extraction imports',()=>{
 const code=fs.readFileSync(
  new URL('./mobile-push-worker-webcrypto-lab.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/from\s*['"]node:|\bfetch\s*\(|XMLHttpRequest|firebase-admin|expo-server-sdk|console\.log|openMobilePushToken/);
 assert.match(code,/provider_calls:0/);
});
