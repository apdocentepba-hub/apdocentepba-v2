/* Disposable PostgREST + PostgreSQL 17 process death/restart regression.
 * Separate Node.js process per phase; SIGKILL terminates the process.
 * NEVER connects to Supabase, ABC or any production endpoint.
 * No stored personal records or production credentials.
 */
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
const mode=process.argv[2];
const phases=new Set(["prepare-committing","commit-then-sigkill","recover-finalized",
 "prepare-uncommitted","sigkill-before-commit","recover-pending"]);
if(!phases.has(mode))throw Error("Invalid fixture phase");
const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(secret&&secret.length>=32,"Fake test-only signing secret required");
const encoded=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
const time=Math.floor(Date.now()/1000);
const signed=encoded({alg:"HS256",typ:"JWT"})+"."+
  encoded({role:"apd_api_scanner",iat:time,exp:time+600});
const token=signed+"."+createHmac("sha256",secret).update(signed).digest("base64url");
const base="http://127.0.0.1:3300/";
const runCommit="00000000-0000-0000-0000-000000003006";
const runPending="00000000-0000-0000-0000-000000003007";
async function request(name,body,{authenticated=true}={}){
 const response=await fetch(new URL("rpc/"+name,base),{
  method:"POST",credentials:"omit",redirect:"error",
  headers:{"Authorization":authenticated?"Bearer "+token:"",
   "Content-Type":"application/json","Accept":"application/json",
   "Content-Profile":"apd_scanner_api","Accept-Profile":"apd_scanner_api",
   "Prefer":"return=representation"},
  body:JSON.stringify(body)
 });
 return response;
}
async function rpc(name,body){
 const response=await request(name,body);
 assert.equal(response.ok,true,name+" failed HTTP "+response.status);
 return await response.json();
}
const fixture=(id,key,district)=>({
 source_offer_key:key,idoferta:"CI_"+id,iddetalle:key.slice(2),
 estado:"Publicada",distrito,escuela:"PRUEBA SOLO CI",cargo:"INFORMATICA",
 area:"PRUEBA",nivel_modalidad:"TECNICA",turno:"TM",jornada:"SIMPLE",
 hsmodulos:"2",cursodivision:"1 A",supl_desde:"",supl_hasta:"",
 finoferta:"2099-12-31",ult_movimiento:"2026-11-02T19:00:00Z",
 raw:{ci_only:true,solr_id:id}
});
async function prepare(runId,district,id,key,minute){
 assert.equal(await rpc("create_capture",{
  p_run_id:runId,p_district:district,p_expected_pages:1,
  p_started_at:"2026-11-02T"+minute+":00:00Z",
  p_captured_at:"2026-11-02T"+minute+":01:00Z"
 }),runId);
 assert.equal(await rpc("stage_capture_page",{
  p_run_id:runId,p_page_index:0,p_source_total:1,
  p_rows:[fixture(id,key,district)]
 }),1);
 assert.equal(await rpc("seal_capture",{p_run_id:runId}),1);
 assert.equal(await rpc("register_source_pairs",{
  p_run_id:runId,p_pairs:[{id,source_offer_key:key}]
 }),1);
 assert.equal(await rpc("revalidate_source_pairs",{
  p_run_id:runId,p_pairs:[{id,source_offer_key:key}]
 }),1);
}
async function status(runId){
 return rpc("capture_status",{p_run_id:runId});
}
function hardStop(){
 process.kill(process.pid,"SIGKILL");
 throw Error("SIGKILL did not terminate the disposable process");
}
if(mode==="prepare-committing"){
 await prepare(runCommit,"FLORENCIO VARELA","CI_SOLR_RESTART_1","D_9101","21");
 const r=await status(runCommit);
 assert.deepEqual(r,[{run_status:"ready",canonical_district:"FLORENCIO VARELA",
 completed_pages:1,expected_pages:1,source_pairs_verified:true}]);
 console.log("APD_RESTART_PREPARE_COMMITTING_PASSED: ready verified in disposable DB");
}else if(mode==="commit-then-sigkill"){
 // Server COMMIT finishes. The process gets the HTTP status/header but is
 // killed BEFORE reading/handling the body or persisting app acknowledgment.
 // A separate, new process must reconstruct the outcome by SELECT-only status.
 const response=await request("commit_capture",{p_run_id:runCommit});
 assert.equal(response.ok,true,"Disposable server commit did not succeed");
 hardStop();
}else if(mode==="recover-finalized"){
 const r=await status(runCommit);
 assert.deepEqual(r,[{run_status:"finalized",canonical_district:"FLORENCIO VARELA",
  completed_pages:1,expected_pages:1,source_pairs_verified:true}]);
 const anonymous=await request("capture_status",{p_run_id:runCommit},{authenticated:false});
 assert.equal(anonymous.ok,false,"Unauthenticated status access must be denied");
 console.log("APD_RESTART_FINALIZED_RECOVERED: new process reads finalized; zero commit retries");
}else if(mode==="prepare-uncommitted"){
 await prepare(runPending,"BERAZATEGUI","CI_SOLR_RESTART_2","D_9102","22");
 assert.equal((await status(runPending))[0].run_status,"ready");
 console.log("APD_RESTART_PREPARE_PENDING_PASSED");
}else if(mode==="sigkill-before-commit"){
 // Here the process is killed with a ready run but NO commit request sent.
 assert.equal((await status(runPending))[0].run_status,"ready");
 hardStop();
}else if(mode==="recover-pending"){
 const r=await status(runPending);
 assert.deepEqual(r,[{run_status:"ready",canonical_district:"BERAZATEGUI",
  completed_pages:1,expected_pages:1,source_pairs_verified:true}]);
 console.log("APD_RESTART_PENDING_UNTOUCHED: new process must not auto-commit or prune");
}
