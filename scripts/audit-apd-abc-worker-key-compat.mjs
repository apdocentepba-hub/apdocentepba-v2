/* ABC public ID-only mapping compatibility, no IDs or offer records persisted. */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {readPublishedIdsByCursor} from "./apd-abc-cursor-full-readonly.mjs";
import {loadWorkerSourceKey,createSourceKeyStats} from "./apd-worker-source-key-readonly.mjs";
const worker=readFileSync("worker-live/worker_hotfix.js","utf8");
const stats=createSourceKeyStats(loadWorkerSourceKey(worker));
const result=await readPublishedIdsByCursor({
 fetchImpl:fetch,sourceDistrict:"LA MATANZA",rows:60,maxPages:12,
 includeWorkerKeyFields:true,onDocument:doc=>stats.observe(doc)
});
const detail=stats.summarize();
const report={
 schema_version:1,observed_at_utc:new Date().toISOString(),
 source:"ABC Solr Publicada, LA MATANZA",
 source_total:result.total,source_id_unique_count:result.ids.size,
 cursor_pages:result.pages,
 worker_mapping:{...detail,source_key_mapping_verified_against_live_ABC:true},
 no_personal_records_requested:true,no_identifiers_persisted:true,
 production_changed:false,
 interpretation:detail.source_keys_are_unique
  ?"Worker source_offer_key had no collisions in this district at this observation; still must check other districts."
  :"Worker source_offer_key collisions or missing numeric keys were observed. Do NOT switch scanning until resolved."
};
const dest=resolve("tmp/apd-abc-key-compat/report.json");
mkdirSync(dirname(dest),{recursive:true});
writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(!detail.source_keys_are_unique)
 console.log("::warning::Worker key mapping has collisions or blank keys on public source projection.");
