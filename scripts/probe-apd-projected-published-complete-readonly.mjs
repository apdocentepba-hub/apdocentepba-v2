/* Feasibility check: complete Published-only projection in 2 districts.
 * ONLY public ABC GET; no Supabase, session, tokens, writes or IDs in logs.
 */
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {loadWorkerSourceKey} from "./apd-worker-source-key-readonly.mjs";
import {auditProjectedPublicOffers} from "./apd-abc-published-projected-cursor-readonly.mjs";
const canonical=readFileSync("worker-live/worker_hotfix.js","utf8");
const keyFunction=loadWorkerSourceKey(canonical);
const districts=["LA MATANZA","AVELLANEDA"];
const records=[];
try{
 for(const district of districts){
  const start=performance.now();
  const result=await auditProjectedPublicOffers({
   fetchImpl:fetch,keyFunction,district,rows:100,maxPages:8
  });
  records.push({
   ...result,
   elapsed_ms:Math.round((performance.now()-start)*10)/10
  });
 }
 console.log(JSON.stringify({
  source:"Public ABC Published-only strict projected cursor",
  query_reads_only:true,
  separate_probes_per_district:true,
  real_district_results_are_not_user_matches:true,
  raw_offer_fields_or_ids_logged:false,
  credentials:false,production_modified:false,
  not_a_deployable_scanner:true,
  results:records
 },null,2));
}catch(error){
 console.warn(JSON.stringify({
  source:"ABC projected cursor feasibility probe failed closed",
  name:error?.name??"Error",
  safe_message:String(error?.message??"unknown").slice(0,175),
  no_zero_or_lost_offers_inferred:true,
  credentials:false,production_modified:false
 }));
 // Mark live evidence unverified; never convert source errors to zero offers.
 process.exitCode=1;
}
