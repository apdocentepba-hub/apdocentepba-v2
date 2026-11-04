/* Public, read-only six-district Worker-key global uniqueness observation.
 * 2 full snapshots, bounded 20-second district read, no user auth/DB writes.
 * Never logs individual offers, global keys, source IDs, hashes or text.
 */
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {auditGlobalPublishedKeys} from "./audit-apd-global-published-keys-readonly.mjs";
import {apdFetchPublishedOnlyDistrict} from "./apd-fetch-published-district-lab.mjs";
const source=readFileSync("worker-live/worker_hotfix.js","utf8");
const names=[
 "norm","normDistritoABC","districtQueryVariants",
 "escaparSolr","sanitizeSolrNumber","sanitizeKeyText",
 "buildSourceOfferKeyFromOferta"
];
const defs=names.map(name=>{
 const a=source.indexOf("function "+name+"(");
 const z=source.indexOf("\n__name("+name+",",a);
 if(a<0||z<=a)throw Error("Canonical Worker helper absent");
 return source.slice(a,z);
}).join("\n");
const worker=new Function(defs+"\nreturn {normDistritoABC,districtQueryVariants,escaparSolr,buildSourceOfferKeyFromOferta};")();
const districts=[
 "LA MATANZA","AVELLANEDA","QUILMES",
 "BERAZATEGUI","LOMAS DE ZAMORA","GENERAL SAN MARTIN"
];
let httpGets=0;
const began=performance.now();
try{
 const outcome=await auditGlobalPublishedKeys({
  districts,
  keyFromOffer:worker.buildSourceOfferKeyFromOferta,
  readDistrict:district=>apdFetchPublishedOnlyDistrict({
   district,
   fetchImpl:(url,options)=>{httpGets++;return fetch(url,options)},
   normalizeDistrict:worker.normDistritoABC,
   districtVariants:worker.districtQueryVariants,
   escapeSolr:worker.escaparSolr,
   keyFromOffer:worker.buildSourceOfferKeyFromOferta,
   rows:100,maxPages:12,maxWallMs:20000
  })
 });
 console.log(JSON.stringify({
  evidence:"public_ABC_global_source_key_two_snapshot_pilot",
  ...outcome,
  public_get_requests:httpGets,
  elapsed_wall_ms:Math.round((performance.now()-began)*10)/10,
  offline_test_cannot_prove_all_PBA_districts:true,
  no_database_access:true,
  no_authenticated_user_access:true
 },null,2));
}catch(error){
 // Do not include user-supplied source fields in any errors.
 const known=[
  "Global key audit found cross-district Solr ID collision",
  "Global key audit found cross-district Worker key collision",
  "Global key audit found duplicate Worker keys within a district",
  "Global key audit district count changed between captures",
  "Global key audit source-ID set drifted at equal count",
  "Global key audit source-key mapping drifted",
  "Global key audit projected content drifted",
  "Global key audit rejected incomplete district capture",
  "Global key audit rejected malformed source record",
  "Global key audit rejected ambiguous source identity"
 ];
 console.warn(JSON.stringify({
  evidence:"public_ABC_global_source_key_two_snapshot_pilot",
  status:"FAILED_CLOSED",
  class:known.includes(error?.message)?error.message:(error?.name??"SourceError"),
  public_get_requests:httpGets,
  no_zero_offers_inferred:true,
  no_personal_data_or_individual_keys_logged:true,
  no_database_or_worker_mutations:true,
  not_safe_to_activate:true
 }));
 process.exitCode=1;
}
