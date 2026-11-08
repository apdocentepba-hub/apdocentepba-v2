import test from "node:test";
import assert from "node:assert/strict";
import {createDeviceRegistryLab,DeviceRegistryError} from "./mobile-device-registry-contract.mjs";
const secret="OFFLINE_ONLY_NO_REAL_SECRET_000000000000000000000000000000000";
const user="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actor={sessionVerified:true,userId:user};
const actor2={sessionVerified:true,userId:other};
const token="ExpoPushToken["+"EXPO_DEMO_TOKEN_WITH_ENOUGH_LENGTH"+"]";
const token2="ExpoPushToken["+"ANOTHER_DEMO_TOKEN_123456789"+"]";
const request={device_id:id,platform:"android",transport:"expo",push_token:token,opted_in:true};
const build=()=>createDeviceRegistryLab({hmacSecret:secret});
function errors(fn,code){
 assert.throws(fn,e=>e instanceof DeviceRegistryError&&e.code===code);
}
test("verified session with explicit opt-in registers a device",()=>{
 const db=build(),result=db.register({actor,request});
 assert.deepEqual(result,{id,user_id:user,platform:"android",transport:"expo",enabled:true,opted_in:true});
 assert.equal(db.listForUser({actor}).length,1);
});
test("registration never exposes raw token, token hash, secrets, or credentials",()=>{
 const db=build(); const result=db.register({actor,request});
 const serialized=JSON.stringify(result)+JSON.stringify(db.listForUser({actor}));
 for(const leaked of [token,secret,"token_hash","push_token","password","Bearer"])
  assert.ok(!serialized.includes(leaked),"Leaked "+leaked);
});
test("bearer actor must be previously verified server-side",()=>{
 const db=build();
 for(const bad of [null,{}, {userId:user},{userId:user,sessionVerified:false},
  {userId:"not-uuid",sessionVerified:true}]){
  errors(()=>db.register({actor:bad,request}),"unauthenticated");
 }
 assert.equal(db.stats().records,0);
});
test("refuse user_id that contradicts identity derived from session",()=>{
 const db=build();
 errors(()=>db.register({actor,request:{...request,user_id:other}}),"actor_mismatch");
 assert.equal(db.stats().records,0);
});
test("device ID cannot be transferred from one user to another",()=>{
 const db=build();db.register({actor,request});
 errors(()=>db.register({actor:actor2,request:{...request,push_token:token2}}),
  "device_owned_by_other_user");
 assert.deepEqual(db.listForUser({actor:actor2}),[]);
 assert.equal(db.listForUser({actor}).length,1);
});
test("session owner alone can revoke device, and revoked state disables sending",()=>{
 const db=build();db.register({actor,request});
 errors(()=>db.revoke({actor:actor2,deviceId:id}),"device_owned_by_other_user");
 assert.equal(db.getForUser({actor:actor2,deviceId:id}),null);
 assert.equal(db.revoke({actor,deviceId:id}),true);
 assert.deepEqual(db.getForUser({actor,deviceId:id}),{
  id,user_id:user,platform:"android",transport:"expo",enabled:false,opted_in:false
 });
 assert.equal(db.revoke({actor,deviceId:id}),true);
});
test("same owner can rotate token without creating a second record",()=>{
 const db=build();
 db.register({actor,request});
 db.register({actor,request:{...request,push_token:token2}});
 assert.equal(db.stats().records,1);
 assert.equal(db.getForUser({actor,deviceId:id}).enabled,true);
});
test("same active token cannot be copied onto another device or user",()=>{
 const db=build();db.register({actor,request});
 errors(()=>db.register({actor,request:{...request,device_id:id2}}),"token_already_registered");
 errors(()=>db.register({actor:actor2,request:{...request,device_id:id2}}),
  "token_already_registered");
});
test("token may be reassigned after owner explicitly revoked device",()=>{
 const db=build();db.register({actor,request});
 db.revoke({actor,deviceId:id});
 db.register({actor:actor2,request:{...request,device_id:id2}});
 assert.equal(db.listForUser({actor:actor2}).length,1);
});
test("opt-out, missing token or invalid push token fail closed",()=>{
 const db=build();
 const cases=[{opted_in:false},{opted_in:null},{push_token:""},
  {push_token:"user@example.com"},{push_token:"ExpoPushToken[!BAD!]"},
  {device_id:"fake"},{platform:"web"},{transport:"unknown"}];
 for(const patch of cases){
  errors(()=>db.register({actor,request:{...request,...patch}}),
   "invalid_device_or_consent");
 }
 assert.equal(db.stats().records,0);
});
test("cross-platform provider mismatch fails closed",()=>{
 const db=build();
 errors(()=>db.register({actor,request:{...request,platform:"android",transport:"apns",
  push_token:"a".repeat(64)}}),"invalid_transport");
 errors(()=>db.register({actor,request:{...request,platform:"ios",transport:"fcm",
  push_token:"A".repeat(64)}}),"invalid_transport");
});
test("unknown device read and revoke do not list another user's devices",()=>{
 const db=build();db.register({actor,request});
 assert.equal(db.getForUser({actor:actor2,deviceId:id}),null);
 assert.deepEqual(db.listForUser({actor:actor2}),[]);
 assert.equal(db.revoke({actor:actor2,deviceId:id2}),false);
});
test("invalid registry secret cannot be used",()=>{
 errors(()=>createDeviceRegistryLab({}),"invalid_server_secret");
 errors(()=>createDeviceRegistryLab({hmacSecret:"123"}),"invalid_server_secret");
});
