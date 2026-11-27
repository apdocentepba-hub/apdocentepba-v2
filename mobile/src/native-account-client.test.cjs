const test=require("node:test");
const assert=require("node:assert/strict");
const {createNativeAccountClient,abcClosingTime}=require("./native-account-client.js");
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222",TOKEN="a".repeat(64),NOW=Date.parse("2026-11-26T20:00:00Z");
function fixture(){
 const calls=[];let loginToken=TOKEN,profileId=A,alertStatus=200,alertHook=null;
 const offer={source_offer_key:"A-1",cargo:"Matemática",escuela:"Escuela fixture",distrito:"AVELLANEDA",turno:"M",finoferta:"2026-11-26T18:00:00Z",raw:{estado:"PUBLICADA",private:"never expose"}};
 const request=async r=>{
  calls.push(r);
  if(r.path==="/api/login")return {status:200,data:{ok:true,user:{id:A},session_token:loginToken}};
  assert.equal(r.bearer,TOKEN);
  if(r.path==="/api/account/profile")return {status:200,data:{ok:true,user:{id:profileId,nombre:"Docente fixture",activo:true}}};
  if(r.path==="/api/account/preferences")return {status:200,data:{ok:true,preferences:{user_id:A,distrito_principal:"AVELLANEDA",turnos:["M"],alertas_activas:true}}};
  if(r.path==="/api/mis-alertas"){
   if(alertHook)return alertHook();
   return {status:alertStatus,data:{ok:alertStatus===200,resultados:[offer,{...offer},{...offer,source_offer_key:"expired",finoferta:"2026-11-26T17:00:00Z"},{...offer,source_offer_key:"closed",raw:{estado:"CERRADA"}},{...offer,source_offer_key:"unknown",finoferta:"2026-11-26"}]}};
  }throw Error("unexpected route");
 };
 return {client:createNativeAccountClient({request,now:()=>NOW}),calls,legacy:()=>loginToken=A,foreign:()=>profileId=B,expire:()=>alertStatus=401,hold:f=>alertHook=f};
}
test("login requires real session token and verifies account before accessing scoped data",async()=>{
 const f=fixture();assert.deepEqual(await f.client.login(" TEST@EXAMPLE.INVALID ","secret"),{userId:A,name:"Docente fixture"});
 assert.equal(f.calls[0].body.email,"test@example.invalid");assert.equal(f.calls[1].path,"/api/account/profile");
 const r=await f.client.alerts();assert.equal(r.items.length,1);assert.equal(r.excluded,4);assert.equal(r.items[0].key,"A-1");assert.ok(!JSON.stringify(r).includes("private"));
 assert.deepEqual((await f.client.preferences()).shifts,["M"]);assert.ok(f.calls.every(x=>!x.path.includes("user_id")));
});
test("legacy UUID and mismatched profile cannot authenticate",async()=>{
 for(const mode of ["legacy","foreign"]){const f=fixture();f[mode]();await assert.rejects(f.client.login("a@b.invalid","pw"),/invalid_session|identity_unconfirmed/);assert.equal(f.client.account(),null);}
});
test("401 clears session; local logout invalidates stale responses",async()=>{
 const f=fixture();await f.client.login("a@b.invalid","pw");f.expire();await assert.rejects(f.client.alerts(),/session_expired/);assert.equal(f.client.getSession(),null);
 await f.client.login("a@b.invalid","pw");let resolve;f.hold(()=>new Promise(r=>resolve=r));const pending=f.client.alerts();f.client.logoutLocal();resolve({status:200,data:{ok:true,resultados:[]}});await assert.rejects(pending,/session_changed/);
});
test("ABC closing time uses Argentina wall clock, excludes invalid and date-only values",()=>{
 assert.equal(abcClosingTime("2026-11-26T18:00:00Z"),Date.parse("2026-11-26T21:00:00Z"));
 assert.equal(abcClosingTime("26/11/2026, 18:00"),Date.parse("2026-11-26T21:00:00Z"));
 for(const x of ["2026-02-30T18:00:00Z","2026-11-26","9999-12-31T00:00:00Z","not a date"])assert.equal(abcClosingTime(x),null);
});

test("expired plan exact live response is distinct from malformed offers",()=>{
 const {normalizeAlerts}=require("./native-account-client.js");
 const restricted={ok:true,items:[],message:"Tu plan está vencido. Activá una suscripción para volver a ver alertas.",plan:null,subscription:null};
 assert.deepEqual(normalizeAlerts(restricted,NOW),{items:[],excluded:0,accessRestricted:true});
 for(const bad of [{...restricted,items:[{}]},{...restricted,message:"unknown"},{...restricted,subscription:undefined,resultados:null}])assert.throws(()=>normalizeAlerts(bad,NOW),/alerts_unverified/);
});
