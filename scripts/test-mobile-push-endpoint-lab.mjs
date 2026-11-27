import test from "node:test";
import assert from "node:assert/strict";
import {createDeviceRegistryLab} from "./mobile-device-registry-contract.mjs";
import {createMobilePushDeviceHandlerLab} from "./mobile-push-endpoint-lab.mjs";

const UID="11111111-1111-4111-8111-111111111111";
const OTHER="22222222-2222-4222-8222-222222222222";
const DEVICE="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION="fake-lab-session-012345678901234567890";
const FCM="ExpoPushToken[LAB_TOKEN_123456789ABCDEFGHI]";
const ALT="ExpoPushToken[ANOTHER_TOKEN_123456789ABCDEFG]";
const BASE="https://offline.invalid/api/mobile/devices";
const secret="FAKE_LAB_SECRET_012345678901234567890123456789";
const register={device_id:DEVICE,platform:"android",transport:"expo",
 push_token:FCM,opted_in:true};
function lab({active=true,sessionActive=true,sessionExpires="2099-12-31T23:00:00Z",
 failPlan=false}={}){
 const registry=createDeviceRegistryLab({hmacSecret:secret});
 const loadSessionByToken=async token=>token===SESSION?{
  token:SESSION,user_id:UID,activo:sessionActive,expires_at:sessionExpires
 }:null;
 const loadUserById=async id=>({id,activo:true});
 const loadPlanByUserId=async id=>{
  if(failPlan)throw Error("injected server failure");
  return id===UID?{access_active:active}:null;
 };
 const handler=createMobilePushDeviceHandlerLab({
  registry,loadSessionByToken,loadUserById,loadPlanByUserId
 });
 function req(method="GET",{path=BASE,body,auth=SESSION,headers={}}={}){
  return new Request(path,{method,headers:{
   ...(auth?{Authorization:"Bearer "+auth}:{}),
   ...(body!==undefined?{"Content-Type":"application/json"}:{}),
   ...headers
  },...(body!==undefined?{body:typeof body==="string"?body:JSON.stringify(body)}:{})});
 }
 return {handler,registry,req};
}
test("register explicit-consent device through strictly verified bearer",async()=>{
 const {handler,req}=lab();
 const response=await handler(req("POST",{body:register}));
 const data=await response.json();
 assert.equal(response.status,201);
 assert.equal(data.ok,true);
 assert.equal(data.device.id,DEVICE);
 assert.equal(data.device.opted_in,true);
 assert.equal(response.headers.get("cache-control"),"no-store");
});
test("registration and listing never echo any push token, hash or user ID",async()=>{
 const {handler,req}=lab();
 const registerResponse=await (await handler(req("POST",{body:register}))).text();
 const listResponse=await (await handler(req("GET"))).text();
 for(const x of [FCM,secret,UID,"token_hash","push_token"]){
  assert.ok(!registerResponse.includes(x),"Registration leaked "+x);
  assert.ok(!listResponse.includes(x),"List leaked "+x);
 }
});
test("missing session and bare user UUID cannot register a device",async()=>{
 const {handler,req,registry}=lab();
 for(const auth of [null,UID,"bad-bearer"]){
  const response=await handler(req("POST",{auth,body:register}));
  assert.equal(response.status,401);
 }
 assert.equal(registry.stats().records,0);
});
test("revoked or expired session cannot create devices",async()=>{
 for(const options of [
  {sessionActive:false},{sessionExpires:"2000-01-01T00:00:00Z"}
 ]){
  const {handler,req}=lab(options);
  assert.equal((await handler(req("POST",{body:register}))).status,401);
 }
});
test("inactive or unverified plan blocks registrations",async()=>{
 const {handler,req,registry}=lab({active:null});
 assert.equal((await handler(req("POST",{body:register}))).status,403);
 assert.equal(registry.stats().records,0);
 const x=lab({active:false});
 assert.equal((await x.handler(x.req("POST",{body:register}))).status,403);
});
test("owning account can list and revoke its device",async()=>{
 const {handler,req}=lab();
 assert.equal((await handler(req("POST",{body:register}))).status,201);
 const list=await (await handler(req("GET"))).json();
 assert.equal(list.devices.length,1);
 assert.equal(list.devices[0].enabled,true);
 const del=await handler(req("DELETE",{path:BASE+"/"+DEVICE}));
 assert.equal(del.status,200);
 const after=await (await handler(req("GET"))).json();
 assert.equal(after.devices[0].enabled,false);
 assert.equal(after.devices[0].opted_in,false);
});
test("unknown or foreign device IDs return 404 without revealing ownership",async()=>{
 const {handler,req,registry}=lab();
 registry.register({actor:{userId:OTHER,sessionVerified:true},
  request:{...register,device_id:FOREIGN,push_token:ALT}});
 for(const id of [FOREIGN,DEVICE,"invalid","../account"]){
  const response=await handler(req("DELETE",{path:BASE+"/"+id}));
  assert.equal(response.status,404);
 }
});
test("client cannot bind a device to another account",async()=>{
 const {handler,req,registry}=lab();
 const response=await handler(req("POST",{body:{...register,user_id:OTHER}}));
 assert.equal(response.status,400);
 assert.equal(registry.stats().records,0);
});
test("oversized JSON bodies get rejected, with or without content-length",async()=>{
 const {handler,req}=lab();
 const long={...register,padding:"a".repeat(5000)};
 for(const headers of [{},{"Content-Length":"5000"}]){
  const response=await handler(req("POST",{body:long,headers}));
  assert.equal(response.status,413);
 }
});
test("invalid JSON cannot register a device",async()=>{
 const {handler,req}=lab();
 const response=await handler(req("POST",{body:'{"bad":'}));
 assert.equal(response.status,400);
});
test("unsupported methods or paths are rejected without side effects",async()=>{
 const {handler,req,registry}=lab();
 assert.equal((await handler(req("PATCH"))).status,405);
 assert.equal((await handler(req("GET",{path:"https://offline.invalid/api/abc"}))).status,404);
 assert.equal((await handler(req("POST",{path:BASE+"/"+DEVICE,body:register}))).status,405);
 assert.equal(registry.stats().records,0);
});
test("plan lookup failure returns generic no-secret error",async()=>{
 const {handler,req}=lab({failPlan:true});
 const response=await handler(req("POST",{body:register}));
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{ok:false,error:"service_unavailable"});
});
test("DELETE remains possible when subscription expired",async()=>{
 const {handler,registry,req}=lab({active:false});
 registry.register({actor:{userId:UID,sessionVerified:true},request:register});
 const response=await handler(req("DELETE",{path:BASE+"/"+DEVICE}));
 assert.equal(response.status,200);
});
