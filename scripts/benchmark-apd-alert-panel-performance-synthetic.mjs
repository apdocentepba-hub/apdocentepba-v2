/* Deterministic-input, synthetic-latency benchmark of ORIGINAL vs CANDIDATE.
 * No network, users, tokens, production API or writes. p50/p95 are laboratory
 * timings, NOT measurements of APD or ABC in real-world conditions.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
const original=readFileSync("worker-live/worker_hotfix.js","utf8");
const candidate=readFileSync("tmp/apd-alerts-performance/worker_hotfix.js","utf8");
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
function load(name,source,deps){
 const start=source.indexOf("async function "+name+"(");
 const end=source.indexOf("\n__name("+name+",",start);
 assert.ok(start>=0&&end>start,"Canonical function boundary missing: "+name);
 return new Function(...Object.keys(deps),source.slice(start,end)+
  "\nreturn "+name+";")(...Object.values(deps));
}
const percentile=(values,p)=>{
 const sorted=[...values].sort((a,b)=>a-b);
 const index=Math.max(0,Math.ceil(p*sorted.length)-1);
 return Math.round(sorted[index]*10)/10;
};
function getDistrictLoader(src,stats,latencyMs){
 return load("traerOfertasAPDPorDistritos",src,{
  distritosPrefsAPD:p=>p.distritos,
  traerOfertasAPDDeUnDistrito:async(d)=>{
   stats.active++;
   stats.maxActive=Math.max(stats.maxActive,stats.active);
   stats.requests++;
   try{
    await sleep(latencyMs);
    const number=Number(d.slice(1));
    return {
     query:d+"-fake-query",totalBruto:1,totalFiltrado:1,
     docs:[{source_offer_key:"D_"+(1000+number),
       finoferta:"2026-11-30",ult_movimiento:"2026-11-01"}]
    };
   }finally{stats.active--;}
  },
  buildSourceOfferKeyFromOferta:doc=>doc.source_offer_key,
  parseFechaFlexible:value=>value?new Date(value):null
 });
}
async function benchmarkDistricts(count,latencyMs=45,iterations=5){
 const districts=Array.from({length:count},(_,i)=>"S"+i);
 const durations={original:[],candidate:[]};
 let totalCalls=0,maxCandidateInflight=0;
 for(let i=0;i<iterations;i++){
  let baselineResponse=null;
  for(const [name,source] of [["original",original],["candidate",candidate]]){
   const stats={active:0,maxActive:0,requests:0};
   const run=getDistrictLoader(source,stats,latencyMs);
   const t0=performance.now();
   const result=await run({distritos:districts});
   const elapsed=performance.now()-t0;
   durations[name].push(elapsed);
   assert.equal(stats.requests,count);
   assert.equal(stats.active,0);
   if(name==="candidate")maxCandidateInflight=Math.max(maxCandidateInflight,stats.maxActive);
   if(name==="original")baselineResponse=result;
   else assert.deepEqual(result,baselineResponse);
   totalCalls+=stats.requests;
  }
 }
 assert.ok(maxCandidateInflight<=2);
 const originalP50=percentile(durations.original,0.5);
 const candidateP50=percentile(durations.candidate,0.5);
 const originalP95=percentile(durations.original,0.95);
 const candidateP95=percentile(durations.candidate,0.95);
 // Synthetic 3+ districts MUST show actual overlap. Avoid claiming real speed.
 if(count>=3)assert.ok(candidateP50<originalP50*0.84,
  "With synthetic slow upstream, bounded overlap must improve median time");
 return {
  scenario:"synthetic_"+count+"_districts",
  fake_latency_ms_per_district:latencyMs,
  trials_per_version:iterations,
  original_p50_ms:originalP50,original_p95_ms:originalP95,
  candidate_p50_ms:candidateP50,candidate_p95_ms:candidateP95,
  synthetic_p50_speedup_percent:Math.round((1-candidateP50/originalP50)*100),
  equal_alert_results:true,
  max_candidate_parallel_district_fetches:maxCandidateInflight,
  fake_upstream_reads:totalCalls,
  real_production_latency_measured:false
 };
}
function getAlertBuilder(source,times){
 const offer={source_offer_key:"D_9876",finoferta:"2026-11-30",
  estado:"Publicada"};
 return load("construirAlertasParaUsuario",source,{
  obtenerUsuario:async()=>({id:"fixture",activo:true}),
  obtenerPreferenciasUsuario:async()=>({user_id:"fixture",alertas_activas:true}),
  cargarCatalogos:async()=>{await sleep(times.catalogMs);return {distritos:[],cargos:[]};},
  canonizarPreferenciasConCatalogo:p=>p,
  traerOfertasAPDPorDistritos:async()=>{await sleep(times.abcMs);return {ofertas:[offer],debugDistritos:[]};},
  obtenerUltimaPidGuardada:async()=>{await sleep(times.pidMs);return {result:{listado:"FAKE"}};},
  normalizePidRows:()=>[],buildDistrictIndex:()=>({}),
  ofertaEsVisibleParaAlerta:()=>true,estadoOfertaEsPublicada:()=>true,
  buildSourceOfferKeyFromOferta:d=>d.source_offer_key,
  coincideOfertaConPreferenciasAPD:()=>({match:true}),
  evaluatePidCompatibility:()=>({compatible:true}),
  buildAlertItem:d=>({source_offer_key:d.source_offer_key,finoferta:d.finoferta}),
  parseFechaFlexible:value=>value?new Date(value):null
 });
}
async function benchmarkPidOverlap(times={catalogMs:35,abcMs:55,pidMs:75},iterations=5){
 const output={original:[],candidate:[]};
 for(let i=0;i<iterations;i++){
  let baseline;
  for(const [name,src] of [["original",original],["candidate",candidate]]){
   const worker=getAlertBuilder(src,times);
   const t0=performance.now();
   const result=await worker({},"fixture");
   output[name].push(performance.now()-t0);
   if(name==="original")baseline=result;
   else assert.deepEqual(result,baseline);
  }
 }
 const before=percentile(output.original,0.5),after=percentile(output.candidate,0.5);
 assert.ok(after<before*0.8,"Independent mocked PID read should overlap catalog/ABC");
 return {
  scenario:"synthetic_catalog_abc_pid_overlap",
  fake_delays_ms:times,
  trials_per_version:iterations,
  original_p50_ms:before,original_p95_ms:percentile(output.original,0.95),
  candidate_p50_ms:after,candidate_p95_ms:percentile(output.candidate,0.95),
  synthetic_p50_speedup_percent:Math.round((1-after/before)*100),
  equal_alert_results:true,
  real_production_latency_measured:false
 };
}
const results=[];
for(const n of [1,2,4,6])results.push(await benchmarkDistricts(n));
results.push(await benchmarkPidOverlap());
console.log(JSON.stringify({
 test:"offline_synthetic_performance_comparison",
 production_modified:false,
 no_external_requests:true,
 performance_not_measured_on_real_abc_or_authenticated_users:true,
 cases:results
},null,2));
