/* Six live-source probes must explicitly FAIL if ABC is unavailable.
 * All negative tests use an in-process mocked HTTP 429; no network, secrets,
 * source identifiers, Supabase calls or production mutations.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";

const probes=[
 "probe-apd-published-four-districts-readonly.mjs",
 "probe-apd-published-two-pass-multidistrict-readonly.mjs",
 "probe-apd-public-state-distribution-readonly.mjs",
 "probe-apd-combined-worker-candidate-public-readonly.mjs",
 "probe-apd-projected-published-complete-readonly.mjs",
 "probe-apd-public-observations-readonly.mjs"
];

for(const name of probes){
 test("ABC HTTP 429 makes "+name+" a failed live verification, not green CI",()=>{
  // The mocked fetch cannot contact the real ABC endpoint.
  const runner='globalThis.fetch=async()=>({ok:false,status:429});'+
    'await import("./scripts/'+name+'");';
  const result=spawnSync(process.execPath,
   ["--input-type=module","--eval",runner],
   {encoding:"utf8",timeout:15000,maxBuffer:1024*1024});
  assert.ifError(result.error);
  assert.equal(result.signal,null,"Child process unexpectedly terminated");
  assert.equal(result.status,1,
   name+" silently succeeded on 429: "+String(result.stdout).slice(0,400)+
   String(result.stderr).slice(0,400));
  const output=String(result.stdout)+String(result.stderr);
  assert.match(output,/unavailable|blocked|AGGREGATES_UNAVAILABLE|DRIFT_OR_UNAVAILABLE|failed closed/i,
   "Source error was not explicitly recorded");
  assert.doesNotMatch(output,/SOLR_.*iddetalle|Bearer |access_token|refresh_token/i,
   "A live probe must not log offer identities or credentials");
 });
}
