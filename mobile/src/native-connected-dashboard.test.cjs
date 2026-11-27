const test=require("node:test"),assert=require("node:assert/strict");
const {createConnectedNativeDashboard}=require("./native-connected-dashboard.js");
const USER="11111111-1111-4111-8111-111111111111",DEVICE="22222222-2222-4222-8222-222222222222",PROJECT="c032c89f-7c44-49c7-a30f-d8ea0b223053",TOKEN="a".repeat(64),NOW=Date.parse("2026-11-26T20:00:00Z");
function fixture({failRevoke=false,expire=false,failLogout=false}={}){
 const calls=[];let enabled=false,session=true;
 const fetchImpl=async(url,options)=>{
  const path=new URL(url).pathname;calls.push(options.method+" "+path);
  let status=200,data;
  if(path==="/api/login"){
   assert.equal(options.headers.Authorization,undefined);
   data={ok:true,user:{id:USER},session_token:TOKEN};
  }else{
   assert.equal(options.headers.Authorization,"Bearer "+TOKEN);
   if(!session){status=401;data={ok:false};}
   else if(path==="/api/account/profile")data={ok:true,user:{id:USER,activo:true,nombre:"Fixture"}};
   else if(path==="/api/account/preferences")data={ok:true,preferences:{user_id:USER,distrito_principal:"AVELLANEDA"}};
   else if(path==="/api/mis-alertas")data={ok:true,resultados:[{source_offer_key:"fixture",cargo:"Matemática",finoferta:"2026-11-26T18:00:00Z",raw:{estado:"PUBLICADA"}}]};
   else if(path==="/api/mobile/devices"&&options.method==="POST"){
    const body=JSON.parse(options.body);assert.equal(body.device_id,DEVICE);assert.equal(body.opted_in,true);
    enabled=true;data={ok:true,device:{id:DEVICE,platform:"android",transport:"expo",enabled:true,opted_in:true}};
   }else if(path==="/api/mobile/devices"){
    if(expire){status=401;data={ok:false};}else data={ok:true,devices:enabled?[{id:DEVICE,enabled:true,opted_in:true}]:[]};
   }else if(path==="/api/mobile/devices/"+DEVICE){
    if(failRevoke){status=503;data={ok:false};}else{enabled=false;data={ok:true,revoked:true};}
   }else if(path==="/api/account/logout"){
    assert.equal(enabled,false);
    if(failLogout){status=503;data={ok:false};}else{session=false;data={ok:true,revoked:true};}
   }else throw Error("unexpected route");
  }
  return {url,redirected:false,status,ok:status===200,headers:new Headers({"content-type":"application/json"}),text:async()=>JSON.stringify(data)};
 };
 const notifications={ensureChannel:async()=>calls.push("channel"),getPermissions:async()=>({granted:true}),getExpoToken:async project=>{assert.equal(project,PROJECT);calls.push("token");return "ExpoPushToken[synthetic_fixture_123]";}};
 const d=createConnectedNativeDashboard({enabled:true,fetchImpl,notifications,deviceId:DEVICE,projectId:PROJECT,now:()=>NOW});
 return {d,calls};
}
test("connected composition is disabled by default and makes no requests on creation",()=>{
 assert.throws(()=>createConnectedNativeDashboard(),/disabled/);const f=fixture();assert.deepEqual(f.calls,[]);assert.equal(f.d.snapshot().account,null);
});
test("login, scoped offers, explicit consent, device revocation and remote logout integrate",async()=>{
 const f=fixture();const r=await f.d.login("fixture@example.invalid","fixture");
 assert.equal(r.account.userId,USER);assert.equal(r.offers.length,1);assert.ok(!f.calls.includes("token"));
 assert.equal((await f.d.enablePush()).pushState,"registered");
 await f.d.logout();assert.equal(f.d.snapshot().account,null);
 assert.deepEqual(f.calls.slice(-3),["GET /api/mobile/devices","DELETE /api/mobile/devices/"+DEVICE,"POST /api/account/logout"]);
 assert.ok(!JSON.stringify(f.d.snapshot()).includes(TOKEN));
});
test("device revoke failure prevents remote logout; remote failure is not success",async()=>{
 for(const opts of [{failRevoke:true},{failLogout:true}]){
 const f=fixture(opts);await f.d.login("fixture@example.invalid","fixture");await f.d.enablePush();await assert.rejects(f.d.logout(),/operation_unconfirmed/);
 assert.ok(f.d.snapshot().account);assert.equal(f.d.snapshot().offers.length,0);
 assert.equal(f.calls.includes("POST /api/account/logout"),!!opts.failLogout);
 }
});
test("401 during device status clears the expired account and does not log out another session",async()=>{
 const f=fixture({expire:true});await f.d.login("fixture@example.invalid","fixture");await assert.rejects(f.d.logout(),/operation_unconfirmed/);assert.equal(f.d.snapshot().account,null);assert.ok(!f.calls.includes("POST /api/account/logout"));
});
