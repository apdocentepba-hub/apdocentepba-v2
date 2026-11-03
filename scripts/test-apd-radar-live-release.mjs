import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {auditRadarReleaseHtml} from "./apd-radar-release-guard.mjs";

const source = readFileSync("index.html","utf8");
const candidate = readFileSync("candidates/radar_provincia_live_20261102.js","utf8");
const prior = execFileSync("git",["show","origin/main:index.html"],{encoding:"utf8"});
const url="https://alertasapd.com.ar/candidates/radar_provincia_live_20261102.js";
const hash=x=>createHash("sha256").update(x).digest("hex");
const release=auditRadarReleaseHtml(prior,source);

test("radar script is unchanged by an ordinary UI PR, or an isolated audited release",()=>{
 assert.equal(release.needsLiveAssetProof,release.mode==="isolated-radar-release");
 assert.ok(release.version>=2,"The already-published radar release must remain current");
 if(release.needsLiveAssetProof){
  assert.equal(release.version,release.fromVersion+1);
 }else{
  assert.equal(source.includes('src="candidates/radar_provincia_live_20261102.js?v='+release.version+'"'),true);
 }
});

test("new radar uses the existing panel and anonymous, read-only scan-state API",()=>{
 assert.match(candidate,/const nativeRadar = byId\("panel-radar-provincia"\)/);
 assert.match(candidate,/const nativeButton = byId\("btn-refresh-provincia"\)/);
 assert.match(candidate,/\/api\/provincia\/backfill-status/);
 assert.match(candidate,/method: "GET"/);
 assert.match(candidate,/credentials: "omit"/);
 assert.match(candidate,/cache: "no-store"/);
 assert.doesNotMatch(candidate,/SNAPSHOT\s*=/);
 assert.doesNotMatch(candidate,/supabase\.co\/rest\/v1/);
});
test("public candidate JS must match repository before an actual radar release",async(t)=>{
 if(!release.needsLiveAssetProof){t.diagnostic("Unrelated UI change: keep v2 radar reference unchanged; no release or external GET needed");return;}
 const ctrl=new AbortController();
 const deadline=setTimeout(()=>ctrl.abort(),15000);
 try{
  const response=await fetch(url,{signal:ctrl.signal,redirect:"follow",cache:"no-store"});
  assert.equal(response.status,200,"Candidate must be served by GitHub Pages before release");
  assert.equal(new URL(response.url).host,"alertasapd.com.ar","Unexpected redirect");
  const publicScript=await response.text();
  assert.equal(hash(publicScript),hash(candidate),"Public script must match repository candidate");
  console.log("Candidate asset verified publicly, SHA-256:",hash(publicScript));
 } finally {clearTimeout(deadline);}
});
