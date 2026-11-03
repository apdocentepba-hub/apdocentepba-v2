/* Source GET-only cross-district key uniqueness audit.
 * Aggregated report has no individual Solr or Worker identifiers.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {loadWorkerSourceKey} from "./apd-worker-source-key-readonly.mjs";
import {auditWorkerKeysAcrossDistricts} from "./apd-abc-cross-district-worker-keys-readonly.mjs";
const canonical=readFileSync("worker-live/worker_hotfix.js","utf8");
const result=await auditWorkerKeysAcrossDistricts({
 fetchImpl:fetch,
 keyFunction:loadWorkerSourceKey(canonical)
});
const safe={
 schema_version:1,
 observed_at_utc:new Date().toISOString(),
 ...result,
 credentials_used:false,
 personal_records_requested:false,
 individual_identifiers_persisted:false,
 production_writes:false,
 snapshots_are_two_consecutive_observations_only:true
};
const filepath=resolve("tmp/apd-abc-key-twopass/cross-district-aggregates.json");
mkdirSync(dirname(filepath),{recursive:true});
writeFileSync(filepath,JSON.stringify(safe,null,2)+"\n");
console.log(JSON.stringify(safe,null,2));
if(!result.safe_for_further_review){
 console.error("APD_CROSS_DISTRICT_WORKER_KEY_AUDIT_FAILED: do not promote scanner");
 process.exitCode=1;
}else{
 console.log("APD_CROSS_DISTRICT_WORKER_KEY_AUDIT_PASSED: no source writes or promotion");
}
