const test=require("node:test"),assert=require("node:assert/strict");
const USER="11111111-1111-4111-8111-111111111111",DEVICE="22222222-2222-4222-8222-222222222222",TOKEN="a".repeat(64);
const req=(path,method="GET",token=TOKEN,body)=>new Request("https://fixture.invalid"+path,{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
async function fixture({planUser=USER}={}){
 const {createMobilePrivateRoutesCandidate}=await import("../../scripts/mobile-private-routes-candidate.mjs");
 const calls=[];let active=true,row=null;
 const adapter={
  async registerDeviceLab(x){calls.push("register");assert.equal(x.userId,USER);assert.match(x.tokenHash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(x).includes("synthetic_fixture"));row={id:x.deviceId,platform:x.platform,transport:x.transport,enabled:true,opted_in:true};return row;},
  async listOwnedDevicesLab(x){assert.equal(x.userId,USER);return row&&(!x.deviceId||x.deviceId===row.id)?[row]:[];},
  async revokeDeviceLab(x){assert.equal(x.userId,USER);calls.push("revoke");row={...row,enabled:false,opted_in:false};return true;},
  async revokeSession(x){assert.deepEqual(x,{token:TOKEN});calls.push("logout");active=false;return true;}
 };
 const route=createMobilePrivateRoutesCandidate({enabled:true,adapter,loadSessionByToken:async t=>t===TOKEN?{token:t,user_id:USER,activo:active,expires_at:new Date(Date.now()+60000).toISOString()}:null,loadUserById:async id=>({id,activo:true}),verifyPlan:async()=>({user_id:planUser,access_active:true}),encryptionKey:Buffer.alloc(32,1).toString("base64url"),hmacKey:Buffer.alloc(32,2).toString("base64url")});
 return {route,calls};
}
const payload={device_id:DEVICE,platform:"android",transport:"expo",push_token:"ExpoPushToken[synthetic_fixture_only]",opted_in:true};
test("disabled router never mounts mobile routes; unrelated routes delegated",async()=>{
 const {createMobilePrivateRoutesCandidate}=await import("../../scripts/mobile-private-routes-candidate.mjs");
 const route=createMobilePrivateRoutesCandidate();
 assert.equal((await route(req("/api/mobile/devices"))).status,404);
 assert.equal((await route(req("/api/account/logout","POST"))).status,404);
 assert.equal(await route(req("/api/version")),null);
});
test("exact private routes support device opt-in, revoke and logout without exposing token",async()=>{
 const f=await fixture();
 assert.equal((await f.route(req("/api/mobile/devices","GET",USER))).status,401);
 assert.equal((await f.route(req("/api/mobile/devices?user_id=other"))).status,400);
 const registered=await f.route(req("/api/mobile/devices","POST",TOKEN,payload));assert.equal(registered.status,201);
 assert.ok(!(await registered.text()).includes("synthetic_fixture"));
 const listed=await (await f.route(req("/api/mobile/devices"))).json();assert.equal(listed.devices[0].id,DEVICE);
 assert.equal((await f.route(req("/api/mobile/devices/"+DEVICE,"DELETE"))).status,200);
 assert.equal((await f.route(req("/api/account/logout","POST",TOKEN,{user_id:"foreign"}))).status,200);
 assert.equal((await f.route(req("/api/mobile/devices"))).status,401);
 assert.deepEqual(f.calls,["register","revoke","logout"]);
});
test("foreign plan evidence does not authorize enrollment",async()=>{
 const f=await fixture({planUser:DEVICE});assert.equal((await f.route(req("/api/mobile/devices","POST",TOKEN,payload))).status,403);assert.deepEqual(f.calls,[]);
});
