/* Wider public-source feasibility: four additional PBA districts, max 2
 * concurrent GET streams, only aggregate counters in logs. No credentials,
 * personal data, DB writes, worker deployment or user sessions.
 * This deliberately uses the candidate's real Worker canonical alias logic.
 */
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
const worker=readFileSync("worker-live/worker_hotfix.js","utf8");
const candidate=readFileSync("tmp/apd-alerts-performance/worker_published_minimized_candidate.js","utf8");
const defs=["norm","normDistritoABC","districtQueryVariants","escaparSolr",
 "sanitizeSolrNumber","sanitizeKeyText","buildSourceOfferKeyFromOferta"]
 .map(name=>{
  const a=worker.indexOf("function "+name+"(");
  const z=worker.indexOf("\n__name("+name+",",a);
  if(a<0||z<=a)throw Error("Cannot load canonical district identity helper");
  return worker.slice(a,z);
 }).join("\n");
const canonical=new Function(defs+"\nreturn {normDistritoABC,districtQueryVariants,escaparSolr,buildSourceOfferKeyFromOferta};")();
const begin=candidate.indexOf("const PUBLIC_ALERT_FIELDS=Object.freeze(");
const end=candidate.indexOf("\n__name(traerOfertasAPDDeUnDistrito,",begin);
if(begin<0||end<=begin)throw Error("Candidate built loader unavailable");
let getCount=0;
const fetchCounted=async(url,opts)=>{
 getCount++;
 return fetch(url,opts);
};
const loader=new Function("fetch","normDistritoABC","districtQueryVariants",
 "escaparSolr","buildSourceOfferKeyFromOferta",
 candidate.slice(begin,end)+"\nreturn traerOfertasAPDDeUnDistrito;"
)(fetchCounted,canonical.normDistritoABC,canonical.districtQueryVariants,
 canonical.escaparSolr,canonical.buildSourceOfferKeyFromOferta);
const districts=["QUILMES","BERAZATEGUI","LOMAS DE ZAMORA","GENERAL SAN MARTIN"];
const output=new Array(districts.length);
let nextIndex=0;
const began=performance.now();
async function workerThread(){
 while(nextIndex<districts.length){
  const i=nextIndex++;
  const before=performance.now();
  const started=getCount;
  try{
   const result=await loader(districts[i]);
   if(result.totalBruto!==result.totalFiltrado||
      result.docs.length!==result.totalBruto)
    throw Error("Published source result count inconsistent");
   output[i]={
    district:districts[i],
    published_offers:result.totalBruto,
    elapsed_ms:Math.round((performance.now()-before)*10)/10,
    result_complete:true,
    no_individual_offers_logged:true
   };
  }catch(error){
   output[i]={
    district:districts[i],
    result_complete:false,
    error_type:error?.name||"Error",
    safe_error_message:String(error?.message||"unknown").slice(0,120),
    no_zero_offers_inferred:true
   };
  }
 }
}
await Promise.all([workerThread(),workerThread()]);
console.log(JSON.stringify({
 test:"Public ABC additional district coverage from unmodified CI runner",
 max_district_concurrency:2,
 public_get_requests:getCount,
 elapsed_wall_ms:Math.round((performance.now()-began)*10)/10,
 districts:output,
 passes:output.filter(x=>x.result_complete).length,
 blocked:output.filter(x=>!x.result_complete).length,
 all_complete:output.every(x=>x.result_complete),
 personal_records_logged:false,
 authenticated_panel_latency_measured:false,
 no_writes:true,no_deployment:true
},null,2));
// A successful offline test cannot stand in for an unavailable live ABC observation.
if(output.some(row=>row?.result_complete!==true))process.exitCode=1;
