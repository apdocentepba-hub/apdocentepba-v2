import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync,statSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {buildRadarFrontendRelease,OLD_TAG,NEW_TAG,checksum}
  from "./prepare-apd-radar-frontend-release.mjs";

const original=readFileSync("index.html","utf8");
const old=readFileSync("radar_provincia_patch_semaforo.js","utf8");
const candidate=readFileSync("candidates/radar_provincia_live_20261102.js","utf8");

test("prepare exactly one HTML script replacement and restore exact original",()=>{
 const r=buildRadarFrontendRelease(original,old,candidate);
 assert.equal((original.match(/radar_provincia_patch_semaforo\.js\?v=2/g)||[]).length,1);
 assert.equal((r.releaseHtml.match(/candidates\/radar_provincia_live_20261102\.js\?v=1/g)||[]).length,1);
 assert.equal(r.releaseHtml.replace(NEW_TAG,OLD_TAG),original);
 assert.equal(r.rollbackHtml,original);
 assert.equal(r.manifest.initial_html_sha256,checksum(original));
 assert.equal(r.manifest.candidate_radar_sha256,checksum(candidate));
 assert.equal(r.manifest.rollback_html_sha256,checksum(original));
 assert.deepEqual(r.manifest.changed_paths_if_approved,["index.html"]);
 assert.equal(r.manifest.live_deployment,false);
});
test("reject duplicate or altered script refs and unauthorized API changes",()=>{
 assert.throws(()=>buildRadarFrontendRelease(original+OLD_TAG,old,candidate),/expected one/);
 assert.throws(()=>buildRadarFrontendRelease(original.replace(OLD_TAG,NEW_TAG),old,candidate),/expected one/);
 assert.throws(()=>buildRadarFrontendRelease(original,old,"no endpoint"),/lacks verified status endpoint/);
 assert.throws(()=>buildRadarFrontendRelease(original,old,candidate.replace('credentials: "omit"','credentials: "include"')),/anonymous GET/);
 assert.throws(()=>buildRadarFrontendRelease(original,old.replace("SNAPSHOT","FAKE"),candidate),/fingerprint/);
});
test("CLI emits only untracked preview/rollback files, canonical site untouched",()=>{
 const tmp=mkdtempSync(join(tmpdir(),"apd-radar-release-candidate-"));
 const before=checksum(readFileSync("index.html"));
 const result=spawnSync(process.execPath,[
   "scripts/prepare-apd-radar-frontend-release.mjs",tmp
 ],{encoding:"utf8"});
 try{
   assert.equal(result.status,0,result.stderr);
   assert.ok(existsSync(join(tmp,"index-preview.html")));
   assert.ok(existsSync(join(tmp,"index-rollback.html")));
   const preview=readFileSync(join(tmp,"index-preview.html"),"utf8");
   const rollback=readFileSync(join(tmp,"index-rollback.html"),"utf8");
   const manifest=JSON.parse(readFileSync(join(tmp,"release-manifest.json"),"utf8"));
   assert.equal(preview.replace(NEW_TAG,OLD_TAG),rollback);
   assert.equal(checksum(rollback),before);
   assert.equal(checksum(readFileSync("index.html")),before);
   assert.equal(manifest.candidate_html_sha256,checksum(preview));
   assert.equal(manifest.rollback_html_sha256,checksum(rollback));
   assert.ok(statSync(join(tmp,"index-preview.html")).size>50000);
 } finally{
   rmSync(tmp,{force:true,recursive:true});
 }
});
