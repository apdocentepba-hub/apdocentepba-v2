/*
 * APDocentePBA: user-authorized upload-only release for one immutable Worker.
 * No "deploy" command, no assignment of production traffic, no email calls,
 * no account writes. Fail closed on changed Cloudflare/manifest/source.
 */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {checkLive} from "./check-apd-worker-live-version-readonly.mjs";
import {generate} from "./build-apd-worker-zero-traffic-config.mjs";

const worker = "ancient-wildflower-cd37";
const approvedBranch = "refs/heads/staging/apd-final-zero-traffic-20261104";
const eventMessage = "release(apd): authorized one-time 0-percent final Worker upload";
const expectedCandidateHash = "0d6f54103c7821960cdd28fbf395fa10ba3837dc60aa9618fb4c82d1380a73fe";
const approvalPath = "release-approvals/apd-final-zero-traffic-20261104.json";
const tag = "apd-final-zero-20261104-0d6f54103c78";
const tmp = "tmp/apd-final-zero-traffic";
const endpoint = "https://api.cloudflare.com/client/v4";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const versionId = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

function confirmAuthorization() {
  assert.equal(process.env.GITHUB_EVENT_NAME, "push", "SAFE ABORT: push only");
  assert.equal(process.env.GITHUB_REF, approvedBranch, "SAFE ABORT: staging branch only");
  assert.equal(process.env.APD_UPLOAD_APPROVED, "yes_20261104_zero_only", "SAFE ABORT: no user authorization marker");
  assert.equal(process.env.APD_EVENT_COMMIT_MESSAGE, eventMessage, "SAFE ABORT: no one-time release commit");
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, "SAFE ABORT: Cloudflare token unavailable");
  const approval = JSON.parse(readFileSync(approvalPath,"utf8"));
  assert.deepEqual(approval, {
    project:"APDocentePBA",
    action:"upload_version_only",
    worker,
    candidate_source_sha256:expectedCandidateHash,
    production_traffic_percent_change:0,
    approval:"user_explicit_mandale_2026-11-04"
  }, "SAFE ABORT: approval marker drifted");
}

async function cloudGet(path, accountToken) {
  const url = new URL(endpoint + path);
  assert.equal(url.origin, new URL(endpoint).origin);
  assert.ok(url.pathname.startsWith("/client/v4/"),"SAFE ABORT: escaped Cloudflare API");
  const response = await fetch(url,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer " + accountToken,Accept:"application/json"},
    signal:AbortSignal.timeout(18000)
  });
  assert.equal(response.status,200,"Cloudflare read failed: " + url.pathname);
  const value = await response.json();
  assert.equal(value.success,true,"Cloudflare API denied read: " + url.pathname);
  assert.ok(value.result,"Cloudflare result missing: " + url.pathname);
  return value.result;
}

function versionList(payload) {
  const list = Array.isArray(payload) ? payload : (payload.items || payload.versions);
  assert.ok(Array.isArray(list),"Cloudflare version list absent");
  return list;
}

async function main() {
  confirmAuthorization();
  const manifest = JSON.parse(readFileSync("worker-live/manifest.json","utf8"));
  assert.equal(manifest.worker_name,worker);
  assert.equal(manifest.version_id,"da0632dd-1b9e-4332-9c4a-75b5eade8d74");
  assert.equal(manifest.bindings?.length,29);
  assert.equal(manifest.schedules?.length,4);
  const src="tmp/apd-morning-worker/worker_hotfix.js";
  const source=readFileSync(src);
  assert.equal(sha(source),expectedCandidateHash,"SAFE ABORT: final candidate bytes differ");
  const candidateText = source.toString("utf8");
  for (const marker of ["apdOfferDeadlineStatus","morningUrgent","syncUserOfferState","districtResults","pidPromise"]) {
    assert.ok(candidateText.includes(marker),"SAFE ABORT: candidate lacks " + marker);
  }
  const localAttestation=JSON.parse(readFileSync("tmp/apd-morning-worker/attestation.json","utf8"));
  assert.equal(localAttestation.candidate_sha256,expectedCandidateHash,"SAFE ABORT: generator attestation drifted");
  assert.equal(localAttestation.cron_triggers_unchanged,4);

  const before=await checkLive();
  assert.equal(before.active_version_id,manifest.version_id,"SAFE ABORT: production changed");
  assert.equal(before.verified_required_binding_count,29);
  assert.equal(before.verified_live_schedule_count,4);

  const token=process.env.CLOUDFLARE_API_TOKEN;
  const accounts=await cloudGet("/accounts?per_page=50",token);
  assert.ok(Array.isArray(accounts));
  let account=String(process.env.CLOUDFLARE_ACCOUNT_ID||"").trim();
  if (account) assert.ok(accounts.some(x=>x.id===account),"SAFE ABORT: Cloudflare account unavailable");
  else {
    assert.equal(accounts.length,1,"SAFE ABORT: ambiguous Cloudflare account");
    account=accounts[0].id;
  }
  assert.match(account,/^[0-9a-f]{32}$/i);
  const root="/accounts/"+account+"/workers/scripts/"+worker;
  const listingBefore=versionList(await cloudGet(root+"/versions?per_page=100",token));
  const foundTag=listingBefore.find(x=>x.annotations?.["workers/tag"]===tag);
  if (foundTag) {
    throw Error("SAFE ABORT: one-time tag already exists; duplicate upload blocked");
  }
  const beforeIds=new Set(listingBefore.map(x=>x.id));

  mkdirSync(tmp,{recursive:true});
  const configPath=join(tmp,"wrangler.zero-traffic.toml");
  const config=generate({manifest,output:configPath});
  assert.equal(config.trigger_count,4);
  assert.equal(config.required_bindings,29);
  assert.equal(config.uses_keep_vars,true);
  const workerPath=join(tmp,"worker_hotfix.js");
  copyFileSync(src,workerPath);
  assert.equal(sha(readFileSync(workerPath)),expectedCandidateHash);

  // versions upload does NOT create a deployment; no calls to versions deploy.
  const base=["--yes","wrangler@4.157.0"];
  const help=spawnSync("npx",[...base,"versions","upload","--help"],{
    encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:120000,maxBuffer:1024*1024
  });
  assert.equal(help.status,0,"SAFE ABORT: cannot verify installed Wrangler flags");
  const helpText=String(help.stdout||"")+String(help.stderr||"");
  for(const flag of ["--keep-vars","--strict","--config","--tag","--preview-alias"]){
    assert.ok(helpText.includes(flag),"SAFE ABORT: missing CLI option "+flag);
  }
  const args=[
    ...base,"versions","upload",workerPath,
    "--config",configPath,
    "--name",worker,
    "--keep-vars","--strict",
    "--preview-alias","apd-final-safe-1104",
    "--tag",tag,
    "--message","APD final 0%-traffic user-authorized candidate sha256="+expectedCandidateHash
  ];
  assert.equal(args.includes("deploy"),false,"SAFE ABORT: forbidden production deploy");
  const upload=spawnSync("npx",args,{
    env:{...process.env,CI:"true",WRANGLER_SEND_METRICS:"false"},
    encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:240000,maxBuffer:8*1024*1024
  });
  if(upload.error) throw Error("UPLOAD FAILED: noninteractive CLI error (no traffic operation)");
  if(upload.status!==0){
    const result=String(upload.stdout||"")+"\n"+String(upload.stderr||"");
    const kind=/strict|conflict/i.test(result)?"strict_conflict":
      /forbidden|permission|unauthoriz/i.test(result)?"permission":
      /binding|variable|secret/i.test(result)?"binding":
      /config|toml/i.test(result)?"configuration":"unknown";
    throw Error("UPLOAD FAILED: Wrangler exit="+upload.status+" classification="+kind+"; no traffic promotion");
  }

  const after=await checkLive();
  assert.equal(after.active_version_id,before.active_version_id,"RELEASE BLOCK: active version changed");
  assert.equal(after.active_worker_source_sha256,before.active_worker_source_sha256,"RELEASE BLOCK: active module changed");
  assert.equal(after.verified_live_schedule_count,4,"RELEASE BLOCK: active cron schedule changed");
  const listingAfter=versionList(await cloudGet(root+"/versions?per_page=100",token));
  const newVersions=listingAfter.filter(x=>x.id&&!beforeIds.has(x.id));
  assert.equal(newVersions.length,1,"RELEASE BLOCK: cannot identify exactly one uploaded version");
  const newId=newVersions[0].id;
  assert.match(newId,versionId);
  assert.notEqual(newId,manifest.version_id);
  const detail=await cloudGet("/accounts/"+account+"/workers/workers/"+worker+"/versions/"+newId+"?include=modules",token);
  assert.equal(detail.id,newId);
  assert.equal(detail.main_module,manifest.main_module);
  assert.equal(detail.modules?.length,1);
  const module=Buffer.from(detail.modules[0].content_base64||"","base64");
  assert.ok(module.length>1000,"RELEASE BLOCK: uploaded module missing");
  const compiled=module.toString("utf8");
  for (const marker of ["apdOfferDeadlineStatus","morningUrgent","syncUserOfferState"]){
    assert.ok(compiled.includes(marker),"RELEASE BLOCK: compiled version lacks "+marker);
  }
  const bindings=(detail.bindings||[]).map(x=>x.name+":"+x.type).sort();
  const expectedBindings=manifest.bindings.map(x=>x.name+":"+x.type).sort();
  assert.deepEqual(bindings,expectedBindings,"RELEASE BLOCK: 29 binding topology mismatch");
  const kv=detail.bindings.find(x=>x.name==="EMAIL_SWEEP_STATE");
  const expectedKV=manifest.bindings.find(x=>x.name==="EMAIL_SWEEP_STATE");
  assert.equal(kv?.namespace_id||kv?.id,expectedKV.namespace_id,"RELEASE BLOCK: KV namespace drift");
  const deployment=await cloudGet(root+"/deployments",token);
  const active=(deployment.deployments?.[0]?.versions||[]).filter(x=>Number(x.percentage)>0);
  assert.equal(active.length,1);
  assert.equal(active[0].version_id,before.active_version_id,"RELEASE BLOCK: unexpected traffic recipient");
  assert.equal(Number(active[0].percentage),100,"RELEASE BLOCK: production traffic not 100%");
  assert.ok(!active.some(x=>x.version_id===newId),"RELEASE BLOCK: uploaded candidate received traffic");

  const receipt={
    result:"UPLOADED_ZERO_TRAFFIC_VERIFIED",
    worker,source_sha256:expectedCandidateHash,
    candidate_version_id:newId,candidate_uploaded_module_sha256:sha(module),
    candidate_traffic_percent:0,production_traffic_percent:100,
    original_production_version_id:before.active_version_id,
    original_production_module_sha256:before.active_worker_source_sha256,
    bindings:bindings.length,crons:after.verified_live_schedule_count,
    preview_alias:"apd-final-safe-1104",
    emails_sent:0,live_deployment_changed:false,
    require_separate_permission_for_traffic:true
  };
  writeFileSync(join(tmp,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
  console.log("APD_FINAL_0_PERCENT_UPLOAD_VERIFIED "+JSON.stringify(receipt));
}
try {await main();}
catch(err) {
  console.error("APD_FINAL_ZERO_UPLOAD_STOP "+String(err?.message||"unknown"));
  process.exitCode=1;
}
