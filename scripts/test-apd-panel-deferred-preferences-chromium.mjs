/* LAB ONLY: real Chromium paints using the actual instrumented cargarDashboard
 * function, with 100% fake token/plan/profile/ABC data and stubbed renderers.
 * No user authentication, live network, persistence or production writes.
 */
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

const candidate=readFileSync("tmp/apd-alerts-performance/app_v2_deferred_preferences_candidate.js","utf8");
const baseline=readFileSync("tmp/apd-alerts-performance/app_v2_telemetry_candidate.js","utf8");
const uiPatchSource=readFileSync("safe_dashboard_ui_patch.js","utf8");
const actualPrefsCard=uiPatchSource.match(/function prefsCardHtml\(\) \{\s*return `([\s\S]*?)`;\s*\}/);
assert.ok(actualPrefsCard?.[1]?.includes('id="form-preferencias"'),
 "Actual deferred UI preference form markup not found");
const prefsHtml=actualPrefsCard[1];
const start=candidate.indexOf("async function cargarDashboard() {");
const end=candidate.indexOf("\nfunction renderDashboard(",start);
assert.ok(start>=0&&end>start,"Actual candidate dashboard not found");
const dashboardSource=candidate.slice(start,end);
const baselineStart=baseline.indexOf("async function cargarDashboard() {");
const baselineEnd=baseline.indexOf("\nfunction renderDashboard(",baselineStart);
assert.ok(baselineStart>=0&&baselineEnd>baselineStart,
 "Instrumented baseline dashboard not found");
const baselineDashboardSource=baseline.slice(baselineStart,baselineEnd);
const meterSource=readFileSync("scripts/apd-panel-timing-meter.mjs","utf8")
 .replace("export function createApdPanelTimingMeter(","function createApdPanelTimingMeter(");
const executable=["google-chrome","google-chrome-stable","chromium","chromium-browser"]
 .find(x=>spawnSync("which",[x],{stdio:"ignore"}).status===0);
assert.ok(executable,"Chromium not present in CI image");
const directory=mkdtempSync(path.join(tmpdir(),"apd-first-alert-paint-"));
const browser=spawn(executable,[
 "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
 "--disable-background-networking","--no-first-run","--no-default-browser-check",
 "--remote-debugging-port=0","--user-data-dir="+directory,"about:blank"
],{stdio:"ignore"});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
let socket,serial=0;
const pending=new Map();
async function debugPort(){
 for(let i=0;i<120;i++){
  const file=path.join(directory,"DevToolsActivePort");
  if(existsSync(file))return Number(readFileSync(file,"utf8").split("\n")[0]);
  if(browser.exitCode!==null)throw Error("Chromium exited before debug port opened");
  await sleep(100);
 }
 throw Error("Chromium debug port unavailable");
}
async function cdp(method,params={}){
 const id=++serial;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout "+method));},12000);
  pending.set(id,{resolve,reject,timer});
  socket.send(JSON.stringify({id,method,params}));
 });
}
async function evalBrowser(expression){
 const result=await cdp("Runtime.evaluate",{
  expression,returnByValue:true,awaitPromise:true,userGesture:true
 });
 if(result.exceptionDetails)
  throw Error("Browser scenario exception: "+JSON.stringify(result.exceptionDetails).slice(0,900));
 return result.result.value;
}

// Serializable browser function: no import, no request and no external state.
async function scenarioInBrowser({dashboardSource,meterSource,delays={},inactive=false,unverified=false,failApi=false,empty=false,editBeforePrefs=false,lateForm=false,selection=null,mountDelayMs=0,prefsHtml='',actualUiBootstrap='',useRealBootstrap=false}){
 const createMeter=new Function(meterSource+"\nreturn createApdPanelTimingMeter;")();
 const meter=createMeter();
 window.__APD_LAB_PERF=meter;
 const fakeToken="SYNTHETIC_ONLY_SESSION";
 let synchronized=0,preferencesHydrated=0,preferencesOnlyCount=0;
 const later=(ms,value,fail=false)=>new Promise((resolve,reject)=>{
  setTimeout(()=>fail?reject(Error("simulated source error")):resolve(value),ms);
 });
 const dependencies={
  window,document,console:{warn(){},error(){}},
  alert(){},logout(){},showMsg:(id,message)=>{document.getElementById(id).textContent=message;},localStorage:{getItem:()=>fakeToken},
  obtenerToken:()=>fakeToken,actualizarNav(){},
  mostrarSeccion(){},setPanelLoading(){},
  obtenerMisAlertas:()=>later(delays.api??15,empty?[]:[{source_offer_key:"D_FAKE_1"}],failApi),
  obtenerDocentePorId:()=>later(delays.profile??15,{id:"FAKE",nombre:"DEMO"}),
  obtenerPreferenciasPorUserId:()=>later(delays.prefs??15,{}),
  obtenerMiPlan:()=>later(delays.plan??15,{access_active:unverified?null:!inactive}),
  adaptarPreferencias:()=>({}),buildPlanFallback:()=>({access_active:null}),
  renderDashboard:data=>{if(data.apdPrefsOnly)preferencesOnlyCount++;},
  cargarPrefsEnFormulario(){preferencesHydrated++;document.getElementById("pref-distrito-principal").value="SAVED_SERVER_PREF";},renderPlanUI(){},
  renderAlertasAPD:items=>{
   document.getElementById("panel-alertas").textContent=
    items.length?"ALERTA_RENDERIZADA":"SIN_ALERTAS";
  },
  renderEstadisticasPanel(){},
  sincronizarOfertasPanel:()=>{synchronized++;},
  adminCheckAccess:async()=>false,bindAdminEvents(){},setText(){}
 };
 const names=Object.keys(dependencies);
 const compile=new Function(...names,
  "let dashboardRequestVersion=0;let dashboardLoadedOwner=null;"+
  "let alertasState={items:[],index:0};let planActual={access_active:null};\n"+
  dashboardSource+"\nreturn cargarDashboard;"
 );
 const dashboard=compile(...names.map(n=>dependencies[n]));
 document.getElementById("panel-alertas").textContent="";
 if(lateForm)document.getElementById("form-preferencias")?.remove();
 await dashboard();
 if(lateForm){
  if(mountDelayMs>0)await new Promise(done=>setTimeout(done,mountDelayMs));
  if(useRealBootstrap){
   // Exercise the actual boot() and ensurePrefsCard(), not a cloned fixture.
   (0,eval)(actualUiBootstrap);
   if(!window.__apdStableDashboardBootstrapLoaded)
    throw Error("Real dashboard patch was not initialized");
  }else{
   document.getElementById("panel-content").insertAdjacentHTML("beforeend",prefsHtml);
  }
  assertRealFormAfterLoad();
 }
 function assertRealFormAfterLoad(){
  if(!document.getElementById("form-preferencias"))throw Error("Dynamic form failed to mount");
 }
 const prefInput=document.getElementById("pref-distrito-principal");
 if(editBeforePrefs){
  prefInput.value="UNSAVED_LOCAL_PREF";
  prefInput.dispatchEvent(new Event("input",{bubbles:true}));
 }
 if(selection){
  const list=document.getElementById("sug-distrito-1");
  if(!list)throw Error("Real suggestion list absent");
  list.style.display="block";
  list.innerHTML='<div class="ac-item" data-index="0">DISTRITO_DEMO</div>';
  const option=list.querySelector(".ac-item");
  const applyChoice=()=>{prefInput.value="DISTRITO_DEMO";list.style.display="none";};
  if(selection==="mouse"){
   // Actual seleccionarAC changes .value directly without firing input/change.
   option.addEventListener("mousedown",applyChoice);
   option.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));
  }else if(selection==="keyboard"){
   prefInput.addEventListener("keydown",applyChoice);
   prefInput.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));
  }else throw Error("Unknown test selection");
 }
 for(let i=0;i<45&&meter.summary().sample_count<1;i++)
  await new Promise(done=>setTimeout(done,20));
 if(editBeforePrefs||selection||mountDelayMs)await new Promise(done=>setTimeout(done,(delays.prefs??15)+55));
 const submitEvent=new Event("submit",{bubbles:true,cancelable:true});
 const saveAllowed=document.getElementById("form-preferencias").dispatchEvent(submitEvent);
 const result=meter.summary();
 const samples=meter.snapshot();
 return {result,paintText:document.getElementById("panel-alertas").textContent,
  synchronized,preferencesHydrated,preferencesOnlyCount,samples,noExternalNetwork:true,
  prefValue:prefInput.value,saveAllowed,
  guardState:window.__APD_LAB_PREF_GUARD?.state,guardDirty:window.__APD_LAB_PREF_GUARD?.dirty,
  formMounted:!!document.getElementById('form-preferencias'),
  bootstrapLoaded:!!window.__apdStableDashboardBootstrapLoaded,
  preferencesMessage:document.getElementById("preferencias-msg").textContent,
  summaryText:document.getElementById("panel-preferencias-resumen").textContent};
}

try{
 const port=await debugPort();
 const targets=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
 const page=targets.find(t=>t.type==="page");
 assert.ok(page,"Browser page target unavailable");
 socket=new WebSocket(page.webSocketDebuggerUrl);
 socket.addEventListener("message",event=>{
  const message=JSON.parse(event.data);
  const pendingRequest=pending.get(message.id);
  if(!pendingRequest)return;
  clearTimeout(pendingRequest.timer);pending.delete(message.id);
  if(message.error)pendingRequest.reject(Error(JSON.stringify(message.error)));
  else pendingRequest.resolve(message.result||{});
 });
 await new Promise((resolve,reject)=>{
  socket.addEventListener("open",resolve,{once:true});
  socket.addEventListener("error",reject,{once:true});
 });
 await cdp("Page.enable");await cdp("Runtime.enable");
 await cdp("Network.enable");
 // A blank data: page has no external assets. Block HTTP(S) to be explicit.
 await cdp("Network.setBlockedURLs",{urls:["http://*","https://*"]});
 // Each scenario runs in a fresh browser document: tests must not inherit
 // another fake user's dirty guard, old pending requests or stale DOM.
 const labHtml="<html><body><div id='panel-alertas'></div><div id='alertas-badge'></div><div id='panel-preferencias-resumen'></div><div id='preferencias-msg'></div><div id='panel-content'></div><form id='form-preferencias'><input id='pref-distrito-principal' name='pref-distrito-principal'></form></body></html>";
 let scenarioIndex=0;
 const run=async options=>{
  const html="<!doctype html>"+labHtml+"<!-- isolated browser scenario "+(++scenarioIndex)+" -->";
  await cdp("Page.navigate",{url:"data:text/html,"+encodeURIComponent(html)});
  for(let i=0;i<60;i++){
   if(await evalBrowser('document.readyState==="complete"'))break;
   await sleep(30);
  }
  return evalBrowser("("+
   scenarioInBrowser.toString()+")("+JSON.stringify({
    dashboardSource,meterSource,prefsHtml,actualUiBootstrap:uiPatchSource,...options
   })+")");
 };
 const slowApi=await run({delays:{api:170,profile:15,prefs:15,plan:15}});
 const slowPreferences=await run({delays:{api:12,profile:15,prefs:170,plan:15}});
 const inactive=await run({inactive:true});
 const unverified=await run({unverified:true});
 const error=await run({failApi:true});
 const empty=await run({empty:true});
 const dirty=await run({delays:{api:12,profile:15,prefs:170,plan:15},editBeforePrefs:true});
 const lateMouse=await run({delays:{api:12,profile:15,prefs:170,plan:15},lateForm:true,selection:"mouse"});
 const lateKeyboard=await run({delays:{api:12,profile:15,prefs:170,plan:15},lateForm:true,selection:"keyboard"});
 const prefBeforeForm=await run({delays:{api:12,profile:15,prefs:0,plan:15},lateForm:true,mountDelayMs:90});
 const realBootstrapEarlyPrefs=await run({
  delays:{api:12,profile:15,prefs:0,plan:15},
  lateForm:true,mountDelayMs:90,useRealBootstrap:true
 });

 // Real Chromium rendering path with ONLY synthetic delay profiles.
 // The original instrumented function and deferred candidate run in a new
 // document per trial, with identical API/profile/plan/offer mocks.
 const quantile=(values,p)=>{
  assert.ok(values.length>0);
  const sorted=[...values].sort((a,b)=>a-b);
  return Math.round(sorted[Math.ceil(sorted.length*p)-1]*10)/10;
 };
 async function comparePaint(profile,trials=9){
  const samples={baseline:[],deferred:[]};
  for(let i=0;i<trials;i++){
   // Interleave trials to avoid treating browser warmup as a product win.
   const order=i%2===0?["baseline","deferred"]:["deferred","baseline"];
   for(const variant of order){
    const response=await run({
     dashboardSource:variant==="baseline"?baselineDashboardSource:dashboardSource,
     delays:profile
    });
    assert.equal(response.paintText,"ALERTA_RENDERIZADA");
    assert.equal(response.result.outcomes.rendered,1);
    assert.equal(response.result.sample_count,1);
    assert.equal(response.synchronized,1);
    assert.ok(Number.isFinite(response.samples[0].rendered_ms));
    assert.doesNotMatch(JSON.stringify(response.samples),
      /SYNTHETIC_ONLY_SESSION|D_FAKE_1|Bearer|email/i);
    samples[variant].push(response.samples[0].rendered_ms);
   }
  }
  return {
   synthetic_delays_ms:profile,
   trials_per_variant:trials,
   baseline_p50_ms:quantile(samples.baseline,0.5),
   baseline_p95_ms:quantile(samples.baseline,0.95),
   deferred_p50_ms:quantile(samples.deferred,0.5),
   deferred_p95_ms:quantile(samples.deferred,0.95),
   same_synthetic_alert_rendered:true,
   browser_chromium:true,
   live_site_or_auth_measured:false
  };
 }
 const slowPrefProfile=await comparePaint({
  api:12,profile:15,plan:15,prefs:190
 });
 const apiBoundProfile=await comparePaint({
  api:140,profile:15,plan:15,prefs:12
 });
 assert.ok(slowPrefProfile.deferred_p50_ms<slowPrefProfile.baseline_p50_ms*0.72,
  "Synthetic late preferences should materially reduce first alert paint");
 assert.ok(apiBoundProfile.deferred_p50_ms<=apiBoundProfile.baseline_p50_ms+45,
  "Deferring fast preferences should not significantly regress API-bound paint");
 assert.ok(apiBoundProfile.deferred_p95_ms<=apiBoundProfile.baseline_p95_ms+75,
  "Deferring fast preferences should not add a large synthetic tail penalty");
 console.log("APD_CHROMIUM_INTERLEAVED_P50_P95_FAKE_SESSION "+JSON.stringify({
  synthetic_profiles:[slowPrefProfile,apiBoundProfile],
  real_auth_session:false,external_network_requests:0,
  production_modified:false
 }));

 for(const [name,s] of Object.entries({slowApi,slowPreferences,inactive,unverified,error,empty,dirty,lateMouse,lateKeyboard,prefBeforeForm,realBootstrapEarlyPrefs})){
  assert.equal(s.result.sample_count,1,name+" missing browser paint sample");
  assert.equal(s.samples.length,1);
  assert.equal(s.noExternalNetwork,true);
  assert.doesNotMatch(JSON.stringify(s.samples),/SYNTHETIC_ONLY_SESSION|D_FAKE_1|Bearer|email/i);
 }
 assert.equal(slowApi.result.outcomes.rendered,1);
 assert.equal(slowApi.paintText,"ALERTA_RENDERIZADA");
 assert.equal(slowApi.synchronized,1);
 assert.ok(slowApi.samples[0].api_ms>slowApi.samples[0].profile_ms+70,
  "API should dominate paint after a deliberately slow synthetic API response");
 assert.ok(slowApi.samples[0].rendered_ms>=slowApi.samples[0].api_ms);
 assert.equal(slowPreferences.result.outcomes.rendered,1);
 assert.ok(slowPreferences.samples[0].profile_ms<80,
  "Preference delay must not block verified profile/plan critical path");
 assert.ok(slowPreferences.samples[0].rendered_ms<140,
  "First alert paint should beat 170ms delayed preferences in synthetic browser");
 assert.ok(slowPreferences.samples[0].rendered_ms>=slowPreferences.samples[0].api_ms);
 assert.equal(slowPreferences.preferencesHydrated,0,
  "Slow preferences must not be hydrated before an earlier alert paint");
 assert.equal(inactive.result.outcomes.plan_inactive,1);
 assert.equal(inactive.paintText,"SIN_ALERTAS");
 assert.equal(inactive.synchronized,0);
 assert.equal(unverified.result.outcomes.plan_unverified,1);
 assert.equal(unverified.synchronized,0);
 assert.match(unverified.paintText,/No pudimos verificar tu plan/);
 assert.equal(error.result.outcomes.api_error,1);
 assert.match(error.paintText,/No pudimos verificar/);
 assert.equal(error.synchronized,0);
 assert.equal(empty.result.outcomes.no_matches,1);
 assert.equal(empty.synchronized,1);
 assert.equal(dirty.prefValue,"UNSAVED_LOCAL_PREF","Late server data must never replace typed value");
 assert.equal(dirty.preferencesHydrated,0,"Dirty editor must not apply server preferences");
 assert.equal(dirty.saveAllowed,false,"Saving incomplete/conflicting preferences must be blocked");
 assert.match(dirty.summaryText,/Conservamos tus cambios locales/);
 assert.match(dirty.preferencesMessage,/Recargá la página/);
 assert.equal(prefBeforeForm.prefValue,"SAVED_SERVER_PREF",
  "Preferences arriving before form mount must still be hydrated: "+JSON.stringify(prefBeforeForm));
 assert.equal(prefBeforeForm.preferencesHydrated,1,
  "Exactly one successful hydration after form mounts");
 assert.equal(prefBeforeForm.saveAllowed,true,
  "Save allowed only after actual dynamic form hydration");
 assert.equal(realBootstrapEarlyPrefs.bootstrapLoaded,true,
  "Actual safe_dashboard_ui_patch.js boot did not run");
 assert.equal(realBootstrapEarlyPrefs.formMounted,true,
  "Actual safe_dashboard_ui_patch.js did not insert the real form");
 assert.equal(realBootstrapEarlyPrefs.preferencesHydrated,1,
  "Actual bootstrap form was not hydrated once");
 assert.equal(realBootstrapEarlyPrefs.prefValue,"SAVED_SERVER_PREF",
  "Actual bootstrap form must receive verified preference values");
 assert.equal(realBootstrapEarlyPrefs.saveAllowed,true);
 for(const item of [lateMouse,lateKeyboard]){
  assert.equal(item.prefValue,"DISTRITO_DEMO");
  assert.equal(item.preferencesHydrated,0,"Programmatic autocomplete selection must prevent late hydration");
  assert.equal(item.saveAllowed,false,"Delayed form must have delegated submit protection");
  assert.match(item.summaryText,/Conservamos tus cambios locales/);
 }
 console.log("APD_CHROMIUM_REAL_UI_BOOTSTRAP_FORM_READY_PASS "+JSON.stringify({
  scenarios:11,
  slow_api_ms:slowApi.samples[0],
  slow_preferences_ms:slowPreferences.samples[0],
  active_gate_blocked:true,source_error_distinct:true,
  browser_real:true,frontend_renderers_stubbed:true,
  no_real_user_credentials:true,production_not_measured:true,
  no_production_changes:true
 }));
}finally{
 for(const p of pending.values())clearTimeout(p.timer);
 pending.clear();socket?.close();browser.kill("SIGTERM");
 await sleep(200);rmSync(directory,{recursive:true,force:true});
}
