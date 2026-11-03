// Public Solr read-only audit: all source IDs and source_offer_key mapping
// observed twice in memory; output and artifact contain AGGREGATES only.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {auditTwoWorkerKeyPasses} from "./apd-abc-worker-key-two-pass-readonly.mjs";
import {loadWorkerSourceKey} from "./apd-worker-source-key-readonly.mjs";

const district=String(process.env.APD_AUDIT_DISTRICT||"LA MATANZA").trim();
if(!["LA MATANZA","AVELLANEDA"].includes(district))
 throw Error("District outside the explicit public read-only pilot allowlist");
const workerCode=readFileSync("worker-live/worker_hotfix.js","utf8");
const keyFunction=loadWorkerSourceKey(workerCode);
const result=await auditTwoWorkerKeyPasses({
 fetchImpl:fetch,keyFunction,sourceDistrict:district,rows:60,maxPages:12
});
const report={
 schema_version:1,
 collected_at_utc:new Date().toISOString(),
 scope:"ABC Solr Publicada, "+district+", projected id/iddetalle/idoferta ONLY",
 ...result,
 no_personal_attributes_requested:true,
 identifiers_stored_or_printed:false,
 production_modified:false,
 not_a_snapshot_or_deployment:true
};
const path=resolve("tmp/apd-abc-key-twopass/summary-"+district.toLowerCase().replace(/[^a-z0-9]+/g,"-")+".json");
mkdirSync(dirname(path),{recursive:true});
writeFileSync(path,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(!result.safe_for_further_review){
 console.error("ABC_WORKER_KEY_TWOPASS_FAILED: source identity/key stability or primary key rule not verified");
 process.exitCode=1;
} else {
 console.log("ABC_WORKER_KEY_TWOPASS_PASSED: two consecutive public observations only; no live migration");
}
