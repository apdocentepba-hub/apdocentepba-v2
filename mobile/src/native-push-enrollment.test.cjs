const test=require("node:test");
const assert=require("node:assert/strict");
const {createNativePushEnrollment}=require("./native-push-enrollment.js");
const A="11111111-1111-4111-8111-111111111111", B="22222222-2222-4222-8222-222222222222", D="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", P="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const bearer="fixture-session-01234567890123456789",token="ExpoPushToken[LAB_TOKEN_123456789ABCDEFGHI]";
async function setup(){
 const {createDeviceRegistryLab}=await import("../../scripts/mobile-device-registry-contract.mjs");
 const {createMobilePushDeviceHandlerLab}=await import("../../scripts/mobile-push-endpoint-lab.mjs");
 let session={userId:A,bearer},permission=true,tokenHook=async()=>token,requests=0,prompts=0,channel=0,active=true;
 const base=createDeviceRegistryLab({hmacSecret:"fixture-only-012345678901234567890123456789"});
 // Promise-backed repository reproduces asynchronous storage API.
 const registry=Object.fromEntries(["register","revoke","getForUser","listForUser"].map(k=>[k,async x=>base[k](x)]));
 const handler=createMobilePushDeviceHandlerLab({registry,loadSessionByToken:async t=>t===bearer?{token:t,user_id:A,activo:true,expires_at:"2099-01-01T00:00:00Z"}:null,loadUserById:async id=>({id,activo:true}),loadPlanByUserId:async()=>({access_active:active})});
 const notifications={ensureChannel:async()=>{channel++},getPermissions:async()=>({granted:permission}),requestPermissions:async()=>{prompts++;return {granted:permission}},getExpoToken:async id=>{assert.equal(id,P);return tokenHook();}};
 const request=async({method,path,bearer,body})=>{
  requests++;const response=await handler(new Request("https://fixture.invalid"+path,{method,headers:{Authorization:"Bearer "+bearer,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})}));return response.json();
 };
 const create=()=>createNativePushEnrollment({getSession:()=>session,notifications,request,deviceId:D,projectId:P,platform:"android"});
 return {client:create(),base,handler,create,setSession:x=>session=x,deny:()=>permission=false,expirePlan:()=>active=false,tokenHook:f=>tokenHook=f,counts:()=>({requests,prompts,channel})};
}
test("native explicit opt-in registers via async API, confirms status, revokes even with expired plan",async()=>{
 const f=await setup();assert.equal((await f.client.status()).state,"not_registered");
 assert.deepEqual(await f.client.enable({consent:true}),{state:"registered",deviceId:D});
 assert.equal((await f.client.status()).state,"registered");
 f.expirePlan();assert.equal((await f.client.disable()).state,"revoked");
 assert.equal((await f.client.status()).state,"not_registered");
 assert.equal(f.counts().channel,1);
});
test("no consent and OS denial never submit push tokens",async()=>{
 const f=await setup();await assert.rejects(f.client.enable({consent:false}),/consent_required/);
 assert.equal(f.counts().channel,0);f.deny();assert.equal((await f.client.enable({consent:true})).state,"permission_denied");
 assert.equal(f.counts().requests,0);assert.equal(f.base.stats().records,0);
});
test("session switch while token is requested cannot register another account",async()=>{
 const f=await setup();f.tokenHook(async()=>{f.setSession({userId:B,bearer:"other-fixture-session-0123456789"});return token});
 await assert.rejects(f.client.enable({consent:true}),/session_changed/);assert.equal(f.counts().requests,0);
});
test("legacy UUID is not a bearer; inactive plan cannot register",async()=>{
 const f=await setup();f.setSession({userId:A,bearer:A});await assert.rejects(f.client.enable({consent:true}),/session_required/);
 f.setSession({userId:A,bearer});f.expirePlan();await assert.rejects(f.client.enable({consent:true}),/enrollment_not_confirmed/);
 assert.equal(f.base.stats().records,0);
});
test("concurrent enrollment rejected, no duplicate network call",async()=>{
 const f=await setup();let release;f.tokenHook(()=>new Promise(r=>release=r));
 const pending=f.client.enable({consent:true});await assert.rejects(f.client.enable({consent:true}),/enrollment_busy/);
 while(!release)await new Promise(r=>setImmediate(r));release(token);await pending;assert.equal(f.counts().requests,1);
});
test("API rejects same-user identity injection and non JSON",async()=>{
 const f=await setup();const body={device_id:D,platform:"android",transport:"expo",push_token:token,opted_in:true,user_id:A};
 const send=(type,data)=>f.handler(new Request("https://fixture.invalid/api/mobile/devices",{method:"POST",headers:{Authorization:"Bearer "+bearer,"Content-Type":type},body:JSON.stringify(data)}));
 assert.equal((await send("application/json",body)).status,400);
 assert.equal((await send("text/plain",body)).status,415);assert.equal(f.base.stats().records,0);
});
