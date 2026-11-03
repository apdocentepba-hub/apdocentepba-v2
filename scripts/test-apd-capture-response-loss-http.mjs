/* Real disposable PostgREST/PG17 run-status reconciliation after a
 * SYNTHETIC lost HTTP response; no production endpoints or credentials.
 * Do not automatically replay a commit after transport ambiguity.
 */
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(secret&&secret.length>=32,"Missing fake JWT signing key");
const encode=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
const now=Math.floor(Date.now()/1000);
const unsigned=encode({alg:"HS256",typ:"JWT"})+"."+
 encode({role:"apd_api_scanner",iat:now,exp:now+600});
const token=unsigned+"."+createHmac("sha256",secret).update(unsigned).digest("base64url");
const runId="00000000-0000-0000-0000-000000003005";
const base="http://127.0.0.1:3300/";
async function call(name,args,{useToken=true}={}){
 const resp=await fetch(new URL("rpc/"+name,base),{
  method:"POST",redirect:"error",credentials:"omit",
  headers:{"Authorization":useToken?"Bearer "+token:"",
   "Content-Type":"application/json","Accept":"application/json",
   "Content-Profile":"apd_scanner_api","Accept-Profile":"apd_scanner_api",
   "Prefer":"return=representation"},
  body:JSON.stringify(args)
 });
 return {ok:resp.ok,status:resp.status,
   value:resp.ok?await resp.json():null};
}
async function success(name,args){
 const result=await call(name,args);
 assert.equal(result.ok,true,name+" rejected by disposable API, HTTP "+result.status);
 return result.value;
}
const status=async()=>success("capture_status",{p_run_id:runId});
assert.deepEqual(await status(),[],"Unknown run must not look finalized");
const unauth=await call("capture_status",{p_run_id:runId},{useToken:false});
assert.equal(unauth.ok,false,"Public roles must not read scan state");
assert.equal(await success("create_capture",{
 p_run_id:runId,p_district:"QUILMES",p_expected_pages:1,
 p_started_at:"2026-11-02T20:00:00Z",
 p_captured_at:"2026-11-02T20:01:00Z"
}),runId);
const pair={id:"SOLR_FAKE_LOST_RESPONSE",source_offer_key:"D_9001"};
const offer={source_offer_key:pair.source_offer_key,
 idoferta:"FAKE",iddetalle:"9001",estado:"Publicada",distrito:"QUILMES",
 escuela:"ESCUELA FICTICIA",cargo:"INFORMATICA",area:"PRUEBA",
 nivel_modalidad:"TECNICA",turno:"TM",jornada:"SIMPLE",hsmodulos:"2",
 cursodivision:"1 A",supl_desde:"",supl_hasta:"",
 finoferta:"2099-12-31",ult_movimiento:"2026-11-02T19:00:00Z",
 raw:{ci:true,id:pair.id}};
assert.equal(await success("stage_capture_page",{
 p_run_id:runId,p_page_index:0,p_source_total:1,p_rows:[offer]
}),1);
assert.equal(await success("seal_capture",{p_run_id:runId}),1);
assert.equal(await success("register_source_pairs",{
 p_run_id:runId,p_pairs:[pair]
}),1);
assert.equal(await success("revalidate_source_pairs",{
 p_run_id:runId,p_pairs:[pair]
}),1);
assert.deepEqual(await status(),[{
 run_status:"ready",canonical_district:"QUILMES",
 completed_pages:1,expected_pages:1,source_pairs_verified:true
}]);

// The server DOES commit once. The harness discards the successful response,
// emulating a client that lost acknowledgment after commit completion.
let lostResponse=false;
try{
 const committed=await call("commit_capture",{p_run_id:runId});
 assert.equal(committed.ok,true,"A disposable commit is required for this scenario");
 throw new Error("SIMULATED_LOST_HTTP_ACK_AFTER_SERVER_COMMIT");
}catch(e){
 assert.equal(e.message,"SIMULATED_LOST_HTTP_ACK_AFTER_SERVER_COMMIT");
 lostResponse=true;
}
assert.equal(lostResponse,true);
const observed=await status();
assert.deepEqual(observed,[{
 run_status:"finalized",canonical_district:"QUILMES",
 completed_pages:1,expected_pages:1,source_pairs_verified:true
}]);
// Intentionally NO second commit call. Reconcile using read-only status.
console.log(JSON.stringify({
 scenario:"synthetic_response_loss_after_durable_commit",
 observed_status:observed[0].run_status,
 reconciled_via_readonly_rpc:true,
 commit_requests_sent:1,
 commit_retries_sent:0,
 public_role_status_access:false,
 no_production_connections:true
}));
