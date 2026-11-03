/* End-to-end contracts across three LAB modules. No Worker, Supabase, FCM,
 * network, user tokens or provider send. All device records are in memory.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createDeviceRegistryLab} from "./mobile-device-registry-contract.mjs";
import {buildMobilePushCandidates} from "./mobile-push-candidate-contract.mjs";
import {createPushOutboxLab} from "./mobile-push-outbox-contract.mjs";
const uid="11111111-1111-4111-8111-111111111111";
const did="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const hmacSecret="TEST_FAKE_SECRET_ONLY_FOR_LAB_012345678901234567";
const actor={sessionVerified:true,userId:uid};
const token="ExpoPushToken[EXPO_LAB_TOKEN_1234567890]";
const request={device_id:did,platform:"android",transport:"expo",push_token:token,opted_in:true};
const matched={source_offer_key:"APD:LAB:EXAMPLE",matched_user_id:uid,
 compatible:true,published:true,currently_available:true,
 expires_at:"2099-12-31T23:59:00Z"};
const plan={access_active:true};
function lab(){
 const registry=createDeviceRegistryLab({hmacSecret});
 const queue=createPushOutboxLab({clock:()=>0});
 const devices=()=>registry.listForUser({actor});
 const candidates=({verifiedPlan=plan,offers=[matched],existingEventKeys=[]}={})=>
  buildMobilePushCandidates({
   authenticatedUserId:uid,verifiedPlan,serverMatchedOffers:offers,
   authorizedDevices:devices(),existingEventKeys,hmacSecret,
   now:"2026-11-03T12:00:00Z"
  });
 return{registry,queue,devices,candidates};
}
test("consented device + active plan + verified offer produces one candidate only",()=>{
 const l=lab();l.registry.register({actor,request});
 const events=l.candidates();
 assert.equal(events.length,1);
 assert.deepEqual(l.queue.enqueue(events),{created:1,duplicates:0,rejected:0});
 assert.equal(l.queue.claim().length,1);
 assert.equal(l.queue.summary().total,1);
});
test("without consent and server verified plan no push enters outbox",()=>{
 const l=lab();
 assert.deepEqual(l.candidates(),[]);
 assert.equal(l.queue.enqueue(l.candidates()).created,0);
 l.registry.register({actor,request});
 assert.deepEqual(l.candidates({verifiedPlan:{access_active:null}}),[]);
 assert.deepEqual(l.candidates({verifiedPlan:{access_active:false}}),[]);
 assert.deepEqual(l.candidates({offers:[{...matched,compatible:false}]}),[]);
 assert.equal(l.queue.summary().total,0);
});
test("device revocation prevents new events and cancels pending in-flight events",()=>{
 const l=lab();l.registry.register({actor,request});
 const [event]=l.candidates();
 l.queue.enqueue([event]);
 const [lease]=l.queue.claim();
 assert.equal(l.registry.revoke({actor,deviceId:did}),true);
 // Dispatcher must check revocation again and cancel all outstanding leases.
 assert.equal(l.queue.cancelDevice(did),1);
 assert.deepEqual(l.candidates(),[]);
 assert.equal(l.queue.settle({eventKey:event.event_key,leaseId:lease.lease_id,sent:true}),false);
 assert.equal(l.queue.summary().cancelled,1);
});
test("repeated scans cannot enqueue the same offer again, even after ack",()=>{
 const l=lab();l.registry.register({actor,request});
 const events=l.candidates();l.queue.enqueue(events);
 const [lease]=l.queue.claim();
 assert.equal(l.queue.settle({eventKey:events[0].event_key,leaseId:lease.lease_id,sent:true}),true);
 assert.equal(l.queue.enqueue(l.candidates()).duplicates,1);
 assert.equal(l.queue.summary().sent,1);
});
