/* Diagnostic only: full read-only dual-pass consistency of public ABC.
 * 4 districts, two source cursor traversals each, max 2 concurrent districts.
 * No authentication, production writes, offer-level IDs, hashes or free text
 * emitted to CI. A live drift is reported as DRIFT, never as empty alerts.
 */
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {auditPublishedTwoPass} from "./audit-apd-published-two-pass-readonly.mjs";
import {apdFetchPublishedOnlyDistrict} from "./apd-fetch-published-district-lab.mjs";
const source=readFileSync("worker-live/worker_hotfix.js","utf8");
const fnNames=["norm","normDistritoABC","districtQueryVariants",
 "escaparSolr","sanitizeSolrNumber","sanitizeKeyText",
 "buildSourceOfferKeyFromOferta"];
const defs=fnNames.map(name=>{
 const start=source.indexOf("function "+name+"(");
 const end=source.indexOf("\n__name("+name+",",start);
 if(start<0||end<=start)throw Error("Missing canonical Worker helper");
 return source.slice(start,end);
}).join("\n");
const helpers=new Function(defs+
 "\nreturn {normDistritoABC,districtQueryVariants,escaparSolr,buildSourceOfferKeyFromOferta};")();
const districts=["QUILMES","BERAZATEGUI","LOMAS DE ZAMORA","GENERAL SAN MARTIN"];
const output=new Array(districts.length);
let next=0,getRequests=0;
async function readDistrict(district){
 return apdFetchPublishedOnlyDistrict({
  district,
  fetchImpl:async(url,opts)=>{getRequests++;return fetch(url,opts)},
  normalizeDistrict:helpers.normDistritoABC,
  districtVariants:helpers.districtQueryVariants,
  escapeSolr:helpers.escaparSolr,
  keyFromOffer:helpers.buildSourceOfferKeyFromOferta,
  rows:100,maxPages:12
 });
}
const begin=performance.now();
async function parallelWorker(){
 while(next<districts.length){
  const index=next++;
  const district=districts[index];
  const at=performance.now();
  try{
   const result=await auditPublishedTwoPass({
    district,readDistrict,keyFromOffer:helpers.buildSourceOfferKeyFromOferta
   });
   output[index]={
    district,status:"STABLE_ON_TWO_PASSES",
    published_count:result.published_count_verified,
    elapsed_ms:Math.round((performance.now()-at)*10)/10,
    two_full_reads:true
   };
  }catch(err){
   // Only source-level categories; never quote URLs, IDs or raw content.
   const allowed=[
    "Published source count changed between passes",
    "Source ID set changed at equal count",
    "Worker key mapping changed at equal count",
    "Projected offer content changed at equal count",
    "ABC Published incomplete cursor coverage",
    "ABC Published source duplicate or invalid offer identity",
    "ABC Published cursor exceeded bounded page cap: no partial results returned",
    "ABC total changed during Published cursor",
    "ABC source reported partial results",
    "Incomplete two-pass source capture"
   ];
   output[index]={
    district,status:"DRIFT_OR_UNAVAILABLE",
    class:allowed.includes(err?.message)?err.message:err?.name||"SourceError",
    zero_offers_not_inferred:true,
    elapsed_ms:Math.round((performance.now()-at)*10)/10
   };
  }
 }
}
await Promise.all([parallelWorker(),parallelWorker()]);
console.log(JSON.stringify({
 audit:"public_Published_two_pass_district_consistency",
 districts:output,
 checked_districts:districts.length,
 stable_districts:output.filter(x=>x.status==="STABLE_ON_TWO_PASSES").length,
 unstable_or_unavailable_districts:output.filter(x=>x.status!=="STABLE_ON_TWO_PASSES").length,
 actual_public_gets:getRequests,
 max_concurrent_districts:2,
 total_wall_ms:Math.round((performance.now()-begin)*10)/10,
 no_personal_fields_or_offer_ids_logged:true,
 no_production_mutations:true,
 no_authenticated_frontend_measurement:true,
 not_a_production_activation:true
},null,2));
