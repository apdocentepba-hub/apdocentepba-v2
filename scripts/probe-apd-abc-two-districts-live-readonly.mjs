/* Limited REAL ABC source probe, never uses a user/session/Worker endpoint.
 * Two public districts, first 200 results at most each, one sequential and
 * one concurrent run (4 GET requests total). No docs are stored or printed.
 * This is a source latency comparison, NOT authenticated /api/mis-alertas
 * latency and NOT proof of faster production alerts.
 */
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import assert from "node:assert/strict";
const url="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const districtNames=["AVELLANEDA","QUILMES"];
const hash=s=>createHash("sha256").update(s).digest("hex").slice(0,12);
async function requestFirstPage(district){
 assert.ok(districtNames.includes(district),"Unexpected district");
 const query='descdistrito:"'+district+'"';
 const params=new URLSearchParams({
  q:"("+query+")",rows:"200",start:"0",wt:"json",sort:"ult_movimiento desc"
 });
 const started=performance.now();
 const response=await fetch(url+"?"+params.toString(),{
  method:"GET",
  headers:{
   "accept":"application/json, text/javascript, */*; q=0.01",
   "user-agent":"Mozilla/5.0",
   "referer":"http://servicios2.abc.gob.ar/",
   "origin":"http://servicios2.abc.gob.ar"
  },
  redirect:"error",signal:AbortSignal.timeout(20000)
 });
 assert.equal(response.status,200,"ABC HTTP error for district "+district);
 const bytes=await response.arrayBuffer();
 assert.ok(bytes.byteLength>0&&bytes.byteLength<3*1024*1024,"ABC reply empty/oversized");
 const decoded=new TextDecoder("iso-8859-1").decode(bytes);
 const result=JSON.parse(decoded).response;
 assert.ok(result&&Array.isArray(result.docs),"ABC response/docs missing");
 assert.ok(result.docs.length<=200);
 const keys=result.docs.map(d=>String(d.iddetalle||d.id||d.idoferta||"")).sort();
 return {
  district,elapsed_ms:Math.round(performance.now()-started),
  rows_returned:result.docs.length,num_found:Number(result.numFound??-1),
  snapshot_id_hash:hash(keys.join("|")),
  initial_page_only:true
 };
}
const seqStart=performance.now();
const sequential=[];
for(const district of districtNames)sequential.push(await requestFirstPage(district));
const sequentialElapsed=performance.now()-seqStart;
const parallelStart=performance.now();
const parallel=await Promise.all(districtNames.map(requestFirstPage));
const parallelElapsed=performance.now()-parallelStart;
const sameSnapshot=sequential.every((entry,i)=>
 entry.num_found===parallel[i].num_found &&
 entry.snapshot_id_hash===parallel[i].snapshot_id_hash
);
console.log("APD_LIVE_ABC_BOUNDED_PROBE "+JSON.stringify({
 scenario:"2 public ABC districts; 1 page of max 200 rows each; two passes (4 GETs)",
 sequential_total_ms:Math.round(sequentialElapsed),
 parallel_total_ms:Math.round(parallelElapsed),
 measured_observed_reduction_percent:Math.round((1-parallelElapsed/sequentialElapsed)*100),
 measured_worker_panel_latency:false, source_page_snapshot_identical:sameSnapshot,
 sequential_districts:sequential,
 parallel_districts:parallel,
 personal_data_read:false,source_data_saved:false,user_account_accessed:false,
 production_deployed:false
}));
if(!sameSnapshot){
 console.warn("APD_LIVE_ABC_SOURCE_CHANGED_BETWEEN_PASSES: cannot conclude parity from changing source");
}
