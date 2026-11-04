/* Public anonymous preview smoke + Cloudflare GET-only attestation.
 * Does not mutate data, authenticate as a real user, email or deploy.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {checkLive} from "./check-apd-worker-live-version-readonly.mjs";
const worker="ancient-wildflower-cd37";
const version="29ef1c70-3cc9-4ddc-ac05-31000546aad3";
const uploadedModuleHash="16b4aa57976caefec91af04b768d18d20af46d3134a862d1e5c6e534c3dd8a26";
const preview="https://apd-final-safe-1104-ancient-wildflower-cd37.apdocentepba.workers.dev";
const source="https://api.cloudflare.com/client/v4";
const sha=x=>createHash("sha256").update(x).digest("hex");
async function get(path){
 const u=new URL(source+path);
 assert.equal(u.origin,new URL(source).origin);
 const response=await fetch(u,{method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+process.env.CLOUDFLARE_API_TOKEN,Accept:"application/json"},
  signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,"Cloudflare API unavailable at "+u.pathname);
 const data=await response.json();
 assert.equal(data.success,true);
 assert.ok(data.result);
 return data.result;
}
const checks=[];
async function publicSmoke(path,expected,method="GET"){
 const u=new URL(preview+path);
 assert.equal(u.hostname,"apd-final-safe-1104-ancient-wildflower-cd37.apdocentepba.workers.dev");
 let code=null;
 for(let attempt=0;attempt<4;attempt++){
  try {
   const res=await fetch(u,{method,redirect:"manual",headers:{Accept:"application/json"},
    signal:AbortSignal.timeout(12000)});
   code=res.status;
   if(code===expected)break;
  }catch(error){
   code=0;
  }
  await new Promise(resolve=>setTimeout(resolve,1200));
 }
 checks.push({path:path.replace(/user_id=[^&]+/g,"user_id=synthetic"),method,expected,observed:code});
 assert.equal(code,expected,"Preview API contract mismatch at "+path);
}
async function main(){
 assert.ok(process.env.CLOUDFLARE_API_TOKEN,"No Cloudflare token: cannot verify version");
 const before=await checkLive();
 assert.equal(before.active_version_id,"da0632dd-1b9e-4332-9c4a-75b5eade8d74");
 assert.equal(before.verified_required_binding_count,29);
 assert.equal(before.verified_live_schedule_count,4);
 const accounts=await get("/accounts?per_page=50");
 assert.ok(Array.isArray(accounts));
 let id=String(process.env.CLOUDFLARE_ACCOUNT_ID||"").trim();
 if(id)assert.ok(accounts.some(x=>x.id===id));
 else {assert.equal(accounts.length,1);id=accounts[0].id;}
 const base="/accounts/"+id+"/workers/";
 const versionInfo=await get(base+"workers/"+worker+"/versions/"+version+"?include=modules");
 assert.equal(versionInfo.id,version);
 assert.equal(versionInfo.modules?.length,1);
 const bytes=Buffer.from(versionInfo.modules[0].content_base64||"","base64");
 assert.equal(sha(bytes),uploadedModuleHash,"Uploaded module drifted");
 assert.equal(versionInfo.bindings?.length,29);
 const deploy=await get(base+"scripts/"+worker+"/deployments");
 const active=(deploy.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
 assert.equal(active.length,1);
 assert.equal(Number(active[0].percentage),100);
 assert.equal(active[0].version_id,before.active_version_id);
 assert.ok(!active.some(x=>x.version_id===version));
 const fake="00000000-0000-4000-8000-000000000000";
 await publicSmoke("/api/version",200);
 await publicSmoke("/api/planes",200);
 await publicSmoke("/api/mis-alertas?user_id="+fake,401);
 await publicSmoke("/api/mi-plan?user_id="+fake,401);
 await publicSmoke("/api/historico-resumen?user_id="+fake,401);
 await publicSmoke("/api/mis-alertas",200,"OPTIONS");
 const after=await checkLive();
 assert.equal(after.active_version_id,before.active_version_id);
 assert.equal(after.active_worker_source_sha256,before.active_worker_source_sha256);
 console.log("APD_FINAL_ZERO_PREVIEW_SMOKE_OK "+JSON.stringify({
  uploaded_version:version,production_version:after.active_version_id,
  production_traffic_percent:100,preview_traffic_to_production_percent:0,
  checked_routes:checks,active_crons:after.verified_live_schedule_count,
  live_users_or_data_read:false,uploads_or_emails_sent:0
 }));
}
try {await main();}
catch(error){console.error("APD_FINAL_ZERO_PREVIEW_SMOKE_FAILED "+String(error?.message||"unknown"));process.exitCode=1;}
