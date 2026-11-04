/* Actual generated Worker full /api/mis-alertas circuit against fixture services.
 * Session, subscriptions, preferences, catalogues, ABC and PID are in-memory.
 * Network is DENIED to all other endpoints. No real accounts or writes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {copyFileSync,mkdirSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const bundles={
 bounded:"tmp/apd-bounded-abc-worker-release/worker_hotfix.js",
 published:"tmp/apd-published-query-research/worker_hotfix.js",
 pid:"tmp/apd-published-pid-research/worker_hotfix.js"
};
const variant=process.env.APD_TEST_WORKER_VARIANT||"published";
assert.ok(Object.hasOwn(bundles,variant),"Unexpected bundle");
mkdirSync("tmp/apd-full-route-fixture",{recursive:true});
const modulePath=resolve("tmp/apd-full-route-fixture/worker-"+variant+".mjs");
copyFileSync(bundles[variant],modulePath);
const {default:worker}=await import(pathToFileURL(modulePath).href);
const env={SUPABASE_URL:"https://supabase-fixture.invalid",SUPABASE_SERVICE_ROLE_KEY:"dummy-test-value"};
const offers={
 QUILMES:[
  {iddetalle:11,descripcioncargo:"PROFESOR DE MATEMÁTICA (MTM)",estado:"Publicada",turno:"T",descnivelmodalidad:"SECUNDARIA"},
  {iddetalle:12,descripcioncargo:"HISTORIA (HIS)",estado:"Publicada",turno:"T",descnivelmodalidad:"SECUNDARIA"},
  {iddetalle:13,descripcioncargo:"PROFESOR DE MATEMÁTICA (MTM)",estado:"Cerrada",turno:"T",descnivelmodalidad:"SECUNDARIA"}
 ],
 TIGRE:[
  {iddetalle:21,descripcioncargo:"PROFESOR DE MATEMÁTICA (MTM)",estado:"Publicada",turno:"T",descnivelmodalidad:"SECUNDARIA"},
  {iddetalle:22,descripcioncargo:"PROFESOR DE MATEMÁTICA (MTM)",estado:"Publicada",turno:"M",descnivelmodalidad:"SECUNDARIA"},
  {iddetalle:23,descripcioncargo:"PROFESOR DE MATEMÁTICA (MTM)",estado:"Publicada",turno:"T",descnivelmodalidad:"PRIMARIO"}
 ]};
for(const [district,docs] of Object.entries(offers)){
 for(const d of docs){
  Object.assign(d,{descdistrito:district,finoferta:"2099-12-31",
   ult_movimiento:"2026-11-04T11:00:00Z",idoferta:d.iddetalle});
 }
}
const fixtures={
 users:[{id:"ALICE",nombre:"Prueba",apellido:"Interna",email:"test@example.invalid",activo:true}],
 subscription_plans:[],
 user_subscriptions:[{id:"SUB",user_id:"ALICE",plan_code:"PLUS",status:"ACTIVE",
  source:"test",started_at:"2026-01-01T00:00:00Z",current_period_ends_at:"2099-12-31T00:00:00Z"}],
 user_preferences:[{user_id:"ALICE",alertas_activas:true,distrito_principal:"QUILMES",
  otros_distritos:["TIGRE"],cargos:["MATEMÁTICA (MTM)"],materias:[],
  niveles:["SECUNDARIO"],turnos:["T"]}],
 catalogo_distritos:[],
 catalogo_cargos_areas:[]
};
function createMock(){
 const seen={calls:[],abc:[],pid:0,dbWrites:0};
 const source=async (request,options={})=>{
  const u=new URL(String(request)),method=String(options?.method||"GET").toUpperCase();
  seen.calls.push({host:u.host,method,path:u.pathname});
  if(u.origin===env.SUPABASE_URL){
   assert.equal(method,"GET","Database writes are forbidden in fixture");
   const table=u.pathname.slice("/rest/v1/".length);
   if(table==="sessions"){
    assert.equal(u.searchParams.get("token"),"eq.FAKE_SESSION");
    return Response.json([{token:"FAKE_SESSION",user_id:"ALICE",activo:true,expires_at:"2099-12-31T00:00:00Z"}]);
   }
   assert.ok(Object.hasOwn(fixtures,table),"Unexpected fake Supabase table "+table);
   if(table==="users")assert.equal(u.searchParams.get("id"),"eq.ALICE");
   if(table==="user_subscriptions"||table==="user_preferences")assert.equal(u.searchParams.get("user_id"),"eq.ALICE");
   return Response.json(fixtures[table]);
  }
  if(u.hostname==="servicios3.abc.gob.ar"&&u.pathname==="/valoracion.docente/api/apd.oferta.encabezado/select"){
   assert.equal(method,"GET");
   const q=u.searchParams.get("q")||"";
   const district=Object.keys(offers).find(d=>q.includes('descdistrito:"'+d+'"'));
   assert.ok(district,"Unexpected ABC district query "+q);
   const fq=u.searchParams.get("fq");
   if(variant==="published")assert.equal(fq,'estado:"Publicada"');
   else assert.equal(fq,null);
   const docs=fq?offers[district].filter(d=>d.estado==="Publicada"):offers[district];
   const start=Number(u.searchParams.get("start")),rows=Number(u.searchParams.get("rows"));
   seen.abc.push({district,rows,fq});
   return Response.json({response:{docs:docs.slice(start,start+rows),numFound:docs.length}});
  }
  // Only the built-in read-only PID lookup actions may issue a POST; stub all
  // seven supported variants as "no stored PID". No actual remote request.
  if(method==="POST"&&u.hostname==="script.google.com"){
   const body=JSON.parse(String(options.body||"{}"));
   assert.ok(["obtener_ultima_pid_consulta","leer_pid_consulta","leer_pid_guardado",
    "pid_guardado","get_pid_guardado","buscar_pid_consulta","buscar_pid"].includes(body.action));
   assert.equal(body.docente_id,"ALICE");
   seen.pid++;
   return Response.json({ok:true,found:false});
  }
  throw Error("Network-denied unexpected endpoint: "+u.hostname+u.pathname);
 };
 return {source,seen};
}
test("actual authenticated Worker with active preferences returns exactly two compatible offers",async()=>{
 const mocks=createMock(),originalFetch=globalThis.fetch;
 globalThis.fetch=mocks.source;
 try{
  const response=await worker.fetch(new Request("https://worker.invalid/api/mis-alertas?user_id=MALLORY",{
   headers:{Authorization:"Bearer FAKE_SESSION"}
  }),env,{});
  const payload=await response.json();
  assert.equal(response.status,200,JSON.stringify(payload));
  assert.equal(payload.ok,true);
  assert.equal(payload.user.id,"ALICE");
  assert.deepEqual(payload.resultados.map(x=>String(x.iddetalle)),["11","21"]);
  assert.equal(payload.total,2);
  assert.equal(mocks.seen.abc.length,2,"one ABC request per district; no 8-page waste");
  assert.deepEqual(mocks.seen.abc.map(x=>x.district).sort(),["QUILMES","TIGRE"]);
  assert.ok(mocks.seen.pid>=1,"PID lookup must be safely attempted");
  assert.equal(mocks.seen.dbWrites,0);
  assert.ok(mocks.seen.calls.every(x=>!x.path.includes("MALLORY")));
  assert.ok(payload.resultados.every(x=>x.pid_match===false));
  assert.ok(payload.resultados.every(x=>x.abc_postulantes_url||x.abc_url));
  console.log("APD_ACTUAL_FULL_ROUTE_FAKE_FIXTURE "+JSON.stringify({
   variant,offers_returned:payload.total,
   abc_requests:mocks.seen.abc.length,pid_lookups:mocks.seen.pid,
   account_scope:"ALICE_ONLY",internet_access:false
  }));
 }finally{globalThis.fetch=originalFetch;}
});
