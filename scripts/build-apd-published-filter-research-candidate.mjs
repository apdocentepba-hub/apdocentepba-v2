/* Additional, experimental candidate ONLY: reuse the exact published-only
 * status filter already used by live email/global ABC readers.
 * Input is the frozen 0%-traffic Worker candidate; output is a new temp file.
 * No Cloudflare action, no changes to canonical Worker or uploaded version.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {dirname} from "node:path";
import assert from "node:assert/strict";
const input="tmp/apd-bounded-abc-worker-release/worker_hotfix.js";
const output="tmp/apd-published-query-research/worker_hotfix.js";
const source=readFileSync(input,"utf8");
const sha=s=>createHash("sha256").update(s).digest("hex");
assert.equal(sha(source),"6ee13869ec0d6363806e1bfc8990d529f7386b956c7bd30530f5e0109c861b6e",
 "STOP: production-verified 0-percent candidate has drifted");
const start=source.indexOf("async function traerOfertasAPDDeUnDistrito(");
const end=source.indexOf("\n__name(traerOfertasAPDDeUnDistrito,",start);
assert.ok(start>0&&end>start,"canonical ABC district reader missing");
const fn=source.slice(start,end);
const needle='      sort: "ult_movimiento desc"';
assert.equal(fn.split(needle).length,2,"Sort query changed; no ambiguous patch");
assert.doesNotMatch(fn,/\bfq:\s*['"]estado:/);
const patched=fn.replace(needle,needle+',\n      fq: \'estado:"Publicada"\'');
const research=source.slice(0,start)+patched+source.slice(end);
const reverted=research.replace(patched,fn);
assert.equal(reverted,source,"STOP: patch accidentally modifies unrelated Worker code");
assert.equal(research.split('fq: \'estado:"Publicada"\'').length-1,
 source.split('fq: \'estado:"Publicada"\'').length,
 "Only one added Solr published-state filter expected");
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,research);
console.log("APD_PUBLISHED_FILTER_RESEARCH_CANDIDATE "+JSON.stringify({
 result:"source_generated_for_research_only",
 baseline_zero_traffic_candidate_sha256:sha(source),
 research_candidate_sha256:sha(research),
 only_changed_function:"traerOfertasAPDDeUnDistrito",
 state_filter:'estado:"Publicada"',
 cloudflare_upload:false,production_deploy:false,
 extra_authorization_required:true
}));
