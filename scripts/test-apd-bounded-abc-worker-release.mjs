import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
// Review-only source comparison: the baseline is the pre-change Worker commit.
 // No network, authenticated data, or production deployments occur in this test.
const original=readFileSync("worker-live/worker_hotfix.js","utf8");
const candidate=readFileSync("tmp/apd-bounded-abc-worker-release/worker_hotfix.js","utf8");
function load(name,source,deps){
 const start=source.indexOf("async function "+name+"(");
 const end=source.indexOf("\n__name("+name+",",start);
 assert.ok(start>=0&&end>start,"Missing canonical function "+name);
 const names=Object.keys(deps);
 return new Function(...names,source.slice(start,end)+"\nreturn "+name+";")
  (...names.map(n=>deps[n]));
}
test("ONLY the two audited Worker hot functions changed",()=>{
 let reverted=candidate;
 for(const fn of ["traerOfertasAPDPorDistritos","construirAlertasParaUsuario"]){
  const begin="async function "+fn+"(";
  const oStart=original.indexOf(begin),oStop=original.indexOf("\n__name("+fn+",",oStart);
  const cStart=reverted.indexOf(begin),cStop=reverted.indexOf("\n__name("+fn+",",cStart);
  assert.ok(oStart>=0&&oStop>oStart&&cStart>=0&&cStop>cStart,"missing "+fn);
  reverted=reverted.slice(0,cStart)+original.slice(oStart,oStop)+reverted.slice(cStop);
 }
 assert.equal(reverted,original,"No other production Worker code may change");
});
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
 const prefs={distritos:districts};
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

test("HTTP 429 stops all queued districts after the first observed failure",async()=>{
 const started=[],pending=new Map();
 const fn=testDistrictSource(candidate,district=>{
  started.push(district);
  return new Promise((resolve,reject)=>pending.set(district,{resolve,reject}));
 });
 const task=fn({distritos:["A","B","C","D","E"]});
 await pause();
 assert.deepEqual(started,["A","B"]);
 pending.get("A").reject(new Error("ABC HTTP 429"));
 await pause();
 assert.deepEqual(started,["A","B"],"Queued GETs must stop after 429");
 pending.get("B").resolve({query:"B",totalBruto:0,totalFiltrado:0,docs:[]});
 await assert.rejects(task,/HTTP 429/);
 assert.deepEqual(started,["A","B"]);
});

test("inflight district drains but does not schedule subsequent districts after error",async()=>{
 const started=[],pending=new Map();
 const fn=testDistrictSource(candidate,district=>{
  started.push(district);
  return new Promise((resolve,reject)=>pending.set(district,{resolve,reject}));
 });
 const task=fn({distritos:["A","B","C","D","E"]});
 await pause();
 assert.deepEqual(started,["A","B"]);
 pending.get("B").resolve({query:"B",totalBruto:0,totalFiltrado:0,docs:[]});
 await pause();
 assert.deepEqual(started,["A","B","C"]);
 pending.get("A").reject(new Error("ABC incomplete source"));
 await pause();
 assert.deepEqual(started,["A","B","C"]);
 pending.get("C").resolve({query:"C",totalBruto:0,totalFiltrado:0,docs:[]});
 await assert.rejects(task,/ABC incomplete source/);
 assert.deepEqual(started,["A","B","C"],"No D/E after source failure");
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
console.log("APD_BOUNDED_ABC_WORKER_RELEASE_TESTS_ONLY: no authenticated production data accessed");
