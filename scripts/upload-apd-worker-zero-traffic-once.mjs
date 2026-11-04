/* ONE-TIME, EXPLICITLY AUTHORIZED upload of an APD Worker VERSION with 0% traffic.
 * Called by a push-only staging branch after exact source, 4 cron, 29 binding,
 * authorization, and no-regression CI checks. Never uses "deploy".
 * Does not print token, full Wrangler output, secret values or raw modules.
 */
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {checkLive} from "./check-apd-worker-live-version-readonly.mjs";
import {generate} from "./build-apd-worker-zero-traffic-config.mjs";

const worker="ancient-wildflower-cd37";
const origin="https://api.cloudflare.com/client/v4";
const allowedBranch="refs/heads/staging/apd-worker-zero-traffic-20261104";
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const sha=x=>createHash("sha256").update(x).digest("hex");
function approved(){
 assert.equal(process.env.GITHUB_EVENT_NAME,"push","STOP: push-only staging release gate");
 assert.equal(process.env.GITHUB_REF,allowedBranch,"STOP: unapproved Git branch");
 assert.equal(process.env.APD_ZERO_TRAFFIC_UPLOAD_APPROVED,"yes_20261104","STOP: missing one-shot user approval marker");
 assert.ok(process.env.CLOUDFLARE_API_TOKEN,"STOP: Cloudflare token missing");
 const expected=JSON.parse(readFileSync("worker-live/manifest.json","utf8"));
 assert.equal(expected.worker_name,worker);
 const candidate=readFileSync("tmp/apd-bounded-abc-worker-release/worker_hotfix.js");
 assert.equal(sha(candidate),"6ee13869ec0d6363806e1bfc8990d529f7386b956c7bd30530f5e0109c861b6e","STOP: candidate source SHA mismatch");
 assert.equal(sha(readFileSync("worker-live/worker_hotfix.js")),expected.modules[0].source_sha256||expected.modules[0].module_sha256||expected.modules[0].sha256);
 return expected;
}
async function main(){
 const manifest=approved();
 const before=await checkLive();
 assert.equal(before.active_version_id,manifest.version_id);
 assert.equal(before.verified_required_binding_count,29);
 assert.equal(before.verified_live_schedule_count,4);
 const token=process.env.CLOUDFLARE_API_TOKEN;
 const accountRows=await api("GET","/accounts?per_page=50",token);
 assert.ok(Array.isArray(accountRows));
 let account=String(process.env.CLOUDFLARE_ACCOUNT_ID||"").trim();
 if(account) assert.ok(accountRows.some(x=>x.id===account),"STOP: configured account not accessible");
 else{
  assert.equal(accountRows.length,1,"STOP: ambiguous account, set CLOUDFLARE_ACCOUNT_ID");
  account=accountRows[0].id;
 }
 assert.match(account,/^[0-9a-f]{32}$/i);
 const endpoint="/accounts/"+account+"/workers/scripts/"+worker;
 const listingBefore=await api("GET",endpoint+"/versions?per_page=50",token);
 assert.ok(Array.isArray(listingBefore.items),"Cannot list existing versions");
 const knownIds=new Set(listingBefore.items.map(x=>x.id));
 const conf=generate();
 assert.equal(conf.trigger_count,4);
 // Safely test whether installed Wrangler supports non-mutating upload flags.
 const argsBase=["--yes","wrangler@4.157.0"];
 const help=spawnSync("npx",[...argsBase,"versions","upload","--help"],{
   encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:90000,maxBuffer:1024*1024
 });
 assert.equal(help.status,0,"Could not inspect Wrangler upload flags");
 const helpText=String(help.stdout||"")+String(help.stderr||"");
 for(const flag of ["--keep-vars","--strict","--config"]){
  assert.ok(helpText.includes(flag),"STOP: Wrangler does not advertise "+flag);
 }
 // Security-critical: upload, NOT deploy. Do not pass --yes to versions upload;
 // noninteractive CI must fail if the CLI asks for unexpected confirmations.
 const uploadArgs=["--yes","wrangler@4.157.0","versions","upload",
  "tmp/apd-bounded-abc-worker-release/worker_hotfix.js",
  "--config","tmp/apd-bounded-abc-worker-release/wrangler.zero-traffic.toml",
  "--name",worker,"--keep-vars","--strict",
  "--tag","apd-abc-2district-20261104-lab",
  "--message","APD ABC candidate, authorized upload only, no production traffic"
 ];
 if(uploadArgs.includes("deploy"))throw Error("STOP: forbidden deploy command");
 const cli=spawnSync("npx",uploadArgs,{
   env:{...process.env,WRANGLER_SEND_METRICS:"false",CI:"true"},
   encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:180000,maxBuffer:8*1024*1024
 });
 if(cli.error)throw Error("Wrangler upload process failed (details deliberately redacted)");
 if(cli.status!==0){
  const out=String(cli.stdout||"")+"\n"+String(cli.stderr||"");
  const reason=/strict|conflict/i.test(out)?"strict_conflict":/permission|unauthoriz|forbidden/i.test(out)?"permissions":/binding|variable|secret/i.test(out)?"bindings":/config/i.test(out)?"config":"other";
  throw Error("SAFE ABORT: version upload failed; exit_code="+cli.status+"; category="+reason+"; no traffic promotion attempted");
 }
 const after=await checkLive();
 assert.equal(after.active_version_id,before.active_version_id,"STOP: active production version changed");
 assert.equal(after.active_worker_source_sha256,before.active_worker_source_sha256,"STOP: active code changed");
 assert.equal(after.verified_live_schedule_count,4,"STOP: active cron schedule drift");
 const listingAfter=await api("GET",endpoint+"/versions?per_page=50",token);
 assert.ok(Array.isArray(listingAfter.items),"Cloudflare versions list missing after upload");
 const newIds=listingAfter.items.filter(x=>x.id&&!knownIds.has(x.id));
 assert.equal(newIds.length,1,"STOP: unable to identify exactly one uploaded version");
 const newId=newIds[0].id;
 assert.match(newId,uuid);
 assert.notEqual(newId,manifest.version_id,"STOP: candidate is active version");
 const candidate=await api("GET","/accounts/"+account+"/workers/workers/"+worker+"/versions/"+newId+"?include=modules",token);
 assert.equal(candidate.id,newId);
 assert.equal(candidate.main_module,"worker_hotfix.js");
 assert.equal(candidate.modules?.length,1,"STOP: uploaded module topology changed");
 const code=Buffer.from(candidate.modules[0].content_base64||"","base64");
 assert.ok(code.length>1000,"STOP: compiled module missing");
 const codeText=code.toString("utf8");
 assert.ok(codeText.includes("districtResults")&&codeText.includes("pidPromise"),
  "STOP: uploaded version lacks both audited optimization markers");
 const beforeBindings=manifest.bindings.map(b=>b.name+":"+b.type).sort();
 const afterBindings=(candidate.bindings??[]).map(b=>b.name+":"+b.type).sort();
 assert.deepEqual(afterBindings,beforeBindings,"STOP: uploaded version bindings differ from protected active snapshot");
 const liveKV=manifest.bindings.find(b=>b.name==="EMAIL_SWEEP_STATE");
 const newKV=candidate.bindings.find(b=>b.name==="EMAIL_SWEEP_STATE");
 assert.equal(newKV?.namespace_id||newKV?.id,liveKV.namespace_id,"STOP: KV namespace changed");
 const deployment=await api("GET",endpoint+"/deployments",token);
 const serving=(deployment.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
 assert.equal(serving.length,1);
 assert.equal(Number(serving[0].percentage),100);
 assert.equal(serving[0].version_id,before.active_version_id,
  "STOP: candidate unexpectedly received traffic");
 assert.ok(!serving.some(x=>x.version_id===newId),"STOP: new version unexpectedly receives traffic");
 const receipt={
  result:"UPLOADED_ZERO_TRAFFIC",
  worker_name:worker,
  candidate_version_id:newId,
  candidate_module_sha256:sha(code),
  candidate_source_sha256:sha(readFileSync("tmp/apd-bounded-abc-worker-release/worker_hotfix.js")),
  candidate_binding_count:afterBindings.length,
  initial_and_current_active_version_id:before.active_version_id,
  active_traffic_percent:100,
  candidate_traffic_percent:0,
  active_module_sha256:after.active_worker_source_sha256,
  active_cron_count:after.verified_live_schedule_count,
  cloudflare_version_created:true,
  active_production_traffic_changed:false,
  production_users_traffic_changed:false,
  active_deployment_changed:false,
  credentials_logged:false,
  next_gate:"authorized separate account smoke and explicit permission for any production traffic"
 };
 writeFileSync("tmp/apd-bounded-abc-worker-release/zero-traffic-upload-receipt.json",
  JSON.stringify(receipt,null,2)+"\n");
 console.log("APD_ZERO_TRAFFIC_UPLOAD_VERIFIED "+JSON.stringify(receipt));
}
async function api(method,path,token){
 assert.equal(method,"GET","No HTTP writes through attestation API");
 const url=new URL(origin+path);
 assert.equal(url.origin,new URL(origin).origin);
 assert.ok(url.pathname.startsWith("/client/v4/"),"STOP: Cloudflare API path escape");
 const r=await fetch(url,{
  method,headers:{"Authorization":"Bearer "+token,"Accept":"application/json"},
  redirect:"error",cache:"no-store",signal:AbortSignal.timeout(18000)
 });
 assert.equal(r.status,200,"Cloudflare read-only API status mismatch on "+url.pathname);
 const j=await r.json();
 assert.ok(j.success&&j.result,"Cloudflare API response invalid at "+url.pathname);
 return j.result;
}
try{await main();}
catch(error){console.error("APD_ZERO_TRAFFIC_UPLOAD_ABORTED "+String(error?.message||"unclassified failure"));process.exitCode=1;}
