// Standalone headless Chromium E2E. Only localhost requests; all offers synthetic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const chromeCmd=['google-chrome','google-chrome-stable','chromium','chromium-browser']
 .find(bin=>spawnSync('which',[bin],{stdio:'ignore'}).status===0);
assert.ok(chromeCmd,'Chromium browser required');
const origin=process.cwd();
const output=path.resolve('tmp/apd-comparator-browser');
mkdirSync(output,{recursive:true});
const profile=mkdtempSync(path.join(tmpdir(),'apd-compare-chrome-'));
const indexSource=readFileSync('index.html','utf8');
const bootstrap=[...indexSource.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)]
 .find(match=>match[1].includes('new MutationObserver(sync)'))?.[1];
assert.ok(bootstrap,'actual dashboard observer bootstrap must be present');
const html=`<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/apd_comparador_panel.css">
<style>body{margin:0;padding:16px;font:14px Arial,sans-serif;background:#f5f9ff}
#fixture{max-width:1050px;margin:auto;padding:16px;border-radius:12px;background:white}
#panel-alertas .alerta-actions{display:flex;gap:8px}
.btn{border:1px solid #99b1db;border-radius:9px;padding:8px;background:white}
</style></head><body><div id="fixture">
<h2>Panel de Alertas APD — laboratorio</h2>
<div id="panel-alertas"><article class="alerta-main-card"><div class="alerta-actions"></div></article></div>
<section id="apd-comparador-panel" class="apd-comparator-panel" hidden></section>
</div>
<script>
let dashboardLoadedOwner=null;
let planActual={access_active:false};
window.alertasState={items:[],index:0};
window.__testToken=null;
function obtenerToken(){return window.__testToken;}
</script>
<script>${bootstrap}</script></body></html>`;
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const paths={
  '/':{type:'text/html',body:html},
  '/apd_comparador_panel.mjs':{type:'text/javascript',body:readFileSync('apd_comparador_panel.mjs')},
  '/scripts/apd-comparador-criterios.mjs':{type:'text/javascript',body:readFileSync('scripts/apd-comparador-criterios.mjs')},
  '/apd_comparador_panel.css':{type:'text/css',body:readFileSync('apd_comparador_panel.css')}
 };
 if(!paths[pathname]){res.writeHead(404);res.end('Missing');return;}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type',paths[pathname].type+'; charset=utf-8');
 res.end(paths[pathname].body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=spawn(chromeCmd,[
 '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
 '--disable-background-networking','--no-first-run',
 '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:['ignore','ignore','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0;const pending=new Map();
async function debugPort(){
 for(let i=0;i<120;i++){
  const file=path.join(profile,'DevToolsActivePort');
  if(existsSync(file))return Number(readFileSync(file,'utf8').split('\n')[0]);
  if(browser.exitCode!==null)throw Error('Chrome unexpectedly closed');
  await sleep(100);
 }
 throw Error('Chrome debugging unavailable');
}
function cdp(method,params={}){
 const id=++seq;
 return new Promise((resolve,reject)=>{
  const t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},13000);
  pending.set(id,{resolve,reject,t});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function js(expression){
 const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
 if(r.exceptionDetails)throw Error('Browser JS: '+JSON.stringify(r.exceptionDetails));
 return r.result.value;
}
async function until(code){
 for(let n=0;n<100;n++) {
  if(await js(code))return;
  await sleep(100);
 }
 throw Error('Page did not load expected comparator module');
}
async function screenshot(name){
 const shot=await cdp('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
 writeFileSync(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
}
const synthetic=Array.from({length:6},(_,i)=>({
 iddetalle:8000+i,idoferta:5000+i,escuela:i%2?'0085MS0043':'0005MS0004',
 distrito:i%2?'QUILMES':'AVELLANEDA',turno:i%2?'Tarde':'Mañana',
 descripcioncargo:i===1?'<img src=x onerror=alert(1)>':'MATEMÁTICA '+i,
 finoferta:`2035-12-${String(10+i).padStart(2,'0')}T10:00:00-03:00`,
 estado:'PUBLICADA'
}));
const results=[];
try{
 const cp=await debugPort();
 const targets=await(await fetch('http://127.0.0.1:'+cp+'/json/list')).json();
 ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
 ws.addEventListener('message',ev=>{
  const msg=JSON.parse(ev.data);if(!msg.id)return;
  const p=pending.get(msg.id);if(!p)return;
  pending.delete(msg.id);clearTimeout(p.t);
  msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result||{});
 });
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 await cdp('Page.enable');await cdp('Runtime.enable');
 for(const width of [390,1280]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
  await until('document.readyState==="complete"');
  assert.equal(await js('document.getElementById("apd-comparador-panel").hidden'),true);
  assert.equal(await js('typeof window.APD_comparatorRefresh'),'undefined',
   'Anonymous pages must not load comparator modules');
  await js(`(()=>{
   window.__offers=${JSON.stringify(synthetic)};
   dashboardLoadedOwner='SYNTHETIC_USER_A';
   window.__testToken='SYNTHETIC_USER_A';
   planActual={access_active:true};
   window.alertasState={items:window.__offers,index:0};
   document.getElementById('panel-alertas').innerHTML=
    '<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  await until('typeof window.APD_comparatorRefresh==="function" && !document.getElementById("apd-comparador-panel").hidden');
  assert.equal(await js('document.getElementById("apd-comparador-panel").hidden'),false);
  assert.equal(await js('!!document.querySelector("#apd-comparar-oferta")'),true);
  for(let i=0;i<5;i++){
   await js(`(()=>{
    window.alertasState.index=${i};
    document.getElementById('panel-alertas').innerHTML='<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
    return true;
   })()`);
   await until('!!document.getElementById("apd-comparar-oferta")');
   await js('document.getElementById("apd-comparar-oferta").click();true');
  }
  const state=await js(`({
   total:document.querySelector('.apd-comparator-count')?.textContent,
   items:document.querySelectorAll('.apd-comparator-item').length,
   forgedImage:!!document.querySelector('.apd-comparator-item img'),
   escapeVisible:document.querySelector('#apd-comparador-panel')?.textContent.includes('<img src=x'),
   overflow:document.documentElement.scrollWidth,viewport:innerWidth,
   hasOfficialMap:!!document.querySelector('.apd-comparator-map-link')
  })`);
  assert.equal(state.total,'5 de 5 ofertas seleccionadas');
  assert.equal(state.items,5);
  assert.equal(state.forgedImage,false);
  assert.equal(state.escapeVisible,true);
  assert.equal(state.hasOfficialMap,false,'Map links must remain hidden if map implementation is absent');
  await js('window.APD_offerSchoolMapReady=true;window.APD_comparatorRefresh({offers:window.__offers,index:4,enabled:true});true');
  assert.equal(await js('!!document.querySelector(".apd-comparator-map-link")'),true,
   'Map link becomes available only when verified-key map code is present');
  assert.ok(state.overflow<=state.viewport+6,'Horizontal overflow '+JSON.stringify(state));
  await screenshot('comparator-'+width+'-five-selected');
  await js(`(()=>{
    window.alertasState.index=5;
    document.getElementById('panel-alertas').innerHTML='<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
    return true;
   })()`);
  await until('!!document.getElementById("apd-comparar-oferta")');
  await js('document.getElementById("apd-comparar-oferta").click();true');
  assert.equal(await js('document.querySelectorAll(".apd-comparator-item").length'),5);
  assert.match(await js('document.querySelector("#apd-comparator-status").textContent'),/hasta cinco ofertas/);
  await js(`(()=>{
   dashboardLoadedOwner='SYNTHETIC_USER_B';
   window.__testToken='SYNTHETIC_USER_B';
   window.alertasState={items:window.__offers.slice(0,2),index:0};
   document.getElementById('panel-alertas').innerHTML='<article class="alerta-main-card"><div class="alerta-actions"></div></article>';
   return true;
  })()`);
  await until('document.querySelector(".apd-comparator-count")?.textContent==="0 de 5 ofertas seleccionadas"');
  await js('document.getElementById("apd-comparar-oferta").click();true');
  await js(`(()=>{
   dashboardLoadedOwner=null;
   window.__testToken=null;
   window.alertasState={items:[],index:0};
   document.getElementById('panel-alertas').textContent='';
   return true;
  })()`);
  await until('document.getElementById("apd-comparador-panel").hidden');
  assert.equal(await js('document.querySelector(".apd-comparator-item")'),null);
  results.push({width,private_gating:true,up_to_five:true,xss_escaped:true,
   session_reset:true,limit_enforced:true,responsive:true});
 }
 console.log('APD_COMPARATOR_REAL_BROWSER '+JSON.stringify({success:true,results,network:'localhost_only',auth:'synthetic'}));
}finally{
 for(const p of pending.values()){clearTimeout(p.t);p.reject(Error('Browser stopping'));}
 pending.clear();ws?.close();browser.kill('SIGTERM');
 await new Promise(resolve=>server.close(resolve));
 await sleep(200);rmSync(profile,{recursive:true,force:true});
}
