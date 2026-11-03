import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const original=readFileSync("worker-live/worker_hotfix.js","utf8");
const candidate=readFileSync("tmp/apd-alerts-performance/worker_hotfix.js","utf8");
function load(name,source,deps){
 const start=source.indexOf("async function "+name+"(");
 const end=source.indexOf("\n__name("+name+",",start);
 assert.ok(start>=0&&end>start,"Missing canonical function "+name);
 const names=Object.keys(deps);
 return new Function(...names,source.slice(start,end)+"\nreturn "+name+";")
  (...names.map(n=>deps[n]));
}
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const date=value=>value?new Date(value):null;
const offer=(key,dateStr)=>({source_offer_key:key,ult_movimiento:dateStr,
 finoferta:dateStr,estado:"Publicada"});
function testDistrictSource(source,fetchImpl){
 return load("traerOfertasAPDPorDistritos",source,{
  distritosPrefsAPD:p=>p.distritos,
  traerOfertasAPDDeUnDistrito:fetchImpl,
  buildSourceOfferKeyFromOferta:doc=>doc.source_offer_key,
  parseFechaFlexible:date
 });
}

test("only the intended two hotspot routines differ; no new alert cache or plan bypass",()=>{
 assert.match(candidate,/const districtResults = new Array\(distritos.length\)/);
 assert.match(candidate,/Math.min\(2, distritos.length\)/);
 assert.match(candidate,/const pidPromise = obtenerUltimaPidGuardada\(userId\)\.catch/);
 assert.match(candidate,/const pidData = await pidPromise/);
 for(const critical of ["async function handleMisAlertas(","async function resolverPlanUsuario(",
  "async function obtenerUsuario(","async function obtenerPreferenciasUsuario("]){
  assert.equal(candidate.includes(critical),original.includes(critical));
 }
 for(const unchanged of ["function traerOfertasAPDDeUnDistrito(",
  "async function traerOfertasAPDDeUnDistrito("]){
  if(original.includes(unchanged))
    assert.ok(candidate.includes(unchanged));
 }
 assert.doesNotMatch(candidate.slice(candidate.indexOf("async function traerOfertasAPDPorDistritos"),
  candidate.indexOf("__name(traerOfertasAPDPorDistritos")),
  /cache\.put|kv\.put|localStorage/);
});

test("candidate preserves exact offer order, deduplication and district debug metadata",async()=>{
 const districts=["A","B","C","D"];
 const fixtures={
  A:{query:"A-q",totalBruto:3,totalFiltrado:2,
    docs:[offer("D_1","2026-11-01"),offer("D_2","2026-11-03")]},
  B:{query:"B-q",totalBruto:2,totalFiltrado:2,
    docs:[offer("D_2","2026-11-05"),offer("D_3","2026-11-02")]},
  C:{query:"C-q",totalBruto:1,totalFiltrado:1,
    docs:[offer("D_4","2026-11-04")]},
  D:{query:"D-q",totalBruto:0,totalFiltrado:0,docs:[]}
 };
 const orig=testDistrictSource(original,async d=>fixtures[d]);
 const opt=testDistrictSource(candidate,async d=>fixtures[d]);
 const prefs={distritos};
 assert.deepEqual(await opt(prefs),await orig(prefs));
 assert.deepEqual((await opt(prefs)).ofertas.map(x=>x.source_offer_key),
  ["D_4","D_2","D_3","D_1"]);
});

test("two bounded district requests start concurrently, never more than two",async()=>{
 const observed=[],pending=new Map();
 let active=0,max=0;
 const fetchDistrict=d=>{
  observed.push(d);
  active++;max=Math.max(max,active);
  return new Promise(resolve=>pending.set(d,()=>{active--;resolve({
   query:d,totalBruto:0,totalFiltrado:0,docs:[]
  });}));
 };
 const fn=testDistrictSource(candidate,fetchDistrict);
 const promise=fn({distritos:["A","B","C","D","E"]});
 await pause();
 assert.deepEqual(observed,["A","B"]);
 pending.get("A")();
 await pause();
 assert.deepEqual(observed,["A","B","C"]);
 pending.get("B")();
 await pause();
 assert.deepEqual(observed,["A","B","C","D"]);
 pending.get("C")();
 pending.get("D")();
 await pause();
 assert.deepEqual(observed,["A","B","C","D","E"]);
 pending.get("E")();
 await promise;
 assert.equal(max,2);
 assert.equal(active,0);
});

test("district ABC error fails closed rather than claiming zero alerts",async()=>{
 const fn=testDistrictSource(candidate,async district=>{
  if(district==="B")throw Error("ABC unavailable");
  return {query:district,totalBruto:0,totalFiltrado:0,docs:[]};
 });
 await assert.rejects(()=>fn({distritos:["A","B","C"]}),/ABC unavailable/);
});

function alertBuilder(source,callbacks){
 const deps={
  obtenerUsuario:async()=>({id:"test-id",activo:true}),
  obtenerPreferenciasUsuario:async()=>({user_id:"test-id",alertas_activas:true}),
  cargarCatalogos:callbacks.catalogs,
  canonizarPreferenciasConCatalogo:p=>p,
  traerOfertasAPDPorDistritos:callbacks.districts,
  obtenerUltimaPidGuardada:callbacks.pid,
  normalizePidRows:()=>[],
  buildDistrictIndex:()=>({}),
  ofertaEsVisibleParaAlerta:()=>true,
  estadoOfertaEsPublicada:()=>true,
  buildSourceOfferKeyFromOferta:o=>o.source_offer_key,
  coincideOfertaConPreferenciasAPD:()=>({match:true}),
  evaluatePidCompatibility:()=>({compatible:true}),
  buildAlertItem:o=>({source_offer_key:o.source_offer_key,finoferta:o.finoferta}),
  parseFechaFlexible:date
 };
 return load("construirAlertasParaUsuario",source,deps);
}
test("PID lookup launches before catalog/ABC wait; result remains identical",async()=>{
 const items=[offer("D_30","2026-11-02")];
 let pidStarted=false,allowCatalogs;
 const pendingCatalog=new Promise(resolve=>{allowCatalogs=resolve;});
 const calls={
  catalogs:()=>pendingCatalog,
  districts:async()=>({ofertas:items,debugDistritos:[]}),
  pid:async()=>{pidStarted=true;return {result:{listado:"TEST"}};}
 };
 const optimized=alertBuilder(candidate,calls);
 const response=optimized({},"test-id");
 await pause();
 assert.equal(pidStarted,true,"PID should start before catalog fetch resolves");
 allowCatalogs({distritos:[],cargos:[]});
 const result=await response;
 const baseline=await alertBuilder(original,{
  catalogs:async()=>({distritos:[],cargos:[]}),
  districts:calls.districts,pid:async()=>({result:{listado:"TEST"}})
 })({},"test-id");
 assert.deepEqual(result,baseline);
 assert.equal(result.resultados.length,1);
});
test("PID error fallback remains fail-safe and offers are preserved",async()=>{
 const cb={
  catalogs:async()=>({distritos:[],cargos:[]}),
  districts:async()=>({ofertas:[offer("D_40","2026-11-02")],debugDistritos:[]}),
  pid:async()=>{throw Error("PID unavailable");}
 };
 const optimized=await alertBuilder(candidate,cb)({},"test-id");
 const baseline=await alertBuilder(original,cb)({},"test-id");
 assert.deepEqual(optimized,baseline);
});
console.log("APD_ALERT_PANEL_PERF_CANDIDATE_TESTS_ONLY: no authenticated production data accessed");
