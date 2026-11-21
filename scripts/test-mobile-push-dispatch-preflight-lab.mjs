import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
 evaluateMobilePushPreflightLab,parseStrictPushInstant,
 dryRunMobilePushDispatchLab
} from './mobile-push-dispatch-preflight-lab.mjs';
import {buildMobilePushCandidates} from './mobile-push-candidate-contract.mjs';
import {createPushOutboxLab} from './mobile-push-outbox-contract.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OFFER='APD:CURRENT:TEST';
const SECRET='FAKE_ONLY_DISPATCH_SECRET_FOR_OFFLINE_TEST_0123456789';
const NOW=Date.parse('2026-11-07T20:00:00Z');
const ISO=ms=>new Date(ms).toISOString();
let tick=NOW;
const makeContext=()=>({
 user_id:USER,
 device:{id:DEVICE,user_id:USER,platform:'android',transport:'expo',
  opted_in:true,enabled:true,token_available:true,token_revoked:false},
 plan:{user_id:USER,access_active:true,verified_at:ISO(NOW-60_000)},
 offer:{source_offer_key:OFFER,matched_user_id:USER,compatible:true,
  published:true,currently_available:true,source_current:true,
  estado:'PUBLICADA',verified_at:ISO(NOW-2*60_000),
  expires_at:ISO(NOW+60*60_000)}
});
function lab(){
 tick=NOW;
 const outbox=createPushOutboxLab({clock:()=>tick});
 const candidates=buildMobilePushCandidates({
  authenticatedUserId:USER,verifiedPlan:{access_active:true},
  serverMatchedOffers:[{source_offer_key:OFFER,matched_user_id:USER,
   compatible:true,published:true,currently_available:true,
   expires_at:ISO(NOW+60*60_000)}],
  authorizedDevices:[{id:DEVICE,user_id:USER,platform:'android',
   transport:'expo',enabled:true,opted_in:true}],
  hmacSecret:SECRET,now:new Date(NOW)
 });
 assert.equal(candidates.length,1,'candidate builder should authorize only one lab offer');
 const enqueue=outbox.enqueue(candidates);
 assert.equal(enqueue.created,1);
 return {outbox,candidates,claim:()=>outbox.claim()[0],key:candidates[0].event_key};
}
const check=(claim,context,opts={})=>evaluateMobilePushPreflightLab({
 claim,context,hmacSecret:SECRET,now:NOW,...opts
});
test('eligible offer remains ready only after all fresh authoritative checks',()=>{
 const l=lab();
 const result=check(l.claim(),makeContext());
 assert.deepEqual(result,{action:'ready',reason:'all_current_checks_passed'});
});
test('the final gate never sends nor includes a token, offer name, email or user ID',async()=>{
 const l=lab();
 const result=await dryRunMobilePushDispatchLab({
  outbox:l.outbox,loadContext:async()=>makeContext(),hmacSecret:SECRET,now:()=>NOW
 });
 assert.equal(result.provider_calls,0);
 assert.equal(result.ready.length,1);
 assert.equal(l.outbox.get(l.key).status,'leased');
 const body=JSON.stringify(result);
 for(const secret of [SECRET,USER,'ExpoPushToken','push_token','correo','escuela']){
  assert.ok(!body.includes(secret),'preflight unexpectedly exposed '+secret);
 }
});
test('offers that expired after enqueue are cancelled before any delivery',async()=>{
 const l=lab();
 const context=makeContext();
 context.offer.expires_at=ISO(NOW);
 const decision=check(l.claim(),context);
 assert.equal(decision.action,'cancel');
 assert.equal(decision.reason,'offer_already_expired');
 const checkLab=lab();
 const result=await dryRunMobilePushDispatchLab({outbox:checkLab.outbox,
  loadContext:async()=>context,hmacSecret:SECRET,now:()=>NOW});
 assert.equal(result.ready.length,0);
 assert.equal(result.cancelled[0],'offer_already_expired');
 assert.equal(checkLab.outbox.summary().cancelled,1);
 assert.equal(checkLab.outbox.claim().length,0);
});
test('officially cancelled, unmatched and unavailable offers cannot send',()=>{
 const l=lab(),claim=l.claim();
 for(const change of [
  {estado:'Anulada'}, {published:false},{compatible:false},
  {currently_available:false},{matched_user_id:OTHER}
 ]){
  const context=makeContext();
  Object.assign(context.offer,change);
  assert.equal(check(claim,context).action,'cancel',JSON.stringify(change));
 }
});
test('revoked or opt-out devices block delivery, even with a pending lease',()=>{
 const l=lab(),claim=l.claim();
 for(const change of [
  {enabled:false},{opted_in:false},{token_available:false},
  {token_revoked:true}
 ]){
  const context=makeContext();
  Object.assign(context.device,change);
  const decision=check(claim,context);
  assert.deepEqual(decision,{action:'cancel',reason:'device_unsubscribed_or_revoked'});
 }
});
test('device ownership, transport or event-context mismatch is never silently ignored',()=>{
 const l=lab(),claim=l.claim();
 for(const context of [
  {...makeContext(),user_id:OTHER},
  {...makeContext(),device:{...makeContext().device,user_id:OTHER}},
  {...makeContext(),device:{...makeContext().device,transport:'fcm'}},
  {...makeContext(),offer:{...makeContext().offer,source_offer_key:'APD:OTHER:OFFER'}}
 ]){
  assert.equal(check(claim,context).action,'cancel');
 }
});
test('unknown or stale plan verification retries without treating absence as consent',()=>{
 const l=lab(),claim=l.claim();
 for(const plan of [
  {access_active:null},
  {access_active:true,verified_at:ISO(NOW-10*60_000)},
  {access_active:true,verified_at:'2026-11-07T19:59:00'},
  {access_active:true,verified_at:ISO(NOW+60_000)}
 ]){
  const context=makeContext();
  context.plan={user_id:USER,...plan};
  assert.equal(check(claim,context).action,'retry');
 }
});
test('a confirmed inactive plan cancels, not retries indefinitely',()=>{
 const l=lab(),claim=l.claim(),context=makeContext();
 context.plan.access_active=false;
 assert.equal(check(claim,context).action,'cancel');
});
test('unknown, old or invalid official-source freshness retries until reverified',()=>{
 const l=lab(),claim=l.claim();
 for(const offer of [
  {source_current:null},{currently_available:null},{source_current:false},
  {verified_at:ISO(NOW-20*60_000)},
  {verified_at:ISO(NOW+60_000)},
  {verified_at:'07/11/2026 20:00'},
  {expires_at:'2026-11-07'},
  {expires_at:'2026-11-07T20:00:00'}
 ]){
  const context=makeContext();
  Object.assign(context.offer,offer);
  assert.equal(check(claim,context).action,'retry',JSON.stringify(offer));
 }
});
test('strict instant parser rejects date rollovers, missing timezone and invalid offsets',()=>{
 for(const value of [
  '2026-02-31T10:00:00Z','2026-11-31T10:00:00Z',
  '2026-11-07T12:00:00','2026-11-07','2026-11-07T25:00:00Z',
  '2026-11-07T12:60:00Z','2026-11-07T12:00:60Z',
  '2026-11-07T12:00:00+15:00','2026-11-07T12:00:00+14:30',
  '',null,undefined
 ]){
  assert.equal(parseStrictPushInstant(value),null,String(value));
 }
 assert.equal(parseStrictPushInstant('2028-02-29T12:00:00-03:00'),
  Date.UTC(2028,1,29,15));
 assert.equal(parseStrictPushInstant('2026-11-07T20:00:00.123456Z'),
  NOW+123);
});
test('missing or rotated server secret retries rather than deleting an event',()=>{
 const l=lab(),claim=l.claim(),context=makeContext();
 for(const secret of [undefined,'too_short',null]){
  const decision=check(claim,context,{hmacSecret:secret});
  assert.deepEqual(decision,{action:'retry',reason:'server_configuration_unavailable'});
 }
});
test('backend loader failure is retried with backoff, not sent or silently cancelled',async()=>{
 const l=lab();
 const result=await dryRunMobilePushDispatchLab({outbox:l.outbox,
  loadContext:async()=>{throw Error('database_simulated_down')},
  hmacSecret:SECRET,now:()=>NOW});
 assert.equal(result.provider_calls,0);
 assert.deepEqual(result.ready,[]);
 assert.equal(result.retried.length,1);
 const state=l.outbox.get(l.key);
 assert.equal(state.status,'pending');
 assert.ok(state.next_attempt_ms>NOW);
 assert.equal(l.outbox.claim().length,0);
});
test('lease protection rejects old-lease cancellation after another claim',()=>{
 const l=lab(),first=l.claim();
 assert.equal(l.outbox.cancelEvent(l.key,{leaseId:'LAB-LEASE-stale'}),false);
 tick+=31_000;
 const second=l.claim();
 assert.ok(second&&second.lease_id!==first.lease_id);
 assert.equal(l.outbox.cancelEvent(l.key,{leaseId:first.lease_id}),false);
 assert.equal(l.outbox.get(l.key).status,'leased');
 assert.equal(l.outbox.cancelEvent(l.key,{leaseId:second.lease_id}),true);
 assert.equal(l.outbox.settle({
  eventKey:l.key,leaseId:second.lease_id,sent:true
 }),false);
 assert.equal(l.outbox.summary().cancelled,1);
});
test('preflight blocks direct fabrication of unrelated leased events',()=>{
 const l=lab(),claim=l.claim(),context=makeContext();
 assert.equal(check({...claim,event_key:'f'.repeat(64)},context).action,'cancel');
 assert.equal(check({...claim,transport:'fcm'},context).action,'cancel');
 assert.equal(check({...claim,lease_id:''},context).action,'cancel');
 assert.equal(check({...claim,device_id:'not-a-uuid'},context).action,'cancel');
});
test('no event can be marked sent by the dry-run dispatcher',async()=>{
 const l=lab();
 await dryRunMobilePushDispatchLab({
  outbox:l.outbox,loadContext:async()=>makeContext(),hmacSecret:SECRET,now:()=>NOW
 });
 assert.equal(l.outbox.summary().sent,0);
 assert.equal(l.outbox.summary().leased,1);
});
test('preflight code contains no provider sender, secret logging or network calls',()=>{
 const source=fs.readFileSync(new URL('./mobile-push-dispatch-preflight-lab.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|axios|expo-server-sdk|firebase-admin|console\.log|localStorage|navigator\.geolocation/);
 assert.match(source,/provider_calls:0/);
 assert.doesNotMatch(source,/settle\(\{[^}]*sent:true/);
});
