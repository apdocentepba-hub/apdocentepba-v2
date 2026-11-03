import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createApdPanelTimingMeter} from "./apd-panel-timing-meter.mjs";
const candidate=readFileSync(
 "tmp/apd-alerts-performance/app_v2_telemetry_candidate.js","utf8");
const start=candidate.indexOf("async function cargarDashboard() {");
const end=candidate.indexOf("\nfunction renderDashboard(",start);
assert.ok(start>=0 && end>start,"Could not extract actual instrumented dashboard");
const dashboardSource=candidate.slice(start,end);
function harness({active=true,apiFails=false,profileFails=false,delayProfile=false}={}){
 let token="SESSION_ONLY_FOR_FAKE_TEST",now=0;
 const resolvers=new Map();let rendered=[],synced=0,profileRenders=0;
 const paint=[];
 const meter=createApdPanelTimingMeter({
  now:()=>now,nextPaint:done=>paint.push(done)
 });
 const els=new Map();
 const node=id=>{
  if(!els.has(id))els.set(id,{
   textContent:"",innerHTML:"",className:"",style:{},
   classList:{add(){},remove(){}},appendChild(child){this.textContent+=child.textContent||"";},
   setAttribute(){},addEventListener(){},
  });
  return els.get(id);
 };
 const fakeDocument={
  getElementById:node,
  createElement:()=>({setAttribute(){},addEventListener(){},appendChild(){},
   textContent:"",className:"",type:""}),
 };
 const dependencies={
  window:{__APD_LAB_PERF:meter},
  document:fakeDocument,
  console:{error(){},warn(){}},
  alert(){},logout(){},
  localStorage:{getItem:()=>token},
  obtenerToken:()=>token,
  actualizarNav(){},mostrarSeccion(){},setPanelLoading(){},
  obtenerMisAlertas:()=>apiFails?Promise.reject(new Error("synthetic ABC fault")):
   Promise.resolve([{source_offer_key:"D_FAKE_1"}]),
  obtenerDocentePorId:id=>profileFails?Promise.reject(new Error("synthetic profile fault")):
   delayProfile?new Promise(resolve=>resolvers.set(id,resolve)):
   Promise.resolve({id:"FAKE",nombre:"Fake"}),
  obtenerPreferenciasPorUserId:async()=>({}),
  obtenerMiPlan:async()=>({access_active:active}),
  adaptarPreferencias:()=>({}),
  buildPlanFallback:()=>({access_active:null}),
  renderDashboard:()=>{profileRenders++;},
  cargarPrefsEnFormulario(){},renderPlanUI(){},
  renderAlertasAPD:items=>{rendered.push(items.map(x=>x.source_offer_key));},
  renderEstadisticasPanel(){},
  sincronizarOfertasPanel:()=>{synced++;},
  adminCheckAccess:async()=>({}),bindAdminEvents(){},
  setText(){},
 };
 const names=Object.keys(dependencies);
 const compiled=new Function(...names,
  "let dashboardRequestVersion=0;let dashboardLoadedOwner=null;"+
  "let alertasState={items:[],index:0};"+
  "let planActual={access_active:null};\n"+
  dashboardSource+"\nreturn cargarDashboard;");
 const cargarDashboard=compiled(...names.map(k=>dependencies[k]));
 return {
  cargarDashboard,
  meter,
  tick:ms=>now+=ms,
  settlePaint:()=>{while(paint.length)paint.shift()();},
  setToken:x=>token=x,
  resolveProfile:(requested=token)=>{const fn=resolvers.get(requested);if(!fn)throw Error("Profile not requested");resolvers.delete(requested);fn({id:"FAKE"});},
  get rendered(){return rendered},
  get synced(){return synced},
  get profileRenders(){return profileRenders},
  get errorPanel(){return node("panel-alertas").textContent}
 };
}
test("instrumented real dashboard records only painted success after plan/profile gate",async()=>{
 const h=harness({delayProfile:true});
 const promise=h.cargarDashboard();
 await Promise.resolve();await Promise.resolve();
 assert.equal(h.rendered.length,0,"Alert should not render before plan/profile verified");
 h.tick(40);
 h.resolveProfile();
 await promise;
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(h.rendered,[["D_FAKE_1"]]);
 assert.equal(h.synced,1);
 h.tick(16);h.settlePaint();
 assert.equal(h.meter.summary().outcomes.rendered,1);
 assert.equal(h.meter.snapshot()[0].rendered_ms,56);
 assert.doesNotMatch(JSON.stringify(h.meter.snapshot()),/SESSION_ONLY|D_FAKE|FAKE/);
});
test("inactive plan does not expose offers, sync, or misleading success",async()=>{
 const h=harness({active:false});
 await h.cargarDashboard();await Promise.resolve();
 h.tick(20);h.settlePaint();
 assert.deepEqual(h.rendered,[[]]);
 assert.equal(h.synced,0);
 assert.equal(h.meter.summary().outcomes.plan_inactive,1);
});
test("API fault records error, not a zero-match success, and never syncs",async()=>{
 const h=harness({apiFails:true});
 await h.cargarDashboard();await Promise.resolve();
 h.tick(20);h.settlePaint();
 assert.deepEqual(h.rendered,[]);
 assert.equal(h.synced,0);
 assert.match(h.errorPanel,/No pudimos verificar/);
 assert.equal(h.meter.summary().outcomes.api_error,1);
});
test("stale user while profile pending never renders old alerts or records old metric",async()=>{
 const h=harness({delayProfile:true});
 const obsolete=h.cargarDashboard();
 await Promise.resolve();
 h.setToken("SECOND_FAKE_SESSION");
 // Current dashboard new session supersedes first request.
 const current=h.cargarDashboard();
 await Promise.resolve();
 h.resolveProfile("SECOND_FAKE_SESSION");
 await current;
 h.resolveProfile("SESSION_ONLY_FOR_FAKE_TEST");
 await obsolete;
 await Promise.resolve();await Promise.resolve();
 h.tick(14);h.settlePaint();
 assert.deepEqual(h.rendered,[["D_FAKE_1"]]);
 assert.equal(h.meter.summary().sample_count,1);
});
test("profile fault records an actual error rather than fictional empty alerts",async()=>{
 const h=harness({profileFails:true});
 await h.cargarDashboard();
 await Promise.resolve();
 h.tick(20);h.settlePaint();
 assert.deepEqual(h.rendered,[]);
 assert.equal(h.synced,0);
 assert.equal(h.meter.summary().outcomes.profile_error,1);
});
