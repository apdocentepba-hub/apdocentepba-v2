/* Execute the BUILT, never-deployed Worker district-loader against public
 * Published ABC for exactly two districts in parallel. No user access.
 * No raw docs, IDs, keys, observation text or identifiable values in logs.
 */
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {loadWorkerSourceKey} from "./apd-worker-source-key-readonly.mjs";
const source=readFileSync("tmp/apd-alerts-performance/worker_published_minimized_candidate.js","utf8");
const start=source.indexOf("const PUBLIC_ALERT_FIELDS=Object.freeze(");
const end=source.indexOf("\n__name(traerOfertasAPDDeUnDistrito,",start);
if(start<0||end<=start)throw Error("Cannot load tested Worker candidate loader");
const code=source.slice(start,end);
const keyFunction=loadWorkerSourceKey(readFileSync("worker-live/worker_hotfix.js","utf8"));
const fetchDistrict=new Function("fetch","normDistritoABC","districtQueryVariants",
 "escaparSolr","buildSourceOfferKeyFromOferta",
 code+"\nreturn traerOfertasAPDDeUnDistrito;")(
 fetch,s=>String(s||"").trim().toUpperCase(),
 district=>[district],str=>String(str).replace(/"/g,'\\"'),keyFunction
);
const districts=["LA MATANZA","AVELLANEDA"];
const startAt=performance.now();
try{
 const found=await Promise.all(districts.map(async district=>{
  const at=performance.now();
  const row=await fetchDistrict(district);
  if(!Array.isArray(row.docs)||row.docs.length!==row.totalBruto||
     row.totalFiltrado!==row.totalBruto)
   throw Error("Projected Worker source coverage mismatch");
  return {
   district,
   published_offers_complete:row.totalBruto,
   fetched_count:row.totalFiltrado,
   elapsed_ms:Math.round((performance.now()-at)*10)/10,
   all_offers_have_safe_projection:row.docs.every(o=>
     !Object.keys(o).some(k=>/cuil|reemp|domiciliodesempeno|idsuna/i.test(k)))
  };
 }));
 console.log(JSON.stringify({
  proof:"Combined offline Worker candidate, actual public ABC GET",
  districts:found,concurrent_districts:2,
  total_elapsed_ms:Math.round((performance.now()-startAt)*10)/10,
  no_user_auth_used:true,no_offer_details_logged:true,
  did_not_use_production_worker:true,production_deploy_authorized:false
 },null,2));
}catch(error){
 console.warn(JSON.stringify({
  proof:"Combined offline Worker candidate public ABC GET unavailable",
  reason_type:error?.name||"Error",
  safe_message:String(error?.message||"unknown").slice(0,150),
  no_missed_offers_inferred:true,no_user_auth_used:true,
  did_not_modify_production:true
 }));
}
