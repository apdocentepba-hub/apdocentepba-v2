import test from "node:test";
import assert from "node:assert/strict";
import {buildMobilePushCandidates} from "./mobile-push-candidate-contract.mjs";
const user="11111111-1111-4111-8111-111111111111";
const otherUser="22222222-2222-4222-8222-222222222222";
const deviceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondDeviceId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const key="NOT_A_REAL_KEY_0123456789_abcdefghijklmnopqrstuv";
const NOW="2026-11-03T12:00:00Z";
const offer={
 source_offer_key:"ABC:DEMO:100",
 matched_user_id:user,
 compatible:true,
 published:true,
 currently_available:true,
 expires_at:"2026-11-04T12:00:00Z",
 observaciones:"DO_NOT_PUT_PERSONAL_OBSERVATIONS_IN_PUSH",
 postulante_dni:"NO_PERSONAL_IDENTIFIER_IN_PUSH",
 escuela:"ESCUELA DE EJEMPLO",
 area:"DEMO"
};
const device={id:deviceId,user_id:user,enabled:true,opted_in:true,
 platform:"android",transport:"expo",push_token:"FAKE_DO_NOT_LEAK_PUSH_TOKEN"};
function plan(overrides={}){
 return {authenticatedUserId:user,verifiedPlan:{access_active:true},
  serverMatchedOffers:[offer],authorizedDevices:[device],
  existingEventKeys:[],hmacSecret:key,now:NOW,...overrides};
}
test("one verified offer creates one anonymous event, never sends it",()=>{
 const r=buildMobilePushCandidates(plan());
 assert.equal(r.length,1);
 assert.equal(r[0].device_id,deviceId);
 assert.equal(r[0].notification.title,"Nueva oferta APD compatible");
 assert.match(r[0].event_key,/^[0-9a-f]{64}$/);
 assert.deepEqual(r[0].notification.data,{notification_id:r[0].event_key});
});
test("unknown, inactive or explicitly missing entitlement fails closed",()=>{
 for(const verifiedPlan of [null,{}, {access_active:null},{access_active:false}]){
  assert.deepEqual(buildMobilePushCandidates(plan({verifiedPlan})),[]);
 }
});
test("mismatched account identity or device owner gets no event",()=>{
 assert.deepEqual(buildMobilePushCandidates(plan({authenticatedUserId:otherUser})),[]);
 assert.deepEqual(buildMobilePushCandidates(plan({authorizedDevices:[
  {...device,user_id:otherUser}
 ]})),[]);
});
test("notification requires user opt-in and device enabled",()=>{
 for(const patch of [{opted_in:false},{enabled:false},{opted_in:null}]){
  assert.deepEqual(buildMobilePushCandidates(plan({
   authorizedDevices:[{...device,...patch}]
  })),[]);
 }
});
test("cannot notify unverified/unmatched/unpublished/expired offer",()=>{
 const invalid=[
  {compatible:false},{published:false},{currently_available:false},
  {matched_user_id:otherUser},
  {expires_at:"2026-11-02T12:00:00Z"},
  {expires_at:null},{expires_at:"invalid"},
  {source_offer_key:""},{source_offer_key:"../somewhere"}
 ];
 for(const patch of invalid){
  assert.deepEqual(buildMobilePushCandidates(plan({
   serverMatchedOffers:[{...offer,...patch}]
  })),[]);
 }
});
test("previously queued notification is deduplicated for the same device and offer",()=>{
 const one=buildMobilePushCandidates(plan());
 assert.deepEqual(buildMobilePushCandidates(plan({
  existingEventKeys:[one[0].event_key]
 })),[]);
});
test("duplicated offers or duplicated device records cannot multiply pushes",()=>{
 const results=buildMobilePushCandidates(plan({
  serverMatchedOffers:[offer,{...offer},offer],
  authorizedDevices:[device,{...device}]
 }));
 assert.equal(results.length,1);
});
test("one event per authorized device has different idempotency key",()=>{
 const results=buildMobilePushCandidates(plan({authorizedDevices:[
  device,{...device,id:secondDeviceId,platform:"ios",transport:"apns"}
 ]}));
 assert.equal(results.length,2);
 assert.notEqual(results[0].event_key,results[1].event_key);
});
test("bounded send batch prevents dozens of popups in one scan",()=>{
 const offers=Array.from({length:8},(_,i)=>({...offer,
  source_offer_key:"ABC:DEMO:"+(i+100)}));
 assert.equal(buildMobilePushCandidates(plan({
  serverMatchedOffers:offers,maxPerDevice:2
 })).length,2);
 assert.equal(buildMobilePushCandidates(plan({
  serverMatchedOffers:offers,maxPerDevice:11
 })).length,0);
});
test("event content excludes personal fields, raw keys and device push tokens",()=>{
 const results=buildMobilePushCandidates(plan());
 const text=JSON.stringify(results);
 for(const secret of ["DO_NOT_PUT_PERSONAL_OBSERVATIONS_IN_PUSH",
 "NO_PERSONAL_IDENTIFIER_IN_PUSH","FAKE_DO_NOT_LEAK_PUSH_TOKEN",
 "ESCUELA DE EJEMPLO","ABC:DEMO:100",user,key]){
  assert.ok(!text.includes(secret),"Leaked "+secret);
 }
});
test("secret, identity and server-verification inputs must be present",()=>{
 for(const patch of [
  {hmacSecret:"short"}, {hmacSecret:null},{authenticatedUserId:"not-a-uuid"},
  {serverMatchedOffers:null},{authorizedDevices:null},{existingEventKeys:null},
  {now:"nonsense"}
 ]){
  assert.deepEqual(buildMobilePushCandidates(plan(patch)),[]);
 }
});
test("same trusted inputs create deterministic event keys",()=>{
 const first=buildMobilePushCandidates(plan());
 const next=buildMobilePushCandidates(plan());
 assert.deepEqual(first,next);
 assert.notEqual(first[0].event_key,
  buildMobilePushCandidates(plan({hmacSecret:"ANOTHER_FAKE_SECRET_0123456789_abcdefghijklmno"}))[0].event_key);
});
