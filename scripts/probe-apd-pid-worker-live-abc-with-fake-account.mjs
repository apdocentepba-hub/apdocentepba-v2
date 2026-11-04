/* Full generated Worker -> REAL, PUBLIC ABC offers; all account, plan, PID,
 * Supabase sources synthetic and local. Does not contact any real user.
 * Strict network allowlist: only ABC GET may leave CI, <=16 requests.
 */
import assert from "node:assert/strict";
import {readFileSync,copyFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const candidatePath="tmp/apd-published-pid-research/worker_hotfix.js";
const code=readFileSync(candidatePath);
assert.equal(createHash("sha256").update(code).digest("hex"),
 "d4f84bdd2e1ca98bc04b2d23b6de51fc3ccf179c0a7168b904140adc6cc5433f",
 "Refuse changed Worker bundle");
mkdirSync("tmp/apd-real-abc-fake-account",{recursive:true});
const pathname=resolve("tmp/apd-real-abc-fake-account/worker_hotfix.mjs");
copyFileSync(candidatePath,pathname);
const {default:worker}=await import(pathToFileURL(pathname).href);
const origin="https://servicios3.abc.gob.ar";
const solr="/valoracion.docente/api/apd.oferta.encabezado/select";
const supa="https://supabase-test.invalid";
const env={SUPABASE_URL:supa,SUPABASE_SERVICE_ROLE_KEY:"SYNTHETIC_ONLY"};
const userId="SYNTHETIC_USER_NOT_REAL";
const session="SYNTHETIC_BEARER_NOT_REAL";
const allowedDistricts=new Set(["QUILMES","TIGRE"]);
const publicFetch=globalThis.fetch;
const metrics={abc:[],pid:0,db:[],rejected:false};
const json=rows=>Response.json(rows);
globalThis.fetch=async(input,init={})=>{
 const target=new URL(String(input)),method=String(init?.method||"GET").toUpperCase();
 if(target.origin===supa){
  assert.equal(method,"GET","No fake database writes");
  const table=target.pathname.replace("/rest/v1/","");
  metrics.db.push(table);
  if(table==="sessions"){
   assert.equal(target.searchParams.get("token"),"eq."+session);
   return json([{user_id:userId,token:session,activo:true,expires_at:"2099-12-31T00:00:00Z"}]);
  }
  if(table==="users"){
   assert.equal(target.searchParams.get("id"),"eq."+userId);
   return json([{id:userId,nombre:"Fixture",apellido:"No real",email:"fixture@example.invalid",activo:true}]);
  }
  if(table==="subscription_plans")return json([]);
  if(table==="user_subscriptions"){
   assert.equal(target.searchParams.get("user_id"),"eq."+userId);
   return json([{id:"SYNTHETIC_SUB",user_id:userId,plan_code:"PLUS",status:"ACTIVE",
    started_at:"2026-01-01T00:00:00Z",current_period_ends_at:"2099-12-31T00:00:00Z"}]);
  }
  if(table==="user_preferences"){
   assert.equal(target.searchParams.get("user_id"),"eq."+userId);
   return json([{user_id:userId,alertas_activas:true,distrito_principal:"QUILMES",
    otros_distritos:["TIGRE"],cargos:[],materias:[],niveles:[],turnos:[],
    alertas_email:false,alertas_telegram:false,alertas_whatsapp:false}]);
  }
  if(table==="catalogo_distritos"||table==="catalogo_cargos_areas")return json([]);
  throw Error("Unexpected fixture table "+table);
 };
 if(target.origin===origin && target.pathname===solr){
  assert.equal(method,"GET","ABC must remain read only");
  assert.equal(target.searchParams.get("fq"),'estado:"Publicada"');
  assert.equal(target.searchParams.get("rows"),"200");
  const districts=[...allowedDistricts].filter(d=>(target.searchParams.get("q")||"").includes('descdistrito:"'+d+'"'));
  assert.equal(districts.length,1,"Only declared districts");
  assert.ok(metrics.abc.length<16,"Request safety cap");
  const start=performance.now();
  const res=await publicFetch(target.toString(),{
   ...init,method:"GET",redirect:"error",signal:AbortSignal.timeout(20000)});
  assert.equal(res.status,200,"Public ABC source error");
  metrics.abc.push({district:districts[0],elapsed_ms:Math.round(performance.now()-start)});
  return res;
 }
 if(target.hostname==="script.google.com"){
  assert.equal(method,"POST");
  const body=JSON.parse(String(init.body||"{}"));
  assert.equal(body.docente_id,userId);
  assert.ok(["obtener_ultima_pid_consulta","leer_pid_consulta","leer_pid_guardado",
    "pid_guardado","get_pid_guardado","buscar_pid_consulta","buscar_pid"].includes(body.action));
  metrics.pid++;
  return json({ok:true,found:false});
 }
 metrics.rejected=true;
 throw Error("External network blocked by test: "+target.hostname);
};
try{
 const t0=performance.now();
 const response=await worker.fetch(new Request("https://worker-fixture.invalid/api/mis-alertas?user_id=UNTRUSTED_INPUT",{
  headers:{Authorization:"Bearer "+session}
 }),env,{});
 const data=await response.json();
 assert.equal(response.status,200,"Worker route rejected fixture: "+JSON.stringify({message:data?.message}));
 assert.equal(data.ok,true);
 assert.equal(data.user.id,userId,"Account scope MUST follow bearer token");
 assert.ok(Array.isArray(data.resultados));
 assert.equal(data.total,data.resultados.length);
 assert.equal(data.debug_distritos.length,2);
 assert.deepEqual(new Set(data.debug_distritos.map(x=>x.distrito_apd)),allowedDistricts);
 assert.ok(metrics.abc.length>=2&&metrics.abc.length<=16);
 assert.equal(metrics.pid,7,"No-PID fallback must finish without real PID storage");
 assert.equal(metrics.rejected,false);
 const ids=new Set();
 for(const item of data.resultados){
  assert.ok(item.source_offer_key);
  assert.ok(!ids.has(item.source_offer_key),"Duplicate offer in returned payload");
  ids.add(item.source_offer_key);
  assert.ok(allowedDistricts.has(String(item.distrito).toUpperCase()));
  assert.equal(String(item.raw?.estado||"").toUpperCase(),"PUBLICADA");
  assert.equal(item.pid_match,false);
  assert.ok(item.abc_url?.startsWith("http"));
  assert.ok(item.finoferta||item.fecha_cierre);
 }
 console.log("APD_PID_ACTUAL_WORKER_PUBLIC_ABC_SYNTHETIC_ACCOUNT_OK "+JSON.stringify({
  source:"live_public_ABC",candidate_sha256:"d4f84bdd2e1ca98bc04b2d23b6de51fc3ccf179c0a7168b904140adc6cc5433f",
  districts:[...allowedDistricts],published_offers_returned:data.resultados.length,
  source_offers_total:data.total_fuente,abc_gets:metrics.abc.length,
  duration_total_ms:Math.round(performance.now()-t0),pid_stub_calls:metrics.pid,
  real_pid_latency_measured:false,real_user_login:false,
  account_data:"synthetic",source_mutation:false,production_modified:false
 }));
}finally{globalThis.fetch=publicFetch;}
