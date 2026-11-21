/* LAB ONLY: real Chromium paints using the actual instrumented cargarDashboard
 * function, with 100% fake token/plan/profile/ABC data and stubbed renderers.
 * No user authentication, live network, persistence or production writes.
 */
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

const candidate=readFileSync("tmp/apd-alerts-performance/app_v2_telemetry_candidate.js","utf8");
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
let directory=mkdtempSync(path.join(tmpdir(),"apd-first-alert-paint-"));
let browser=spawn(executable,browserArgs(directory),{stdio:"ignore",detached:true});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
let socket,serial=0;
const pending=new Map();
async function stopForRetry(){
 // Chromium can leave child helpers writing to the temporary profile AFTER
 // the main PID exits. This test runs only on Ubuntu CI: spawn its own process
 // group, then terminate that group before removing the disposable directory.
 if(browser.pid&&process.platform!=="win32"){
  try{process.kill(-browser.pid,"SIGKILL");}
  catch(error){if(error.code!=="ESRCH")throw error;}
 }else if(browser.exitCode===null){
  browser.kill("SIGKILL");
 }
 await new Promise(resolve=>{
  if(browser.exitCode!==null||browser.signalCode!==null)return resolve();
  const t=setTimeout(resolve,3000);
  browser.once("exit",()=>{clearTimeout(t);resolve();});
 });
 let last;
 for(let attempt=0;attempt<12;attempt++){
  try{
   rmSync(directory,{recursive:true,force:true,maxRetries:2,retryDelay:100});
   return;
  }catch(error){
   if(error.code!=="ENOTEMPTY"&&error.code!=="EBUSY")throw error;
   last=error;
   await sleep(300);
  }
 }
 throw last;
}
async function debugPort(){
 // Startup can fail intermittently on shared GitHub runners; retry ONLY
 // before a debug connection was established, with a completely fresh profile.
 for(let attempt=0;attempt<2;attempt++){
  for(let i=0;i<120;i++){
   const file=path.join(directory,"DevToolsActivePort");
   if(existsSync(file)){
    const port=Number(readFileSync(file,"utf8").split("\n")[0]);
    if(Number.isInteger(port)&&port>0)return port;
   }
   if(browser.exitCode!==null||browser.signalCode!==null)break;
   await sleep(100);
  }
  if(attempt===0){
   await stopForRetry();
   directory=mkdtempSync(path.join(tmpdir(),"apd-first-alert-retry-"));
   browser=spawn(executable,browserArgs(directory),{stdio:"ignore",detached:true});
  }
 }
 throw Error("Chromium debug port unavailable after 2 fresh-profile attempts");
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
async function scenarioInBrowser({dashboardSource,meterSource,delays={},inactive=false,failApi=false,empty=false}){
 const createMeter=new Function(meterSource+"\nreturn createApdPanelTimingMeter;")();
 const meter=createMeter();
 window.__APD_LAB_PERF=meter;
 const fakeToken="SYNTHETIC_ONLY_SESSION";
 let synchronized=0;
 const later=(ms,value,fail=false)=>new Promise((resolve,reject)=>{
  setTimeout(()=>fail?reject(Error("simulated source error")):resolve(value),ms);
 });
 const dependencies={
  window,document,console:{warn(){},error(){}},
  alert(){},logout(){},localStorage:{getItem:()=>fakeToken},
  obtenerToken:()=>fakeToken,actualizarNav(){},
  mostrarSeccion(){},setPanelLoading(){},
  obtenerMisAlertas:()=>later(delays.api??15,empty?[]:[{source_offer_key:"D_FAKE_1"}],failApi),
  obtenerDocentePorId:()=>later(delays.profile??15,{id:"FAKE",nombre:"DEMO"}),
  obtenerPreferenciasPorUserId:()=>later(delays.prefs??15,{}),
  obtenerMiPlan:()=>later(delays.plan??15,{access_active:!inactive}),
  adaptarPreferencias:()=>({}),buildPlanFallback:()=>({access_active:null}),
  renderDashboard(){},cargarPrefsEnFormulario(){},renderPlanUI(){},
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
 await dashboard();
 for(let i=0;i<45&&meter.summary().sample_count<1;i++)
  await new Promise(done=>setTimeout(done,20));
 const result=meter.summary();
 const samples=meter.snapshot();
 return {result,paintText:document.getElementById("panel-alertas").textContent,
  synchronized,samples,noExternalNetwork:true};
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
 await cdp("Page.navigate",{url:"data:text/html,"+
   encodeURIComponent("<!doctype html><html><body><div id='panel-alertas'></div><div id='alertas-badge'></div></body></html>")});
 for(let i=0;i<50;i++){
  if(await evalBrowser('document.readyState==="complete"'))break;
  await sleep(50);
 }
 const run=async options=>evalBrowser("("+
  scenarioInBrowser.toString()+")("+JSON.stringify({
   dashboardSource,meterSource,...options
  })+")");
 const slowApi=await run({delays:{api:170,profile:15,prefs:15,plan:15}});
 const slowPreferences=await run({delays:{api:12,profile:15,prefs:170,plan:15}});
 const inactive=await run({inactive:true});
 const error=await run({failApi:true});
 const empty=await run({empty:true});
 for(const [name,s] of Object.entries({slowApi,slowPreferences,inactive,error,empty})){
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
 assert.ok(slowPreferences.samples[0].profile_ms>slowPreferences.samples[0].api_ms+70,
  "A deliberately slow preferences response currently blocks first alert paint");
 assert.ok(slowPreferences.samples[0].rendered_ms>=slowPreferences.samples[0].profile_ms);
 assert.equal(inactive.result.outcomes.plan_inactive,1);
 assert.equal(inactive.paintText,"SIN_ALERTAS");
 assert.equal(inactive.synchronized,0);
 assert.equal(error.result.outcomes.api_error,1);
 assert.match(error.paintText,/No pudimos verificar/);
 assert.equal(error.synchronized,0);
 assert.equal(empty.result.outcomes.no_matches,1);
 assert.equal(empty.synchronized,1);
 console.log("APD_CHROMIUM_FIRST_ALERT_SYNTHETIC_PASS "+JSON.stringify({
  scenarios:5,
  slow_api_ms:slowApi.samples[0],
  slow_preferences_ms:slowPreferences.samples[0],
  active_gate_blocked:true,source_error_distinct:true,
  browser_real:true,frontend_renderers_stubbed:true,
  no_real_user_credentials:true,production_not_measured:true,
  no_production_changes:true
 }));
}finally{
 for(const p of pending.values())clearTimeout(p.timer);
 pending.clear();socket?.close();
 await stopForRetry();
}
