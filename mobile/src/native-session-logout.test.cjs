const test=require("node:test"),assert=require("node:assert/strict");
const {createNativeAccountClient}=require("./native-account-client.js");
const token="a".repeat(64),user="11111111-1111-4111-8111-111111111111";
test("logout route rejects UUID and never accepts user ID from body",async()=>{
 const {createMobileSessionLogoutLab}=await import("../../scripts/mobile-session-logout-lab.mjs");const calls=[];
 const handle=createMobileSessionLogoutLab({revokeSession:async input=>{calls.push(input);return true}});
 const make=(t)=>new Request("https://fixture.invalid/api/account/logout",{method:"POST",headers:{Authorization:"Bearer "+t},body:JSON.stringify({user_id:"foreign"})});
 assert.equal((await handle(make(user))).status,401);assert.equal(calls.length,0);
 const r=await handle(make(token));assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,revoked:true});assert.deepEqual(calls,[{token}]);
});
test("client retains session on unconfirmed logout, then clears on confirmed response",async()=>{
 let confirmed=false;const client=createNativeAccountClient({request:async r=>{
 if(r.path==="/api/login")return {status:200,data:{ok:true,user:{id:user},session_token:token}};
 if(r.path==="/api/account/profile")return {status:200,data:{ok:true,user:{id:user,activo:true}}};
 assert.equal(r.path,"/api/account/logout");assert.equal(r.bearer,token);assert.deepEqual(r.body,{});
 return confirmed?{status:200,data:{ok:true,revoked:true}}:{status:503,data:null};
 }});
 await client.login("a@b.invalid","fixture");await assert.rejects(client.logoutRemote(),/logout_unconfirmed/);assert.equal(client.account().userId,user);
 confirmed=true;assert.deepEqual(await client.logoutRemote(),{revoked:true});assert.equal(client.account(),null);assert.equal(client.getSession(),null);
});
