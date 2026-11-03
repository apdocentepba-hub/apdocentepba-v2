/* Synthetic dashboard contract tests: no real auth, ABC, Supabase or writes. */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createApdPanelTimingMeter} from "./apd-panel-timing-meter.mjs";
const source=readFileSync("tmp/apd-alerts-performance/app_v2_deferred_preferences_candidate.js","utf8");
const start=source.indexOf("async function cargarDashboard() {");
const end=source.indexOf("\nfunction renderDashboard(",start);
assert.ok(start>=0&&end>start,"Deferred dashboard not generated");
const dashboard=source.slice(start,end);
const renderer=source.slice(end);
assert.match(renderer,/if\(data\.apdPrefsOnly\)return;/);
assert.match(renderer,/if \(!data\.apdPrefsOnly\) \{/);
assert.match(dashboard,/const \[docente, planInfo\] = await Promise\.all/);
assert.doesNotMatch(dashboard,/const \[docente, prefRaw, planInfo\]/);
async function flush(){
 for(let i=0;i<12;i++)await Promise.resolve();
}
function fixture({plan=true,apiError=false,profilePending=false,planPending=false}={}){
 let token="FAKE_TOKEN_1",time=0;
 const prefPending=new Map(),profiles=new Map(),plans=new Map(),paints=[];
 const events=[], els=new Map(),docHandlers=new Map();
 const node=id=>{
  if(!els.has(id))els.set(id,{
   textContent:"",className:"",style:{},classList:{add(){},remove(){}},
   setAttribute(){},appendChild(child){this.textContent+=child.textContent||"";},
   handlers:new Map(),
   addEventListener(type,fn){const a=this.handlers.get(type)||[];a.push(fn);this.handlers.set(type,a);},
   removeEventListener(type,fn){this.handlers.set(type,(this.handlers.get(type)||[]).filter(f=>f!==fn));},
   dispatchEvent(ev){for(const fn of this.handlers.get(ev.type)||[])fn(ev);return !ev.defaultPrevented;}
  });
  return els.get(id);
 };
 const doc={
  getElementById:node,
  addEventListener:(type,fn)=>{const a=docHandlers.get(type)||[];a.push(fn);docHandlers.set(type,a);},
  removeEventListener:(type,fn)=>docHandlers.set(type,(docHandlers.get(type)||[]).filter(f=>f!==fn)),
  fireClick:(selector)=>{for(const fn of docHandlers.get("click")||[])fn({target:{closest:x=>x.includes(selector)?{}:null}});},
  createElement:()=>({className:"",type:"",textContent:"",
   setAttribute(){},appendChild(){},addEventListener(){}})
 };
 const meter=createApdPanelTimingMeter({now:()=>time,nextPaint:fn=>paints.push(fn)});
 const deps={
  window:{__APD_LAB_PERF:meter},
  document:doc,console:{error(){},warn(){}},alert(){},logout(){},
  localStorage:{getItem:()=>token},
  showMsg:(id,message,type)=>events.push("message:"+id+":"+type+":"+message),
  obtenerToken:()=>token,actualizarNav(){},mostrarSeccion(){},setPanelLoading(){},
  obtenerMisAlertas:()=>apiError?Promise.reject(Error("MOCKED_ABC_FAILURE")):
   Promise.resolve([{source_offer_key:"FAKE_1"}]),
  obtenerDocentePorId:id=>profilePending?new Promise(resolve=>profiles.set(id,resolve)):
   Promise.resolve({id:"FAKE",nombre:"Demo"}),
  obtenerMiPlan:id=>planPending?new Promise(resolve=>plans.set(id,resolve)):
   Promise.resolve({access_active:plan}),
  obtenerPreferenciasPorUserId:id=>new Promise((resolve,reject)=>prefPending.set(id,{resolve,reject})),
  adaptarPreferencias:raw=>({fake_preferences:raw?.marker||""}),
  buildPlanFallback:()=>({access_active:null}),
  renderDashboard:obj=>events.push(obj.apdPrefsOnly?"preferencesOnly":"profile"),
  cargarPrefsEnFormulario:()=>events.push("formHydrated"),
  renderPlanUI:()=>events.push("plan"),
  renderAlertasAPD:items=>events.push("alerts:"+items.length),
  renderEstadisticasPanel:()=>events.push("stats"),
  sincronizarOfertasPanel:()=>events.push("synced"),
  adminCheckAccess:async()=>false,bindAdminEvents(){},setText(){}
 };
 const names=Object.keys(deps);
 const make=new Function(...names,
  "let dashboardRequestVersion=0;let dashboardLoadedOwner=null;"+
  "let alertasState={items:[],index:0};let planActual={access_active:null};\n"+
  dashboard+"\nreturn {load:cargarDashboard,getOfferState:()=>alertasState.items};"
 );
 const compiled=make(...names.map(n=>deps[n]));
 return {
  load:compiled.load,meter,events,doc,
  edit:()=>node("form-preferencias").dispatchEvent({type:"input",target:{matches:x=>x.includes("input")}}),
  change:()=>node("form-preferencias").dispatchEvent({type:"change",target:{matches:x=>x.includes("input")}}),
  clear:selector=>doc.fireClick(selector),
  submit:()=>{const e={type:"submit",defaultPrevented:false,
   preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;}};
   node("form-preferencias").dispatchEvent(e);return e;},
  setToken:value=>{token=value;},
  settlePaint:()=>{time+=20;while(paints.length)paints.shift()();},
  resolvePrefs:(value={},id=token)=>{
   const target=prefPending.get(id);if(!target)throw Error("Preferences not pending "+id);
   prefPending.delete(id);target.resolve(value);
  },
  rejectPrefs:(id=token)=>{
   const target=prefPending.get(id);if(!target)throw Error("Preferences not pending "+id);
   prefPending.delete(id);target.reject(Error("MOCKED_PREF_FAILURE"));
  },
  resolveProfile:(id=token)=>{
   const fn=profiles.get(id);if(!fn)throw Error("Profile not pending "+id);
   profiles.delete(id);fn({id:"FAKE"});
  },
  resolvePlan:(status=plan,id=token)=>{
   const fn=plans.get(id);if(!fn)throw Error("Plan not pending "+id);
   plans.delete(id);fn({access_active:status});
  },
  get prefsPending(){return prefPending.size;},
  get alertsText(){return node("panel-alertas").textContent;}
 };
}
test("slow preferences never block a verified alert, then hydrate without repainting",async()=>{
 const h=fixture();
 await h.load();await flush();h.settlePaint();
 assert.ok(h.events.includes("alerts:1"));
 assert.ok(h.events.includes("synced"));
 assert.equal(h.events.includes("preferencesOnly"),false);
 assert.equal(h.meter.summary().outcomes.rendered,1);
 const before=h.events.filter(x=>x.startsWith("alerts:")).length;
 h.resolvePrefs({marker:"LATER"});await flush();
 assert.equal(h.events.includes("preferencesOnly"),true);
 assert.equal(h.events.includes("formHydrated"),true);
 assert.equal(h.events.filter(x=>x.startsWith("alerts:")).length,before);
});
test("failed preferences display an error without turning verified alerts into empty results",async()=>{
 const h=fixture();
 await h.load();await flush();
 h.rejectPrefs();await flush();
 assert.ok(h.events.includes("alerts:1"));
 assert.match(h.doc.getElementById("panel-preferencias-resumen").textContent,/No pudimos verificar/);
 assert.equal(h.events.includes("formHydrated"),false);
});
test("unknown plan may not render or synchronize personalized alerts",async()=>{
 const h=fixture({plan:null});
 await h.load();await flush();h.settlePaint();
 assert.equal(h.events.some(x=>x.startsWith("alerts:")),false);
 assert.equal(h.events.includes("synced"),false);
 assert.equal(h.meter.summary().outcomes.plan_unverified,1);
 assert.match(h.alertsText,/No pudimos verificar tu plan/);
});
test("inactive plan remains blocked even while preferences are pending",async()=>{
 const h=fixture({plan:false});
 await h.load();await flush();h.settlePaint();
 assert.ok(h.events.includes("alerts:0"));
 assert.equal(h.events.includes("synced"),false);
 assert.equal(h.meter.summary().outcomes.plan_inactive,1);
});
test("slow identity and plan must gate alert rendering independently of preferences",async()=>{
 const h=fixture({profilePending:true,planPending:true});
 const p=h.load();await flush();
 assert.equal(h.events.some(x=>x.startsWith("alerts:")),false);
 h.resolveProfile();await flush();
 assert.equal(h.events.some(x=>x.startsWith("alerts:")),false);
 h.resolvePlan(true);await p;await flush();
 assert.ok(h.events.includes("alerts:1"));
});
test("stale prior-session preferences cannot overwrite new session UI",async()=>{
 const h=fixture();
 await h.load();await flush();
 h.setToken("FAKE_TOKEN_2");
 await h.load();await flush();
 h.resolvePrefs({marker:"SECOND"},"FAKE_TOKEN_2");await flush();
 assert.equal(h.events.filter(x=>x==="preferencesOnly").length,1);
 h.resolvePrefs({marker:"FIRST"},"FAKE_TOKEN_1");await flush();
 assert.equal(h.events.filter(x=>x==="preferencesOnly").length,1);
});
test("failed API remains an explicit error, never zero or synchronization",async()=>{
 const h=fixture({apiError:true});
 await h.load();await flush();h.settlePaint();
 assert.equal(h.events.includes("synced"),false);
 assert.equal(h.events.includes("alerts:0"),false);
 assert.match(h.alertsText,/No pudimos verificar tus alertas/);
 assert.equal(h.meter.summary().outcomes.api_error,1);
});
test("same user reload clears previous loaded offer state before plan is reverified",async()=>{
 const h=fixture({planPending:true});
 const first=h.load();await flush();h.resolvePlan(true);await first;await flush();
 const second=h.load();await flush();
 assert.match(h.alertsText,/Verificando acceso y alertas/);
 assert.equal(h.events.filter(x=>x==="synced").length,1);
 h.resolvePlan(true);await second;await flush();
 assert.equal(h.events.filter(x=>x==="synced").length,2);
});


test("actual renderer updates only preferences when late hydration arrives",()=>{
 const begin=source.indexOf("function renderDashboard(");
 const end=source.indexOf("\nfunction renderPlanUI(",begin);
 assert.ok(begin>0&&end>begin,"Real dashboard renderer is required");
 const events=[];
 const deps={
  setText:(id,value)=>events.push(["text",id,value]),
  setHTML:(id,value)=>events.push(["html",id,value]),
  renderEstadisticasPanel:()=>events.push(["stats"]),
  renderAlertasAPD:()=>events.push(["alerts"]),
  document:{getElementById:()=>{events.push(["dom"]);return null;}},
  buildPlanFallback:()=>({plan:{},subscription:{}}),
  turnoTexto:()=> "Mañana",
  planNombreHumano:()=> "Plan de prueba",
  esc:value=>String(value).replaceAll("<","&lt;")
 };
 const names=Object.keys(deps);
 const build=new Function(...names,
  "let alertasState={items:[{source_offer_key:'FAKE'}]};\n"+
  source.slice(begin,end)+"\nreturn renderDashboard;");
 const render=build(...names.map(name=>deps[name]));
 render({
  docente:{id:"DEMO",nombre:"Ficticio"},
  preferencias:{distrito_principal:"QUILMES",cargos_arr:["MATEMÁTICA"],
   turno_csv:"M",nivel_modalidad:"Secundaria",
   alertas_activas:true,alertas_email:true},
  planInfo:{plan:{},subscription:{}},
  apdPrefsOnly:true
 });
 assert.deepEqual(events.map(e=>e[1]),["panel-preferencias-resumen"]);
 assert.match(events[0][2],/QUILMES/);
 assert.match(events[0][2],/MATEMÁTICA/);
 assert.doesNotMatch(events[0][2],/DEMO|FAKE/);
});


test("editing district while preferences load preserves local draft and blocks unsafe saving",async()=>{
 const h=fixture();
 await h.load();await flush();
 h.edit();
 h.resolvePrefs({marker:"SERVER"});await flush();
 assert.equal(h.events.includes("formHydrated"),false);
 assert.equal(h.events.includes("preferencesOnly"),false);
 assert.match(h.doc.getElementById("panel-preferencias-resumen").textContent,/Conservamos tus cambios locales/);
 const evt=h.submit();
 assert.equal(evt.defaultPrevented,true);
 assert.equal(evt.stopped,true);
 assert.ok(h.events.some(x=>x.includes("message:preferencias-msg:error:Conservamos")));
 assert.ok(h.events.includes("alerts:1"));
});
test("saving before hydration is blocked, but normal saving is allowed after successful hydration",async()=>{
 const h=fixture();
 await h.load();await flush();
 assert.equal(h.submit().defaultPrevented,true);
 h.resolvePrefs({marker:"SERVER"});await flush();
 assert.equal(h.events.includes("formHydrated"),true);
 assert.equal(h.submit().defaultPrevented,false);
});
test("a failed preferences request cannot permit overwriting a blank form",async()=>{
 const h=fixture();
 await h.load();await flush();
 h.rejectPrefs();await flush();
 assert.equal(h.submit().defaultPrevented,true);
 assert.ok(h.events.some(x=>x.includes("Esperá a que se verifiquen")));
});
test("clearing fields with existing UI button is recognized as local dirty edit",async()=>{
 const h=fixture();
 await h.load();await flush();
 h.clear("#btn-clear-cargos");
 h.resolvePrefs({marker:"SERVER"});await flush();
 assert.equal(h.events.includes("formHydrated"),false);
 assert.equal(h.submit().defaultPrevented,true);
});
test("same user reload keeps unsaved draft instead of silently replacing it",async()=>{
 const h=fixture();
 await h.load();await flush();
 h.resolvePrefs({marker:"FIRST"});await flush();
 assert.equal(h.events.filter(x=>x==="formHydrated").length,1);
 h.change();
 await h.load();await flush();
 h.resolvePrefs({marker:"SECOND"});await flush();
 assert.equal(h.events.filter(x=>x==="formHydrated").length,1);
 assert.equal(h.submit().defaultPrevented,true);
});
test("new user disposes prior user's dirty guard and hydrates only new session preferences",async()=>{
 const h=fixture();
 await h.load();await flush();
 h.edit();
 h.setToken("FAKE_TOKEN_2");
 await h.load();await flush();
 h.resolvePrefs({marker:"SECOND"},"FAKE_TOKEN_2");await flush();
 assert.equal(h.events.filter(x=>x==="formHydrated").length,1);
 assert.equal(h.submit().defaultPrevented,false);
 h.resolvePrefs({marker:"OLD"},"FAKE_TOKEN_1");await flush();
 assert.equal(h.events.filter(x=>x==="formHydrated").length,1);
});
