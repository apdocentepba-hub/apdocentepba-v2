import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,readFileSync,rmSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const CHROME=['google-chrome','google-chrome-stable','chromium','chromium-browser'].find(c=>spawnSync('which',[c],{stdio:'ignore'}).status===0);
if(!CHROME)throw Error('Chrome/Chromium no instalado');
const out=path.resolve('tmp/ui-v21-browser');mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,profile,ws,seq=0;const pending=new Map();
async function cleanup(){
 if(chrome&&chrome.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGTERM');for(let i=0;i<20&&chrome.exitCode===null&&chrome.signalCode===null;i++)await sleep(100);if(chrome.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGKILL');}
 if(profile){rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});profile=null;}
}
async function launch(){
 for(let attempt=1;attempt<=2;attempt++){
  profile=mkdtempSync(path.join(tmpdir(),'apd-ui21-'));
  let tail='',failure=null;
  chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',b=>{tail=(tail+b.toString()).slice(-2000);});chrome.on('error',e=>{failure=e;});
  for(let i=0;i<250;i++){
   const file=path.join(profile,'DevToolsActivePort');
   if(existsSync(file)){
    const port=Number(readFileSync(file,'utf8').split('\n')[0]);
    if(Number.isInteger(port)&&port>0&&port<65536)return port;
   }
   if(failure||chrome.exitCode!==null||chrome.signalCode!==null)break;
   await sleep(100);
  }
  // Retry browser startup only, never failed application assertions.
  console.warn('APD_UI_V21_CHROME_STARTUP_FAILURE attempt='+attempt+' exit='+chrome.exitCode+' stderr='+tail.replace(/[\r\n]+/g,' ').slice(-1000));
  await cleanup();
 }
 throw Error('Chrome no expuso debugging tras dos arranques aislados');
}
function cdp(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout CDP '+method));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function js(code){const r=await cdp('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function ready(){for(let i=0;i<60;i++){if(await js('document.readyState==="complete"'))return;await sleep(100);}throw Error('Document no terminó');}
try{
 const dport=await launch();const targets=await(await fetch('http://127.0.0.1:'+dport+'/json/list')).json();
 ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
 ws.addEventListener('message',event=>{const d=JSON.parse(event.data);if(!d.id)return;const p=pending.get(d.id);if(!p)return;pending.delete(d.id);clearTimeout(p.timer);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result||{});});
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 await cdp('Page.enable');await cdp('Runtime.enable');
 for(const width of [1280,390]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await cdp('Page.navigate',{url:pathToFileURL(path.resolve('index.html')).href});
  await ready();await sleep(600);
  assert.equal(await js('!!document.getElementById("apd-v21-open-help")'),false,'Sin login no debe verse menú privado');
  // Datos estáticos sin credenciales: nunca iniciar sesión en ABC ni APDocente.
  await js("(()=>{document.getElementById('navPublico')?.classList.add('hidden');document.getElementById('navPrivado')?.classList.remove('hidden');document.querySelectorAll('section.section').forEach(s=>s.classList.add('hidden'));document.getElementById('panel-docente').classList.remove('hidden');window.APD_refreshPanelTabs?.();return true;})()");
  await sleep(900);
  const state=await js("({visible:document.body.classList.contains('apd-ui-v21-live'),sidebar:!!document.querySelector('#apd-ui-v21-sidebar'),buttons:document.querySelectorAll('#apd-ui-v21-sidebar .apd-top-tab').length,admin:!!document.querySelector('.apd-top-tab[data-top-tab-key=\"admin\"]:not(.hidden)'),cards:!!document.querySelector('#apd-v21-activation'),overflow:document.documentElement.scrollWidth,viewport:innerWidth})");
  assert.equal(state.visible,true,JSON.stringify(state));assert.equal(state.sidebar,true);
  assert.equal(state.buttons,8);assert.equal(state.admin,false,'Admin debe estar oculto sin autenticación');
  assert.equal(state.cards,false,'Checklist manual eliminado del panel');assert.ok(state.overflow<=state.viewport+3,'Overflow horizontal '+width+' '+JSON.stringify(state));
  await js('document.getElementById("apd-v21-open-help").click();true');
  assert.equal(await js('document.getElementById("apd-v21-help").open'),true);
  await js('document.querySelector("#apd-v21-help [data-topic=email]").click();true');
  assert.match(await js('document.querySelector(".apd-v21-help-result").textContent'),/No llegan los emails/);
  await js('document.querySelector(".apd-v21-help-close").click();true');
  assert.equal(await js('document.getElementById("apd-v21-help").open'),false);
  assert.ok(await js('!!document.getElementById("panel-alertas")'),'Se conserva el carrusel original');
  const shot=await cdp('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  writeFileSync(path.join(out,'apd-ui-v21-'+width+'.png'),Buffer.from(shot.data,'base64'));
  console.log('APD_UI_V21_BROWSER_OK width='+width+' botones='+state.buttons+' admin=oculto');
 }
}finally{ws?.close();await cleanup();}
