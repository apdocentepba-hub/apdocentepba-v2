/* Research-only PID latency candidate; no Cloudflare upload or source edit.
 * All seven existing lookup actions stay in priority order, max 2 in flight.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
const from="tmp/apd-published-query-research/worker_hotfix.js";
const to="tmp/apd-published-pid-research/worker_hotfix.js";
const baseline=readFileSync(from,"utf8");
const digest=s=>createHash("sha256").update(s).digest("hex");
assert.equal(digest(baseline),"19c8ab235ca8a07fee305797ad895d9e588535f754ded12470c58f1a83f3e870",
 "STOP: published-only candidate no longer matches its approved source");
const fname="obtenerUltimaPidGuardada";
const start=baseline.indexOf("async function "+fname+"(");
const end=baseline.indexOf("\n__name("+fname+",",start);
assert.ok(start>0&&end>start,"Expected PID fallback function is missing");
const original=baseline.slice(start,end);
const oldLoop=[
 "  for (const action of actions) {",
 "    const data = await postPidStorageFromMainWorker({",
 "      action,",
 "      docente_id: docenteId",
 "    }).catch(() => null);",
 "    const normalized = normalizePidStorageResponse(data);",
 "    if (normalized) return normalized;",
 "  }"
].join("\n");
const newLoop=[
 "  // Preserve fallback priority while bounding read-only lookup concurrency.",
 "  for (let offset = 0; offset < actions.length; offset += 2) {",
 "    const batch = actions.slice(offset, offset + 2);",
 "    const replies = await Promise.all(batch.map((action) =>",
 "      postPidStorageFromMainWorker({",
 "        action,",
 "        docente_id: docenteId",
 "      }).catch(() => null)",
 "    ));",
 "    for (const data of replies) {",
 "      const normalized = normalizePidStorageResponse(data);",
 "      if (normalized) return normalized;",
 "    }",
 "  }"
].join("\n");
assert.equal(original.split(oldLoop).length,2,"STOP: expected PID fallback loop drifted");
const modified=original.replace(oldLoop,newLoop);
const research=baseline.slice(0,start)+modified+baseline.slice(end);
assert.equal(research.replace(modified,original),baseline,
 "STOP: unexpected change outside PID function");
assert.notEqual(research,baseline);
mkdirSync(dirname(to),{recursive:true});
writeFileSync(to,research);
console.log("APD_PID_BOUNDED_RESEARCH "+JSON.stringify({
 status:"generated_no_upload",only_changed_function:fname,
 input_sha256:digest(baseline),pid_bounded_sha256:digest(research),
 max_concurrent_pid_reads:2,action_precedence:"unchanged",
 previous_candidates_unchanged:true,production_deployed:false
}));
