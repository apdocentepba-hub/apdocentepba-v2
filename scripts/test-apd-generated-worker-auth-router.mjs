/* Security contract for the ACTUAL generated Worker router.
 * Every response uses synthetic in-process Supabase fixtures.
 * No production credentials, user IDs, DB or network requests.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {copyFileSync, mkdirSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const allowed={
 bounded:"tmp/apd-bounded-abc-worker-release/worker_hotfix.js",
 published:"tmp/apd-published-query-research/worker_hotfix.js",
 pid:"tmp/apd-published-pid-research/worker_hotfix.js"
};
const variant=process.env.APD_TEST_WORKER_VARIANT||"published";
assert.ok(Object.hasOwn(allowed,variant),"Unexpected candidate variant");
const tmp="tmp/apd-router-security-fixture";
mkdirSync(tmp,{recursive:true});
const modulePath=resolve(tmp,"worker-"+variant+".mjs");
copyFileSync(allowed[variant],modulePath);
const {default:worker}=await import(pathToFileURL(modulePath).href);
assert.equal(typeof worker.fetch,"function","Generated Worker must export a fetch router");
const env={
 SUPABASE_URL:"https://supabase-fixture.invalid",
 SUPABASE_SERVICE_ROLE_KEY:"fixture-not-a-secret"
};
function reply(rows){return new Response(JSON.stringify(rows),{status:200,headers:{"Content-Type":"application/json"}});}
function mockSource({session="good",accountActive=true,planStatus="ACTIVE"}={}){
 const calls=[];
 const fetchStub=async (request,options)=>{
  const u=new URL(String(request));
  const method=options?.method||"GET";
  assert.equal(u.origin,env.SUPABASE_URL,"Unexpected external request: "+u.origin);
  assert.equal(method,"GET","Synthetic route must never write");
  assert.ok(u.pathname.startsWith("/rest/v1/"),"Unexpected fixture endpoint");
  const table=u.pathname.slice("/rest/v1/".length);
  calls.push({table,query:u.searchParams.toString(),method});
  if(table==="sessions"){
   const token=u.searchParams.get("token");
   if(token!=="eq."+session || session==="none")return reply([]);
   return reply([{token:session,user_id:"ALICE",activo:true,
    expires_at:session==="expired"?"2020-01-01T00:00:00Z":"2099-12-31T00:00:00Z"}]);
  }
  if(table==="users"){
   if(u.searchParams.get("id")!=="eq.ALICE")return reply([]);
   return reply([{id:"ALICE",nombre:"Cuenta",apellido:"Ficticia",email:"alice@example.invalid",
     activo:accountActive,es_admin:false}]);
  }
  if(table==="subscription_plans")return reply([]);
  if(table==="user_subscriptions"){
   assert.equal(u.searchParams.get("user_id"),"eq.ALICE");
   return reply([{id:"SUB_FIXTURE",user_id:"ALICE",plan_code:"PLUS",status:planStatus,
    source:"fixture",started_at:"2026-01-01T00:00:00Z",
    current_period_ends_at:planStatus==="EXPIRED"?"2020-01-01T00:00:00Z":"2099-12-31T00:00:00Z"}]);
  }
  if(table==="user_preferences"){
   assert.equal(u.searchParams.get("user_id"),"eq.ALICE");
   return reply([{user_id:"ALICE",alertas_activas:false,
    distrito_principal:"QUILMES",otros_distritos:[],cargos:[],materias:[],
    niveles:[],turnos:[],alertas_email:false,alertas_telegram:false,
    alertas_whatsapp:false}]);
  }
  throw Error("Unexpected fixture table: "+table);
 };
 return {fetchStub,calls};
}
async function invoke(url,token,fixture={}){
 const mocked=mockSource(fixture),oldFetch=globalThis.fetch;
 globalThis.fetch=mocked.fetchStub;
 try{
  const headers=token?{Authorization:"Bearer "+token}:{};
  const res=await worker.fetch(new Request("https://worker.invalid"+url,{method:"GET",headers}),env,{});
  const body=await res.json();
  return {status:res.status,body,calls:mocked.calls};
 } finally{globalThis.fetch=oldFetch;}
}
test("missing bearer: 401 before any database or ABC request",async()=>{
 const r=await invoke("/api/mis-alertas?user_id=ALICE",null);
 assert.equal(r.status,401);
 assert.deepEqual(r.calls,[]);
});
test("unknown or expired bearer: 401, no offers or preference lookup",async()=>{
 for(const t of ["invalid","expired"]){
  const r=await invoke("/api/mis-alertas?user_id=ALICE",t,{session:t==="expired"?"expired":"none"});
  assert.equal(r.status,401);
  assert.ok(r.calls.every(x=>x.table==="sessions"));
  assert.equal(r.body.ok,false);
 }
});
test("inactive account: authenticated token does not expose preferences",async()=>{
 const r=await invoke("/api/mis-alertas?user_id=ALICE","good",{accountActive:false});
 assert.equal(r.status,401);
 assert.ok(!r.calls.some(x=>x.table==="user_preferences"));
});
test("authenticated router replaces spoofed user_id and enforces plan and preference gate",async()=>{
 const r=await invoke("/api/mis-alertas?user_id=MALLORY","good");
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.ok,true);
 assert.equal(r.body.user?.id,"ALICE","Must NEVER read requested MALLORY account");
 assert.deepEqual(r.body.resultados,[],"Disabled alerts must not return offers");
 assert.equal(r.body.total,0);
 assert.ok(r.body.plan);
 assert.ok(r.body.subscription);
 assert.ok(r.calls.some(x=>x.table==="user_preferences"));
 assert.ok(!r.calls.some(x=>x.table==="catalogo_distritos"||x.table==="catalogo_cargos_areas"),
  "Do not request catalog / ABC for disabled preferences");
 assert.ok(r.calls.every(x=>!x.query.includes("MALLORY")));
 assert.ok(r.calls.every(x=>x.method==="GET"));
});
test("expired PLUS must not expose alerts, read preferences or renew trial",async()=>{
 const r=await invoke("/api/mis-alertas?user_id=OTHER","good",{planStatus:"EXPIRED"});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.ok,true);
 assert.deepEqual(r.body.items,[]);
 assert.ok(!r.calls.some(x=>x.table==="user_preferences"),"Expired plan must not read preferences");
 assert.ok(r.calls.filter(x=>x.table==="user_subscriptions").length>=2,
  "Existing expired subscription must prevent implicit trial recreation");
 assert.ok(r.calls.every(x=>x.method==="GET"),"No database mutation for expired account");
 assert.ok(r.calls.every(x=>!x.query.includes("OTHER")));
});
console.log("APD_ACTUAL_WORKER_AUTH_ROUTER_TEST: fixture-only and network-blocked");
