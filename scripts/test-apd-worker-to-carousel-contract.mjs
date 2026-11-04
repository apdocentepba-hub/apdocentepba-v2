/* Real Worker functions -> API JSON -> real app_v2.js carousel-state contract.
 * Entire test is isolated. All account, offer and ABC responses are fictitious.
 * Does not validate the production auth router or use real accounts/sessions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const bundlePaths={bounded:"tmp/apd-bounded-abc-worker-release/worker_hotfix.js",published:"tmp/apd-published-query-research/worker_hotfix.js",pid:"tmp/apd-published-pid-research/worker_hotfix.js"};
const variant=process.env.APD_TEST_WORKER_VARIANT||"bounded";
assert.ok(Object.hasOwn(bundlePaths,variant),"Only two immutable research bundles may be tested");
const worker=readFileSync(bundlePaths[variant],"utf8");
const app=readFileSync("app_v2.js","utf8");
function workerFunction(name,deps){
 const start=worker.indexOf((name==="handleMisAlertas"||name==="construirAlertasParaUsuario"||
 name==="traerOfertasAPDPorDistritos"?"async ":"")+"function "+name+"(");
 const end=worker.indexOf("\n__name("+name+",",start);
 assert.ok(start>=0&&end>start,"Missing exact canonical Worker function: "+name);
 const keys=Object.keys(deps);
 return new Function(...keys,worker.slice(start,end)+"\nreturn "+name+";")(...keys.map(k=>deps[k]));
}
function frontendFunction(name,deps){
 const match=app.match(new RegExp("(?:async )?function "+name+"\\("));
 assert.ok(match,"Missing frontend function "+name);
 const start=match.index;
 const following=app.slice(start+match[0].length).search(/\n(?:async )?function [A-Za-z_$][\w$]*\(/);
 assert.ok(following>=0,"Missing end of frontend function "+name);
 const end=start+match[0].length+following;
 const keys=Object.keys(deps);
 return new Function(...keys,app.slice(start,end)+"\nreturn "+name+";")(...keys.map(k=>deps[k]));
}
function matcher(){
 const names=["norm","unique","normDistritoABC","resolveOfferDistrict","distritosPrefsAPD",
 "extraerSigla","normalizarTextoSimple","matchDistritos","matchCargosMaterias",
 "categoriasNivel","matchNivelModalidad","turnosPrefs","mapTurnoAPD","matchTurno",
 "coincideOfertaConPreferenciasAPD"];
 const defs=names.map(n=>{
  const start=worker.indexOf("function "+n+"(");
  const end=worker.indexOf("\n__name("+n+",",start);
  assert.ok(start>=0&&end>start,n+" missing from actual Worker");
  return worker.slice(start,end);
 });
 return new Function(defs.join("\n")+"\nreturn {coincideOfertaConPreferenciasAPD,norm,mapTurnoAPD};")();
}
const real=matcher();
const prefs={
 distrito_principal:"AVELLANEDA",otros_distritos_apd:["QUILMES"],
 cargos:["MATEMÁTICA (MTM)"],materias:[],niveles:["SECUNDARIO"],
 turnos:["T"],alertas_activas:true
};
function offer(key,district,patch={}){
 return {source_offer_key:key,iddetalle:key,descdistrito:district,
 descripcioncargo:"PROFESOR DE MATEMÁTICA (MTM)",
 descnivelmodalidad:"SECUNDARIA",turno:"T",finoferta:"2099-12-31",
 estado:"Publicada",escuela:"ESCUELA FICTICIA",ult_movimiento:"2026-11-04",
 ...patch};
}
const fixtures={
 AVELLANEDA:[offer("D_100","AVELLANEDA"),
  offer("D_WRONG_CARGO","AVELLANEDA",{descripcioncargo:"HISTORIA (HIS)"}),
  offer("D_WRONG_LEVEL","AVELLANEDA",{descnivelmodalidad:"PRIMARIO"})],
 QUILMES:[offer("D_200","QUILMES"),
  offer("D_WRONG_SHIFT","QUILMES",{turno:"M"})]
};
function setup(accessActive=true){
 let getRequests=0,current=0,maxInflight=0;
 const fetchDistrict=async district=>{
  getRequests++;
  current++;maxInflight=Math.max(current,maxInflight);
  await Promise.resolve();
  current--;
  const docs=fixtures[district]??[];
  return {docs,totalBruto:docs.length,totalFiltrado:docs.length,query:"fake:"+district};
 };
 const getDistricts=workerFunction("traerOfertasAPDPorDistritos",{
  distritosPrefsAPD:p=>[p.distrito_principal,...p.otros_distritos_apd],
  traerOfertasAPDDeUnDistrito:fetchDistrict,
  buildSourceOfferKeyFromOferta:x=>x.source_offer_key,
  parseFechaFlexible:x=>new Date(x)
 });
 const buildAlertItem=workerFunction("buildAlertItem",{
  formatearDiasHorariosOferta:()=>"",
  resolverTipoRevistaOferta:()=>({label:"Provisional",codigo:"P"}),
  formatearFechaAbc:()=>"",
  buildAbcPostulantesUrl:()=>"",
  buildSourceOfferKeyFromOferta:x=>x.source_offer_key,
  norm:real.norm,mapTurnoAPD:real.mapTurnoAPD,
  normalizarCursoDivisionServidor:()=>"-"
 });
 const compute=workerFunction("construirAlertasParaUsuario",{
  obtenerUsuario:async()=>({id:"TEST_USER",activo:true}),
  obtenerPreferenciasUsuario:async()=>prefs,
  cargarCatalogos:async()=>({}),
  canonizarPreferenciasConCatalogo:p=>p,
  traerOfertasAPDPorDistritos:getDistricts,
  obtenerUltimaPidGuardada:async()=>null,
  normalizePidRows:()=>[],
  buildDistrictIndex:()=>({}),
  ofertaEsVisibleParaAlerta:()=>true,
  estadoOfertaEsPublicada:x=>x.estado==="Publicada",
  buildSourceOfferKeyFromOferta:x=>x.source_offer_key,
  coincideOfertaConPreferenciasAPD:real.coincideOfertaConPreferenciasAPD,
  evaluatePidCompatibility:()=>({compatible:false}),
  buildAlertItem,parseFechaFlexible:x=>new Date(x)
 });
 const route=workerFunction("handleMisAlertas",{
  obtenerUsuario:async()=>({id:"TEST_USER",activo:true}),
  resolverPlanUsuario:async()=>({planAccess:accessActive,plan:{code:"TEST"},subscription:{status:"TEST"}}),
  isPlanActivo:r=>r.planAccess===true,
  ensureTrialIfNoSubscriptions:async()=>{},
  construirAlertasParaUsuario:compute,
  json:(body,status=200)=>({body,status})
 });
 return {route,stats:()=>({getRequests,maxInflight})};
}
function frontendPipeline(serverResponse,active){
 const parseDate=frontendFunction("parseFechaAPD",{});
 const isInactive=frontendFunction("estadoOfertaInactiva",{});
 const isExpired=frontendFunction("ofertaVencidaPorFecha",{parseFechaAPD:parseDate});
 const filter=frontendFunction("filtrarAlertasVigentes",{
  estadoOfertaInactiva:isInactive,ofertaVencidaPorFecha:isExpired
 });
 const state={items:[{source_offer_key:"STALE"}],index:3};
 let drawn=0,requestRoute;
 const getAlerts=frontendFunction("obtenerMisAlertas",{
  workerFetchJson:async route=>{requestRoute=route;return serverResponse;},
  filtrarAlertasVigentes:filter
 });
 const render=frontendFunction("renderAlertasAPD",{
  planActual:{access_active:active},
  alertasState:state,filtrarAlertasVigentes:filter,
  renderAlertaActual:()=>{drawn++;}
 });
 return {getAlerts,render,state,stats:()=>({drawn,requestRoute})};
}
test("real Worker matcher -> authenticated-route payload -> app carousel receives only matching offers",async()=>{
 const backend=setup(true);
 const response=await backend.route(new URL("https://worker.invalid/api/mis-alertas?user_id=TEST_USER"),{});
 assert.equal(response.status,200);
 assert.equal(response.body.ok,true);
 assert.equal(response.body.total_fuente,5);
 assert.equal(response.body.total,2);
 assert.equal(response.body.descartadas_total,3);
 assert.equal(backend.stats().getRequests,2);
 assert.ok(backend.stats().maxInflight<=2);
 const frontend=frontendPipeline(response.body,true);
 const items=await frontend.getAlerts("TEST_USER");
 assert.deepEqual(items.map(i=>i.source_offer_key),["D_100","D_200"]);
 frontend.render(items);
 assert.deepEqual(frontend.state.items.map(i=>i.source_offer_key),["D_100","D_200"]);
 assert.equal(frontend.state.index,0);
 assert.equal(frontend.stats().drawn,1);
 assert.match(frontend.stats().requestRoute,/^\/api\/mis-alertas\?user_id=TEST_USER$/);
});
test("expired plan route sends no offers and frontend clears old carousel entries",async()=>{
 const backend=setup(false);
 const response=await backend.route(new URL("https://worker.invalid/api/mis-alertas?user_id=TEST_USER"),{});
 assert.equal(response.status,200);
 assert.deepEqual(response.body.items,[]);
 assert.equal(backend.stats().getRequests,0,"do not call ABC for expired plan");
 const frontend=frontendPipeline(response.body,false);
 const items=await frontend.getAlerts("TEST_USER");
 assert.deepEqual(items,[]);
 frontend.render(items);
 assert.equal(frontend.state.items.length,0);
 assert.equal(frontend.stats().drawn,1);
});
console.log("APD_WORKER_TO_FRONTEND_FAKE_CONTRACT_TEST_ONLY: no real accounts or API accessed");
