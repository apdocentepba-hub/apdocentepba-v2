/* READ-ONLY go/no-go attestation for the already uploaded APD 0%-traffic
 * candidate. No database, accounts, live sessions, POST, PUT, PATCH or DELETE.
 * Do not interpret this check as permission to assign production traffic.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {checkLive} from "./check-apd-worker-live-version-readonly.mjs";
import {fileURLToPath} from "node:url";
const API="https://api.cloudflare.com/client/v4";
const WORKER="ancient-wildflower-cd37";
const CANDIDATE="90e76973-5509-4d1b-82e1-91b4c2811295";
const SOURCE_SHA256="d4f84bdd2e1ca98bc04b2d23b6de51fc3ccf179c0a7168b904140adc6cc5433f";
const MODULE_SHA256="cba6427814e9bd0d50c597c7db1c678fd6715862d0a921b80baea1d23b955881";
const SHA=x=>createHash("sha256").update(x).digest("hex");
async function get(path,token,request){
 const u=new URL(API+path);
 assert.equal(u.origin,API,"Cloudflare origin violation");
 assert.equal(u.protocol,"https:");
 const response=await request(u.toString(),{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+token,Accept:"application/json"},
  signal:AbortSignal.timeout(20000)
 });
 assert.equal(response.status,200,"Cloudflare GET failed at "+u.pathname);
 const d=await response.json();
 assert.equal(d.success,true,"Cloudflare returned unsuccessful result");
 assert.ok(d.result,"Missing Cloudflare result");
 return d.result;
}
export async function check({env=process.env,request=fetch}={}){
 const token=String(env.CLOUDFLARE_API_TOKEN||"").trim();
 assert.ok(token,"No Cloudflare read-only token: fail closed");
 const manifest=JSON.parse(readFileSync("worker-live/manifest.json","utf8"));
 assert.equal(manifest.worker_name,WORKER);
 const live=await checkLive({env,request,manifestOverride:manifest});
 const accounts=await get("/accounts?per_page=50",token,request);
 assert.ok(Array.isArray(accounts));
 let account=String(env.CLOUDFLARE_ACCOUNT_ID||"").trim();
 if(account) assert.ok(accounts.some(a=>a.id===account),"Account mismatch");
 else{assert.equal(accounts.length,1,"Ambiguous Cloudflare account");account=accounts[0].id;}
 assert.match(account,/^[0-9a-f]{32}$/i);
 const root="/accounts/"+account+"/workers/";
 const candidate=await get(root+"workers/"+WORKER+"/versions/"+CANDIDATE+"?include=modules",token,request);
 assert.equal(candidate.id,CANDIDATE,"Incorrect candidate version");
 assert.equal(candidate.main_module,"worker_hotfix.js");
 assert.equal(candidate.modules?.length,1,"Unexpected Worker topology");
 const module=Buffer.from(candidate.modules[0].content_base64||"","base64");
 assert.ok(module.length>1000,"Candidate module bytes missing");
 assert.equal(SHA(module),MODULE_SHA256,"Uploaded candidate bytes drifted");
 assert.equal(candidate.modules[0].name,"worker_hotfix.js");
 const actualBindings=(candidate.bindings||[]).map(x=>x.name+":"+x.type).sort();
 const expectedBindings=(manifest.bindings||[]).map(x=>x.name+":"+x.type).sort();
 assert.equal(expectedBindings.length,29);
 assert.deepEqual(actualBindings,expectedBindings,"Candidate bindings drifted");
 const oldKV=manifest.bindings.find(x=>x.name==="EMAIL_SWEEP_STATE");
 const newKV=candidate.bindings.find(x=>x.name==="EMAIL_SWEEP_STATE");
 assert.equal(newKV.namespace_id||newKV.id,oldKV.namespace_id,"KV namespace drifted");
 const deployment=await get(root+"scripts/"+WORKER+"/deployments",token,request);
 const positives=(deployment.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
 assert.equal(positives.length,1);
 assert.equal(positives[0].version_id,live.active_version_id);
 assert.equal(Number(positives[0].percentage),100);
 assert.ok(!positives.some(x=>x.version_id===CANDIDATE),"STOP: 0% candidate serving traffic");
 assert.equal(live.verified_live_schedule_count,4);
 const report={
  result:"READY_FOR_AUTHENTICATED_OWN_ACCOUNT_SMOKE_NOT_TRAFFIC_APPROVAL",
  worker:WORKER,
  candidate_version_id:CANDIDATE,candidate_source_sha256:SOURCE_SHA256,
  candidate_uploaded_module_sha256:MODULE_SHA256,confirmed_bindings:actualBindings.length,
  confirmed_crons:live.verified_live_schedule_count,
  live_version_id:live.active_version_id,live_traffic_percent:100,
  candidate_traffic_percent:0,active_source_sha256:live.active_worker_source_sha256,
  rollback_target:live.active_version_id,
  no_credentials_logged:true,no_mutation:true,account_smoke_real_pending:true,
  must_obtain_separate_traffic_authorization:true
 };
 console.log("APD_PID_RELEASE_READINESS_READONLY_OK "+JSON.stringify(report));
 return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{await check();}catch(e){console.error("APD_PID_RELEASE_READINESS_READONLY_FAIL "+String(e?.message||"unclassified"));process.exitCode=1;}
}
