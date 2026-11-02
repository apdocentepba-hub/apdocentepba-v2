/* One-time read-only ABC source experiment, no production writes. */
import {readTwoPublishedCursorPasses} from "./apd-abc-cursor-full-readonly.mjs";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
const begun=new Date().toISOString();
const result=await readTwoPublishedCursorPasses({fetchImpl:fetch,sourceDistrict:"LA MATANZA",rows:60,maxPages:12});
const report={
 schema_version:1,source:"ABC Solr Publicada, descdistrito LA MATANZA",
 observed_first_pass_started_at_utc:begun,
 observed_last_pass_ended_at_utc:new Date().toISOString(),
 total_first_pass:result.first.total,
 total_second_pass:result.second.total,
 pages_first_pass:result.first.pages,
 pages_second_pass:result.second.pages,
 id_count_first:result.first.ids.size,
 id_count_second:result.second.ids.size,
 identical_full_id_sets:result.identicalIdSets,
 id_field_only:true,
 personal_records_requested:false,
 credentials_used:false,
 production_changes:false,
 interpretation:result.identicalIdSets
  ?"Two consecutive ID-only cursor traversals matched. Does not prove snapshot isolation from future changes."
  :"Source ID membership changed between traversals; decline any completeness claim."
};
const target=resolve("tmp/apd-abc-solr-cursor-full/report.json");
mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify(report,null,2)+"\n","utf8");
console.log(JSON.stringify(report,null,2));
if(!result.identicalIdSets)
 console.log("::warning::ABC full published ID sets changed between two cursor passes; would block a capture.");
