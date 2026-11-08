import test from "node:test";
import assert from "node:assert/strict";
import {createPushOutboxLab} from "./mobile-push-outbox-contract.mjs";
import {buildMobilePushCandidates} from "./mobile-push-candidate-contract.mjs";
const uid="11111111-1111-4111-8111-111111111111";
const did="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secret="TEST_ONLY_HMAC_SECRET_01234567890123456789012345678";
const source={
 source_offer_key:"APD:LAB:1",matched_user_id:uid,compatible:true,
 published:true,currently_available:true,expires_at:"2099-12-31T23:59:00Z"
};
const device={id:did,user_id:uid,platform:"android",transport:"expo",
 enabled:true,opted_in:true};
const candidate=buildMobilePushCandidates({
 authenticatedUserId:uid,verifiedPlan:{access_active:true},
 authorizedDevices:[device],serverMatchedOffers:[source],hmacSecret:secret,
 now:"2026-11-03T12:00:00Z"
})[0];
assert.ok(candidate);
function run(){let tick=0;const q=createPushOutboxLab({clock:()=>tick,maxAttempts:3});
return{q,step:ms=>tick+=ms};}
test("only a verified generic event enters the no-network outbox",()=>{
 const {q}=run();
 assert.deepEqual(q.enqueue([candidate]),{created:1,duplicates:0,rejected:0});
 assert.equal(q.summary().pending,1);
 assert.ok(!JSON.stringify(q.get(candidate.event_key)).includes(uid));
});
test("same event cannot be queued or claimed twice concurrently",()=>{
 const {q}=run();
 assert.deepEqual(q.enqueue([candidate,candidate]),{created:1,duplicates:1,rejected:0});
 assert.equal(q.claim().length,1);assert.equal(q.claim().length,0);
});
test("provider acknowledgement requires matching, live lease ID",()=>{
 const {q}=run();q.enqueue([candidate]);
 const [lease]=q.claim();
 assert.equal(q.settle({eventKey:candidate.event_key,leaseId:"WRONG",sent:true}),false);
 assert.equal(q.settle({eventKey:candidate.event_key,leaseId:lease.lease_id,sent:true}),true);
 assert.equal(q.get(candidate.event_key).status,"sent");
 assert.equal(q.claim().length,0);
});
test("provider failure schedules bounded retry instead of fake success",()=>{
 const {q,step}=run();q.enqueue([candidate]);
 const [lease]=q.claim();
 assert.equal(q.settle({eventKey:candidate.event_key,leaseId:lease.lease_id,sent:false}),true);
 assert.equal(q.get(candidate.event_key).status,"pending");
 assert.equal(q.claim().length,0);
 step(999);assert.equal(q.claim().length,0);
 step(1);assert.equal(q.claim()[0].attempts,2);
});
test("after capped failed retries entry goes dead, not infinite loop",()=>{
 const {q,step}=run();q.enqueue([candidate]);
 for(let i=0;i<3;i++){
  const [lease]=q.claim();assert.ok(lease);
  assert.equal(q.settle({eventKey:candidate.event_key,leaseId:lease.lease_id,sent:false}),true);
  step((2**i)*1000);
 }
 assert.equal(q.get(candidate.event_key).status,"dead");
 assert.equal(q.claim().length,0);
});
test("expired lease is reclaimed but outdated confirmation cannot mark sent",()=>{
 const {q,step}=run();q.enqueue([candidate]);
 const [first]=q.claim({leaseMs:2000});step(2000);
 const [second]=q.claim();
 assert.ok(second);
 assert.notEqual(first.lease_id,second.lease_id);
 assert.equal(q.settle({eventKey:candidate.event_key,leaseId:first.lease_id,sent:true}),false);
 assert.equal(q.settle({eventKey:candidate.event_key,leaseId:second.lease_id,sent:true}),true);
});
test("revoking device cancels even an in-flight claimed message",()=>{
 const {q}=run();q.enqueue([candidate]);
 const [lease]=q.claim();
 assert.equal(q.cancelDevice(did),1);
 assert.equal(q.settle({eventKey:candidate.event_key,leaseId:lease.lease_id,sent:true}),false);
 assert.equal(q.get(candidate.event_key).status,"cancelled");
 assert.equal(q.claim().length,0);
});
test("invalid or privacy-leaking payload is rejected before queueing",()=>{
 const {q}=run();
 const invalid=[
  {...candidate,event_key:"NOT_HEX"},
  {...candidate,notification:{...candidate.notification,title:"Escuela X"}},
  {...candidate,notification:{...candidate.notification,data:{...candidate.notification.data,email:"secret@example.org"}}},
  {...candidate,device_id:"not-a-uuid"}
 ];
 assert.deepEqual(q.enqueue(invalid),{created:0,duplicates:0,rejected:invalid.length});
 assert.equal(q.summary().total,0);
});
test("queue does not expose bearer, offer ID, device token, user ID or credentials",()=>{
 const {q}=run();q.enqueue([candidate]);const [lease]=q.claim();
 const serialized=JSON.stringify([q.get(candidate.event_key),q.summary(),lease]);
 for(const s of [uid,source.source_offer_key,"Bearer ","password","ExpoPushToken"])
  assert.ok(!serialized.includes(s),"Leaked "+s);
});
test("invalid queue configuration, time, claims and IDs are refused",()=>{
 assert.throws(()=>createPushOutboxLab({maxAttempts:0}));
 const {q}=run();
 assert.throws(()=>q.enqueue(null));
 assert.throws(()=>q.claim({limit:0}));
 assert.throws(()=>q.claim({leaseMs:100}));
 assert.throws(()=>q.cancelDevice("invalid"));
 const bad=createPushOutboxLab({clock:()=>NaN});
 assert.throws(()=>bad.enqueue([candidate]),/invalid_time/);
});
