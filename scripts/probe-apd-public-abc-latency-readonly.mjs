/* Public ABC, read-only first-page response timing.
 * Exactly FOUR GETs max (2 sequential + 2 concurrent) with an abort deadline.
 * No auth, no writes, no individual offer fields logged/stored.
 * This is from GitHub runner, not a user's logged-in panel or whole Worker.
 */
import {performance} from "node:perf_hooks";
const ENDPOINT="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const districts=["LA MATANZA","AVELLANEDA"];
let requests=0;
async function probe(district){
 const query=new URL(ENDPOINT);
 query.searchParams.set("q",`(descdistrito:"${district}")`);
 query.searchParams.set("rows","200");
 query.searchParams.set("start","0");
 query.searchParams.set("wt","json");
 query.searchParams.set("sort","ult_movimiento desc");
 const start=performance.now();
 requests++;
 const response=await fetch(query,{
   method:"GET",credentials:"omit",redirect:"error",
   headers:{"accept":"application/json, text/javascript, */*; q=0.01"},
   signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error("Public ABC read failed: HTTP "+response.status);
 const buffer=await response.arrayBuffer();
 const raw=new TextDecoder("iso-8859-1").decode(buffer);
 const parsed=JSON.parse(raw);
 if(!Array.isArray(parsed?.response?.docs)
    || !Number.isInteger(parsed?.response?.numFound))
   throw Error("Public ABC response shape invalid");
 return {district,
   elapsed_ms:Math.round((performance.now()-start)*10)/10,
   found_count:parsed.response.numFound,
   first_page_docs:parsed.response.docs.length,
   downloaded_bytes:buffer.byteLength};
}
let report={};
try{
 const firstStart=performance.now();
 const sequential=[];
 for(const d of districts)sequential.push(await probe(d));
 const sequentialElapsed=performance.now()-firstStart;
 const secondStart=performance.now();
 const concurrent=await Promise.all(districts.map(probe));
 const concurrentElapsed=performance.now()-secondStart;
 report={
  source:"public ABC Solr",
  test:"GET first page only, from GitHub runner",
  maximum_requests:4,actual_requests:requests,
  request_concurrency_limit:2,
  sequential_total_wall_ms:Math.round(sequentialElapsed*10)/10,
  parallel_total_wall_ms:Math.round(concurrentElapsed*10)/10,
  samples:{sequential,parallel:concurrent},
  raw_offer_documents_logged:false,
  credentials_used:false,
  production_writes:false,
  not_a_real_user_dashboard_measurement:true,
  warning:"One sample per method; no reliable p50/p95 or deploy speedup claim"
 };
 console.log(JSON.stringify(report,null,2));
}catch(error){
 // Source may be down, throttle, deny CI runners, or time out.
 // Do not claim that absence of response is zero offers, and don't
 // block the OFFLINE correctness tests on external service availability.
 console.warn(JSON.stringify({
  test:"public ABC latency probe unavailable",
  error_type:error?.name||"Error",
  safe_message:String(error?.message||"unknown").slice(0,200),
  actual_requests:requests,
  no_zero_offer_conclusion:true,
  credentials_used:false,production_writes:false
 }));
}
