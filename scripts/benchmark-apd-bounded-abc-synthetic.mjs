/* Artificial-latency benchmark, not real ABC performance.
 * Uses EXACT production and generated candidate function bodies, with mocked
 * district GETs and no user data, Worker deployments, or external network.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
const baseline=readFileSync("worker-live/worker_hotfix.js","utf8");
const candidate=readFileSync("tmp/apd-bounded-abc-worker-release/worker_hotfix.js","utf8");
const districts=["D1","D2","D3","D4","D5","D6"];
const latencyMs=70;
function load(source,request){
 const begin=source.indexOf("async function traerOfertasAPDPorDistritos(");
 const end=source.indexOf("\n__name(traerOfertasAPDPorDistritos,",begin);
 assert.ok(begin>=0&&end>begin,"canonical district function missing");
 return new Function(
  "distritosPrefsAPD","traerOfertasAPDDeUnDistrito",
  "buildSourceOfferKeyFromOferta","parseFechaFlexible",
  source.slice(begin,end)+"\nreturn traerOfertasAPDPorDistritos;"
 )(
  p=>p.distritos,request,
  row=>row.source_offer_key,
  value=>value?new Date(value):null
 );
}
async function sample(source){
 let current=0,maxInflight=0,finished=0;
 const fetchDistrict=async name=>{
  current++;
  maxInflight=Math.max(maxInflight,current);
  await new Promise(resolve=>setTimeout(resolve,latencyMs));
  current--;
  finished++;
  return {
   query:"fixture:"+name,totalBruto:1,totalFiltrado:1,
   docs:[{source_offer_key:"D_"+name,ult_movimiento:"2026-11-04",
          finoferta:"2026-11-08",estado:"Publicada"}]
  };
 };
 const fn=load(source,fetchDistrict);
 const start=performance.now();
 const result=await fn({distritos:districts});
 return {result,elapsedMs:performance.now()-start,maxInflight,finished};
}
function median(values){const a=[...values].sort((x,y)=>x-y);return a[Math.floor(a.length/2)];}
async function run(){
 const seq=[],parallel=[];
 for(let i=0;i<3;i++){
  const old=await sample(baseline);
  const fast=await sample(candidate);
  assert.deepEqual(fast.result,old.result,"offer results changed");
  assert.equal(old.maxInflight,1,"baseline must be sequential");
  assert.equal(fast.maxInflight,2,"candidate must cap concurrency at two");
  assert.equal(fast.finished,6,"candidate must cover all selected districts");
  seq.push(old.elapsedMs);
  parallel.push(fast.elapsedMs);
 }
 const oldMedian=median(seq),newMedian=median(parallel);
 const ratio=newMedian/oldMedian;
 // Extremely generous threshold to avoid CI false negatives under noisy load.
 // Correct scheduling yields a theoretical 0.5 ratio with six equal-duration GETs.
 assert.ok(ratio<0.82,"Synthetic-latency improvement is unexpectedly small; ratio "+ratio);
 console.log("APD_ABC_SYNTHETIC_BENCHMARK "+JSON.stringify({
  scenario:"six simulated ABC districts, each independent simulated GET 70 ms",
  source:"exact Worker routines from immutable snapshot / candidate",
  baseline_median_ms:Math.round(oldMedian),
  candidate_median_ms:Math.round(newMedian),
  simulated_time_reduction_percent:Math.round((1-ratio)*100),
  simulated_samples:3,max_inflight:2,
  results_equal:true,actual_live_abc_latency_measured:false,
  user_data_accessed:false,production_deployed:false
 }));
}
await run();
