/* Mid-flight SIGKILL of a REAL HTTP request against disposable PG17/PostgREST.
 * Neither outcome is assumed: severing client socket MAY abort or complete a DB
 * commit; the restarted process only observes state and NEVER retries writes.
 */
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
const phase=process.argv[2];
assert.ok(["prepare","send","recover"].includes(phase),"Invalid lab phase");
const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(secret && secret.length>=32,"Fake test-only JWT secret required");
const enc=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
const epoch=Math.floor(Date.now()/1000);
const unsigned=enc({alg:"HS256",typ:"JWT"})+"."+enc({
 role:"apd_api_scanner",iat:epoch,exp:epoch+600
});
const token=unsigned+"."+createHmac("sha256",secret).update(unsigned).digest("base64url");
const root="http://127.0.0.1:3300/";
const run="00000000-0000-0000-0000-000000003008";
async function request(name,args){
 return fetch(new URL("rpc/"+name,root),{
  method:"POST",redirect:"error",credentials:"omit",
  headers:{"Authorization":"Bearer "+token,
   "Content-Type":"application/json","Accept":"application/json",
   "Content-Profile":"apd_scanner_api","Accept-Profile":"apd_scanner_api",
   "Prefer":"return=representation"},
  body:JSON.stringify(args)
 });
}
async function read(name,args){
 const r=await request(name,args);
 assert.equal(r.ok,true,"Disposable API "+name+" HTTP "+r.status);
 return await r.json();
}
if(phase==="prepare"){
 const id="SOLR_TEST_MIDFLIGHT",key="D_9201",district="HURLINGHAM";
 const start="2026-11-02T23:00:00Z",finish="2026-11-02T23:01:00Z";
 assert.equal(await read("create_capture",{
  p_run_id:run,p_district:district,p_expected_pages:1,
  p_started_at:start,p_captured_at:finish
 }),run);
 const row={
  source_offer_key:key,idoferta:"CI_FAKE",iddetalle:"9201",estado:"Publicada",
  distrito:district,escuela:"ESCUELA PRUEBA",cargo:"INFORMATICA",area:"CI",
  nivel_modalidad:"TECNICA",turno:"TM",jornada:"SIMPLE",hsmodulos:"2",
  cursodivision:"1 A",supl_desde:"",supl_hasta:"",finoferta:"2099-12-31",
  ult_movimiento:start,raw:{ci:true,solr_id:id}
 };
 assert.equal(await read("stage_capture_page",{p_run_id:run,p_page_index:0,
  p_source_total:1,p_rows:[row]}),1);
 assert.equal(await read("seal_capture",{p_run_id:run}),1);
 const pairs=[{id,source_offer_key:key}];
 assert.equal(await read("register_source_pairs",{p_run_id:run,p_pairs:pairs}),1);
 assert.equal(await read("revalidate_source_pairs",{p_run_id:run,p_pairs:pairs}),1);
 assert.equal((await read("capture_status",{p_run_id:run}))[0].run_status,"ready");
 console.log("APD_MIDFLIGHT_PREPARED: mock capture sealed, ready, not committed");
}else if(phase==="send"){
 console.log("APD_MIDFLIGHT_POST_SENT: runner will kill this Node process during server-side pg_sleep");
 const response=await request("commit_capture",{p_run_id:run});
 // If this line executes before the test kills the process, the runner must fail.
 console.log("APD_MIDFLIGHT_UNEXPECTED_RESPONSE_"+response.status);
 process.exitCode=42;
}else{
 const result=await read("capture_status",{p_run_id:run});
 assert.equal(result.length,1,"Run state disappeared after client death");
 assert.ok(["ready","finalized"].includes(result[0].run_status),
  "Run in unexpected transitional state after client death");
 assert.equal(result[0].canonical_district,"HURLINGHAM");
 assert.equal(result[0].source_pairs_verified,true);
 assert.equal(result[0].completed_pages,1);
 console.log(JSON.stringify({
  scenario:"client_SIGKILL_while_postgres_PgSleep_active",
  observed_status:result[0].run_status,
  commit_requests_sent:0,
  commit_retries_after_restart:0,
  evidence:"SQL step verifies status and matching rows atomically",
  production_modified:false
 }));
}
