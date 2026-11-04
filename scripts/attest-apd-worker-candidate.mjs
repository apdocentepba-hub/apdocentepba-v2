/* APDocentePBA Worker candidate: deterministic, non-deployable attestation.
 * Verify the immutable repository baseline and calculate SHA-256 of the
 * disposable candidate. Never reads secrets, Cloudflare, accounts or Supabase.
 * A manifest version is an EXPECTED version, not proof of current live traffic.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {execFileSync} from "node:child_process";

const canonicalPath="worker-live/worker_hotfix.js";
const candidatePath="tmp/apd-bounded-abc-worker-release/worker_hotfix.js";
const outPath="tmp/apd-bounded-abc-worker-release/attestation.json";
const sha256=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const raw=readFileSync("worker-live/manifest.json","utf8");
const manifest=JSON.parse(raw);
const base=readFileSync(canonicalPath);
const candidate=readFileSync(candidatePath);
assert.equal(manifest.worker_name,"ancient-wildflower-cd37");
assert.equal(manifest.main_module,"worker_hotfix.js");
assert.match(String(manifest.version_id),/^[a-f0-9-]{36}$/i);
const modules=manifest.modules??[];
assert.equal(modules.length,1,"Candidate bundle must have exactly one canonical source module");
assert.equal(modules[0].name,"worker_hotfix.js");
const recorded=modules[0].source_sha256||modules[0].module_sha256||modules[0].sha256;
assert.match(String(recorded),/^[a-f0-9]{64}$/i);
const baseHash=sha256(base),candidateHash=sha256(candidate);
assert.equal(baseHash,recorded,"STOP: canonical repository file differs from pinned Cloudflare capture; refresh independently");
assert.notEqual(candidateHash,baseHash,"No effective Worker optimization candidate");
assert.equal(candidate.toString("utf8").includes("Math.min(2, distritos.length)"),true);
const affectedFunctions=["traerOfertasAPDPorDistritos","construirAlertasParaUsuario"];
let reverted=candidate.toString("utf8");
const baseText=base.toString("utf8");
for(const fn of affectedFunctions){
 const start=baseText.indexOf("async function "+fn+"(");
 const end=baseText.indexOf("\n__name("+fn+",",start);
 const candidateStart=reverted.indexOf("async function "+fn+"(");
 const candidateEnd=reverted.indexOf("\n__name("+fn+",",candidateStart);
 assert.ok(start>=0&&end>start&&candidateStart>=0&&candidateEnd>candidateStart);
 reverted=reverted.slice(0,candidateStart)+baseText.slice(start,end)+reverted.slice(candidateEnd);
}
assert.equal(reverted,baseText,"STOP: candidate changes more than the two audited Worker functions");
const currentHead=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const evidence={
 schema_version:1,
 status:"candidate_only_not_authorized_for_deploy",
 repository_head_sha:currentHead,
 source_worker_name:manifest.worker_name,
 expected_predeployment_cloudflare_version_id:manifest.version_id,
 expected_predeployment_manifest_captured_at:manifest.captured_at||null,
 canonical_module_name:manifest.main_module,
 canonical_sha256:baseHash,
 candidate_sha256:candidateHash,
 changes_limited_to_functions:affectedFunctions,
 expected_module_count:1,
 direct_deploy_allowed:false,
 live_cloudflare_version_verified:false,
 account_credentials_read:false,
 production_mutation:false,
 rollback_requires_verified_predeployment_version:true,
 rollback_instruction:"Confirm current 100%-traffic Cloudflare version and all resource bindings; retain that exact version for Cloudflare rollback. Never use an unverified repository snapshot as automatic rollback.",
 next_gate:"independent live source capture, 100%-traffic version match, binding verification, authorized canary, authenticated comparison and postdeploy smoke"
};
mkdirSync(dirname(outPath),{recursive:true});
writeFileSync(outPath,JSON.stringify(evidence,null,2)+"\n");
console.log("APD_WORKER_CANDIDATE_ATTESTATION_OK "+JSON.stringify(evidence));
