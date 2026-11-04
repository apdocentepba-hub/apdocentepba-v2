/* LAB ONLY: real Chromium paints using the actual instrumented cargarDashboard
 * function, with 100% fake token/plan/profile/ABC data and stubbed renderers.
 * No user authentication, live network, persistence or production writes.
 */
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

const candidate=readFileSync("tmp/apd-alerts-performance/app_v2_deferred_preferences_candidate.js","utf8");
const uiPatchSource=readFileSync("safe_dashboard_ui_patch.js","utf8");
const actualPrefsCard=uiPatchSource.match(/function prefsCardHtml\(\) \{\s*return `([\s\S]*?)`;\s*\}/);
assert.ok(actualPrefsCard?.[1]?.includes('id="form-preferencias"'),
 "Actual deferred UI preference form markup not found");
const prefsHtml=actualPrefsCard[1];
const start=candidate.indexOf("async function cargarDashboard() {");
const end=candidate.indexOf("\nfunction renderDashboard(",start);
assert.ok(start>=0&&end>start,"Actual candidate dashboard not found");
const dashboardSource=candidate.slice(start,end);
const meterSource=readFileSync("scripts/apd-panel-timing-meter.mjs","utf8")
 .replace("export function createApdPanelTimingMeter(","function createApdPanelTimingMeter(");
const executable=["google-chrome","google-chrome-stable","chromium","chromium-browser"]
 .find(x=>spawnSync("which",[x],{stdio:"ignore"}).status===0);
assert.ok(executable,"Chromium not present in CI image");
const browserArgs=directory=>[
 "--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
 "--disable-background-networking","--no-first-run","--no-default-browser-check",
 "--remote-debugging-port=0","--user-data-dir="+directory,"about:blank"
];
let directory=mkdtempSync(path.join(tmpdir(),"apd-real-auth-ui-"));
let browser=spawn(executable,browserArgs(directory),{stdio:"ignore"});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
let socket,serial=0;
const pending=new Map();
async function debugPort(){
 for(let attempt=0;attempt<2;attempt++){
  for(let i=0;i<160;i++){
   const file=path.join(directory,"DevToolsActivePort");
   if(existsSync(file))return Number(readFileSync(file,"utf8").split("\n")[0]);
   if(browser.exitCode!==null)break;
   await sleep(100);
  }
  if(attempt===0){
   browser.kill("SIGTERM");
   await sleep(300);
   rmSync(directory,{recursive:true,force:true});
   directory=mkdtempSync(path.join(tmpdir(),"apd-real-auth-ui-retry-"));
   browser=spawn(executable,browserArgs(directory),{stdio:"ignore"});
  }
 }
 throw Error("Chromium debug port unavailable after 2 isolated attempts");
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


const htmlSource=readFileSync("index.html","utf8")
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
 .replace(/<link\b[^>]*>/gi,"")
 .replace(/<img\b[^>]*>/gi,"")
 .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,"");
// Load the real deployed stylesheet cascade into the isolated data: page.
 // All live network URLs stay blocked by Chrome DevTools; no production API runs.
const stylesheetSources=[...readFileSync("index.html","utf8")
 .matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]
 .map(m=>m[0].match(/\bhref=["']([^"']+)["']/i)?.[1])
 .filter(url=>url && !/^https?:\/\//i.test(url))
 .map(url=>url.split("?")[0].replace(/^\.\//,""));
assert.ok(stylesheetSources.includes("public-landing-v3.css"),"New V3 stylesheet missing");
assert.ok(stylesheetSources.length>=6,"Real page stylesheet cascade incomplete");
for(const file of stylesheetSources){
 assert.match(file,/^[a-z0-9_-]+\.css$/i);
 assert.ok(existsSync(file),"Missing page CSS: "+file);
}
const cssBundle=stylesheetSources.map(file=>readFileSync(file,"utf8")).join("\n");
const screenshotDir="tmp/apd-panel-v3-synthetic-screens";
mkdirSync(screenshotDir,{recursive:true});
async function saveScreenshot(name){
 const shot=await cdp("Page.captureScreenshot",{
  format:"png",captureBeyondViewport:true,fromSurface:true
 });
 const file=path.join(screenshotDir,name+".png");
 writeFileSync(file,Buffer.from(shot.data,"base64"));
 const bytes=readFileSync(file);
 assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a","Invalid PNG screenshot");
 assert.ok(bytes.length>12000,"Screenshot too small to prove styled real panel");
}
const authPatch=readFileSync("auth_session_patch.js","utf8");
const uiPatch=readFileSync("safe_dashboard_ui_patch.js","utf8");
const priorityScript=readFileSync("scripts/apd-panel-first-alert-layout-lab.js","utf8");
assert.match(htmlSource,/id="panel-alertas"/);
assert.doesNotMatch(htmlSource,/<script\b/i);
function setupBrowser(config){
 const userId="11111111-1111-4111-8111-111111111111";
 const session="SYNTHETIC_SESSION_NOT_VALID";
 const entries=new Map([["apd_token_v2",userId],["apd_session_token_v1",session]]);
 const storage={getItem:k=>entries.get(k)??null,
  setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k)};
 Object.defineProperty(window,"localStorage",{configurable:true,value:storage});
 const lab=window.__APD_OFFLINE={
   config,userId,session,requestLog:[],writes:0,unauthorizedCount:0,
   getStorage:()=>({user:storage.getItem("apd_token_v2"),session:storage.getItem("apd_session_token_v1")})
 };
 const json=(data,status=200)=>new Response(JSON.stringify(data),{
   status,headers:{"Content-Type":"application/json"}
 });
 window.fetch=async(resource,options={})=>{
  const u=String(resource),path=u.split("?")[0];
  if(!u.startsWith("https://ancient-wildflower-cd37.apdocentepba.workers.dev/"))
   throw Error("External fetch forbidden by mock");
  const auth=String(options.headers?.Authorization||"");
  // Real worker.js routes /api/postulantes-resumen as public GET.
  const isProtected=!path.endsWith("/api/login")&&!path.endsWith("/api/google-auth")&&
    !path.endsWith("/api/postulantes-resumen");
  const correctBearer=auth==="Bearer "+session;
  lab.requestLog.push({route:path.split("/").slice(-2).join("/"),authorized:correctBearer,
    protected:isProtected,method:options.method||"GET"});
  if(isProtected&&!correctBearer)return json({ok:false,message:"Invalid synthetic bearer"},401);
  if(config.unauthorized && path.endsWith("/api/account/profile")){
    lab.unauthorizedCount++;
    return json({ok:false,message:"Expired synthetic session"},401);
  }
  if(path.endsWith("/api/account/profile"))return json({ok:true,user:{
   id:config.identityMatches?userId:"22222222-2222-4222-8222-222222222222",
   nombre:"Ensayo",apellido:"Laboratorio",activo:true
  }});
  if(path.endsWith("/api/account/preferences")){
    if(config.preferencesDelay>0)
      await new Promise(done=>setTimeout(done,config.preferencesDelay));
    return json({ok:true,preferences:{
     user_id:userId,distrito_principal:"AVELLANEDA",
     otros_distritos:[],cargos:["(PR) PRECEPTOR"],materias:[],
     niveles:["SECUNDARIA"],turnos:["M"],alertas_activas:true,
     alertas_email:true,alertas_whatsapp:false
    }});
  }
  if(path.endsWith("/api/mi-plan"))return json({ok:true,access_active:config.active,
    subscription:{status:config.active===true?"active":"unverified",source:"server",
      plan_code:"PREMIUM"},
    plan:{code:"PREMIUM",nombre:"Plan de ensayo",max_distritos:5,max_cargos:10}
  });
  if(path.endsWith("/api/mis-alertas"))return json({ok:true,resultados:config.empty?[]:[{
    idoferta:"FAKE_OFFER_1",iddetalle:"FAKE_DETAIL_1",
    cargo:"PRECEPTOR",area:"PRECEPTOR",distrito:"AVELLANEDA",
    escuela:"ESCUELA DE ENSAYO",estado:"Publicada",finoferta:"2099-12-31 23:59:00"
  }]});
  if(path.endsWith("/api/sync-offers")){lab.writes++;return json({ok:true});}
  if(path.endsWith("/api/admin/me"))return json({ok:false,message:"Not admin"},403);
  if(path.endsWith("/api/historico-resumen"))return json({ok:true,items:[],total:0});
  return json({ok:true,items:[],resultados:[]});
 };
 window.google={accounts:{id:{initialize(){},renderButton(){}}}};
 return true;
}
async function collectBrowser(){
 await window.cargarDashboard();
 for(let i=0;i<40;i++){
  await new Promise(done=>setTimeout(done,20));
  if(window.__APD_LAB_PERF.summary().sample_count &&
    (window.__APD_LAB_PREF_GUARD?.state==="ready"||
     window.__APD_LAB_PREF_GUARD?.state==="error"||
     window.__APD_LAB_PREF_GUARD?.state==="conflict"||
     !localStorage.getItem("apd_token_v2")))break;
 }
 const state=window.__APD_OFFLINE;
 return {
  mockRoutes:state.requestLog,unauthorizedCount:state.unauthorizedCount,writes:state.writes,
  storagePresent:!!state.getStorage().user,sessionPresent:!!state.getStorage().session,
  alertCount:window.alertasState?.items?.length??-1,
  offerRendered:document.getElementById("panel-alertas")?.textContent?.includes("PRECEPTOR")||false,
  status:window.__APD_LAB_PERF.summary().outcomes,
  guardState:window.__APD_LAB_PREF_GUARD?.state||null,
  prefsValue:document.getElementById("pref-distrito-principal")?.value||"",
  bootstrapLoaded:!!window.__apdStableDashboardBootstrapLoaded,
  formExists:!!document.getElementById("form-preferencias"),
  layout:(()=>{
   const panel=document.getElementById("panel-docente");
   const alertCard=document.getElementById("panel-alertas")?.closest(".panel-card");
   const rect=alertCard?.getBoundingClientRect();
   return {viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth,
    panelVisible:!panel.classList.contains("hidden") && getComputedStyle(panel).display!=="none",
    alertCardVisible:!!rect&&rect.width>80&&rect.height>25,
    width:rect?Math.round(rect.width):0,
    cssPresent:document.styleSheets.length>0,
    alertCardFirst:document.getElementById("panel-content")?.firstElementChild?.contains(document.getElementById("panel-alertas"))===true,
    mainFirst:document.getElementById("panel-docente")?.firstElementChild===document.querySelector("#panel-docente > .container"),
    promoAtBottom:(()=>{
     const p=document.getElementById("panel-docente");
     return [...p.children].slice(-2).every(node=>node.matches(".apd-safe-side-ad"));
    })(),
    authHidden:document.getElementById("login").classList.contains("hidden")};
  })()
 };
}
let scenario=0;
async function isolatedScenario({
 active=true,identityMatches=true,unauthorized=false,empty=false,preferencesDelay=150,viewportWidth=1440
}={}){
 const config={active,identityMatches,unauthorized,empty,preferencesDelay};
 await cdp("Emulation.setDeviceMetricsOverride",{width:viewportWidth,height:950,deviceScaleFactor:1,mobile:viewportWidth<600});
 const html=htmlSource+"<!-- test scenario "+(++scenario)+" -->";
 await cdp("Page.navigate",{url:"data:text/html,"+encodeURIComponent(html)});
 for(let i=0;i<70;i++){
  if(await evalBrowser('document.readyState==="complete"'))break;
  await sleep(30);
 }
 await evalBrowser("(()=>{const style=document.createElement(\'style\');style.textContent="+JSON.stringify(cssBundle)+";document.head.appendChild(style);return true;})()");
 await evalBrowser("("+setupBrowser.toString()+")("+JSON.stringify(config)+")");
 await cdp("Runtime.evaluate",{expression:candidate,returnByValue:false});
 await cdp("Runtime.evaluate",{expression:authPatch,returnByValue:false});
 await cdp("Runtime.evaluate",{expression:uiPatch,returnByValue:false});
 await cdp("Runtime.evaluate",{expression:priorityScript,returnByValue:false});
 return evalBrowser("("+collectBrowser.toString()+")()");
}
try{
 const port=await debugPort();
 const targets=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
 const page=targets.find(t=>t.type==="page");assert.ok(page);
 socket=new WebSocket(page.webSocketDebuggerUrl);
 socket.addEventListener("message",event=>{
  const packet=JSON.parse(event.data),p=pending.get(packet.id);
  if(!p)return;clearTimeout(p.timer);pending.delete(packet.id);
  if(packet.error)p.reject(Error(JSON.stringify(packet.error)));
  else p.resolve(packet.result||{});
 });
 await new Promise((resolve,reject)=>{
  socket.addEventListener("open",resolve,{once:true});
  socket.addEventListener("error",reject,{once:true});
 });
 await cdp("Runtime.enable");await cdp("Page.enable");await cdp("Network.enable");
 await cdp("Network.setBlockedURLs",{urls:["http://*","https://*"]});
 const active=await isolatedScenario({active:true,preferencesDelay:160});
 assert.equal(active.bootstrapLoaded,true,"Real UI patch did not load");
 assert.equal(active.formExists,true,"Actual editor did not mount");
 assert.equal(active.guardState,"ready","Actual editor not hydrated");
 assert.equal(active.prefsValue,"AVELLANEDA","Actual editor has wrong preferences");
 assert.equal(active.alertCount,1,"Real renderer did not keep valid offer");
 assert.equal(active.offerRendered,true,"Real renderer cannot show fake offer");
 assert.equal(active.writes,1,"Should only sync synthetic authorized offer once");
 assert.equal(active.status.rendered,1);
 assert.equal(active.layout.panelVisible,true);
 assert.equal(active.layout.cssPresent,true);
 assert.equal(active.layout.alertCardVisible,true);
 assert.equal(active.layout.authHidden,true);
 assert.equal(active.layout.alertCardFirst,true,"Alerts must precede secondary cards");
 assert.equal(active.layout.mainFirst,true,"Panel must precede nonessential promos");
 assert.equal(active.layout.promoAtBottom,true,"Promos retained below the dashboard");
 await saveScreenshot("panel-real-ui-synthetic-desktop");
 const activeMobile=await isolatedScenario({active:true,preferencesDelay:160,viewportWidth:390});
 assert.equal(activeMobile.alertCount,1);
 assert.equal(activeMobile.offerRendered,true);
 assert.equal(activeMobile.guardState,"ready");
 assert.equal(activeMobile.layout.panelVisible,true);
 assert.equal(activeMobile.layout.alertCardVisible,true);
 assert.equal(activeMobile.layout.cssPresent,true);
 assert.equal(activeMobile.layout.authHidden,true);
 assert.equal(activeMobile.layout.alertCardFirst,true,"Mobile alerts should be first");
 assert.equal(activeMobile.layout.mainFirst,true);
 assert.equal(activeMobile.layout.promoAtBottom,true);
 assert.ok(activeMobile.layout.scrollWidth<=activeMobile.layout.viewport+12,
   "Real V3 panel overflows mobile width: "+JSON.stringify(activeMobile.layout));
 await saveScreenshot("panel-real-ui-synthetic-mobile");
 assert.ok(active.mockRoutes.some(x=>x.route==="account/profile"));
 assert.ok(active.mockRoutes.filter(x=>x.protected).every(x=>x.authorized),
  "Protected requests must use bearer: "+JSON.stringify(active.mockRoutes));

 const inactive=await isolatedScenario({active:false,preferencesDelay:20});
 assert.equal(inactive.alertCount,0);assert.equal(inactive.writes,0);
 assert.equal(inactive.status.plan_inactive,1);
 assert.equal(inactive.storagePresent,true);
 const unknown=await isolatedScenario({active:null,preferencesDelay:20});
 assert.equal(unknown.alertCount,0);assert.equal(unknown.writes,0);
 assert.equal(unknown.status.plan_unverified,1);
 const mismatch=await isolatedScenario({identityMatches:false,preferencesDelay:20});
 assert.equal(mismatch.alertCount,0);assert.equal(mismatch.writes,0);
 assert.equal(mismatch.status.profile_error,1);
 const expired=await isolatedScenario({unauthorized:true,preferencesDelay:20});
 assert.equal(expired.alertCount,0);assert.equal(expired.writes,0);
 assert.equal(expired.storagePresent,false);assert.equal(expired.sessionPresent,false);
 assert.ok(expired.unauthorizedCount>=1);
 const empty=await isolatedScenario({empty:true,preferencesDelay:20});
 assert.equal(empty.alertCount,0);assert.equal(empty.status.no_matches,1);
 assert.equal(empty.writes,1);
 console.log("APD_REAL_AUTH_UI_OFFLINE_INTEGRATION_PASS "+
  JSON.stringify({scenarios:7,actual_main_html:true,real_v3_stylesheets:true,
   first_alert_layout_candidate:true,
   desktop_and_mobile_visual_screenshots:true,no_live_network:true,actual_candidate_app:true,
   actual_auth_patch:true,actual_safe_ui_bootstrap:true,actual_dashboard_renderer:true,
   real_worker_requests:false,real_credentials:false,
   active_pref_hydration:active.guardState,plan_gates_checked:true,
   profile_id_check:true,expired_session_cleared:true}));
}finally{
 for(const p of pending.values())clearTimeout(p.timer);
 pending.clear();socket?.close();browser.kill("SIGTERM");
 await sleep(200);rmSync(directory,{recursive:true,force:true});
}
