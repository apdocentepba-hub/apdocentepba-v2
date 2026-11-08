/* Real headless Chromium QA, purely synthetic WFS fixture, zero network or accounts.
 * Tests desktop/mobile layout, correct school pin and safe failure after refresh.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const chromeCmd=['google-chrome','google-chrome-stable','chromium','chromium-browser']
 .find(c=>spawnSync('which',[c],{stdio:'ignore'}).status===0);
assert.ok(chromeCmd,'Chrome/Chromium no disponible en CI');
const root=mkdtempSync(path.join(tmpdir(),'apd-school-map-'));
const output=path.resolve('tmp/apd-school-map-browser');
mkdirSync(output,{recursive:true});
const fixture=path.join(root,'mapa-qa.html');
const stub=`<script>
window.__networkDown=false;
window.__requests=[];
window.__pins=[];
const geoMap={setView(){return this;},addLayer(){return this;},fitBounds(){}};
const markerGroup={
 clearLayers(){window.__pins=[];},
 addLayer(pin){window.__pins.push(pin);},
 getLayers(){return window.__pins;}
};
window.L={
 map:()=>geoMap,
 tileLayer:()=>({addTo:()=>{}}),
 markerClusterGroup:()=>markerGroup,
 marker:([lat,lon])=>({lat,lon,bindPopup(popup){this.popup=popup;return this;}}),
 featureGroup:()=>({getBounds:()=>({pad:()=>({})})})
};
window.fetch=async (url,options={})=>{
 const u=new URL(String(url));
 window.__requests.push({host:u.hostname,method:options.method||'GET',filter:u.searchParams.get('CQL_FILTER')});
 if(window.__networkDown)throw Error('simulated_network_unavailable');
 if(u.hostname!=='mapaescolar.abc.gob.ar')throw Error('unexpected_network_request');
 const code=String(u.searchParams.get('CQL_FILTER')||'').match(/clave='([^']+)'/)?.[1]||'';
 const feature={
  type:'Feature',properties:{
   clave:'0005MS0004',nombre:'Escuela <script>nunca ejecutar()<' + '/script>',
   cue:'061002000',calle:'Calle Prueba',nro:'100',distrito:'Avellaneda',
   localidad:'Wilde',latitud:-34.69,longitud:-58.33
  }
 };
 const bytes=new TextEncoder().encode(JSON.stringify({
  features:code==='0005MS0004'?[feature]:[]
 }));
 return {ok:true,status:200,headers:{get:()=>String(bytes.byteLength)},arrayBuffer:async()=>bytes.buffer};
};
</script>`;
const raw=readFileSync('mapa-escuelas-pba.html','utf8');
const html=raw.replace(/<script src="[^"]+"><\/script>/g,'').replace('<script>',''+stub+'<script>');
assert.ok(html.includes('window.__pins'));
writeFileSync(fixture,html,'utf8');
const chrome=spawn(chromeCmd,['--headless=new','--no-sandbox','--disable-gpu',
 '--disable-dev-shm-usage','--disable-background-networking','--no-first-run',
 '--remote-debugging-port=0','--user-data-dir='+root+'/profile','about:blank'],
 {stdio:['ignore','ignore','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let socket,seq=0;const pending=new Map();
async function port(){
 for(let n=0;n<120;n++){
  const p=path.join(root,'profile','DevToolsActivePort');
  if(existsSync(p))return Number(readFileSync(p,'utf8').split('\n')[0]);
  if(chrome.exitCode!==null)throw Error('Chrome exited');
  await sleep(100);
 }
 throw Error('Chrome debug port unavailable');
}
function cdp(method,params={}){
 const id=++seq;
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timed out '+method));},13000);
  pending.set(id,{resolve,reject,timeout});
  socket.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const r=await cdp('Runtime.evaluate',{
  expression,returnByValue:true,awaitPromise:true,userGesture:true
 });
 if(r.exceptionDetails)throw Error('Browser expression failed '+JSON.stringify(r.exceptionDetails));
 return r.result.value;
}
async function until(statement){
 for(let i=0;i<90;i++){
  if(await evaluate(statement))return;
  await sleep(100);
 }
 const diagnostics=await evaluate(`({
  ready:document.readyState,
  stFuente:document.getElementById('stFuente')?.textContent,
  stTotal:document.getElementById('stTotal')?.textContent,
  error:document.getElementById('err')?.textContent,
  requests:window.__requests?.length,
  keys:typeof window.L,
  loadType:typeof cargarOficial
 })`).catch(()=>({failedToEvaluate:true}));
 console.log('APD_SCHOOL_MAP_BROWSER_DEBUG '+JSON.stringify(diagnostics));
 throw Error('Map did not reach required browser state: '+statement);
}
async function shot(name){
 const img=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 writeFileSync(path.join(output,name+'.png'),Buffer.from(img.data,'base64'));
}
const results=[];
try{
 const p=await port();
 const tabs=await(await fetch('http://127.0.0.1:'+p+'/json/list')).json();
 socket=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);
 socket.addEventListener('message',ev=>{
  const msg=JSON.parse(ev.data);
  if(!msg.id)return;
  const state=pending.get(msg.id);
  if(!state)return;
  pending.delete(msg.id);clearTimeout(state.timeout);
  msg.error?state.reject(Error(JSON.stringify(msg.error))):state.resolve(msg.result||{});
 });
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
 });
 await cdp('Page.enable');await cdp('Runtime.enable');
 for(const width of [390,1280]){
  await cdp('Emulation.setDeviceMetricsOverride',{
   width,height:850,deviceScaleFactor:1,mobile:width===390
  });
  const url=pathToFileURL(fixture).href+'?clave=0005MS0004&distrito=Avellaneda';
  await cdp('Page.navigate',{url});
  await until(`document.getElementById('stFuente')?.textContent==='Mapa Escolar ABC · WFS oficial'`);
  const state=await evaluate(`({
   width:innerWidth,docWidth:document.documentElement.scrollWidth,
   input:document.getElementById('q').value,rows:document.querySelectorAll('#lista .row').length,
   markers:window.__pins.length,popup:window.__pins[0]?.popup||'',
   url:window.__requests[0]?.host,
   filter:window.__requests[0]?.filter,
   requests:window.__requests.length,
   strayImage:!!document.querySelector('img[src="x"]')
  })`);
  assert.equal(state.input,'0005MS0004');
  assert.equal(state.rows,1,JSON.stringify(state));
  assert.equal(state.markers,1,JSON.stringify(state));
  assert.equal(state.requests,1,'One bounded WFS GET only');
  assert.equal(state.url,'mapaescolar.abc.gob.ar');
  assert.equal(state.filter,"clave='0005MS0004'");
  assert.match(state.popup,/&lt;script&gt;/);
  assert.equal(state.strayImage,false);
  assert.ok(state.docWidth<=state.width+5,'Mobile horizontal overflow '+JSON.stringify(state));
  await shot('map-'+width+'-official');
  // Check refreshed map does not retain an obsolete pin after ABC is unavailable.
  const outage=await evaluate(`(async()=>{
   window.__networkDown=true;
   await cargarOficial();
   return {
    pins:window.__pins.length,rows:document.querySelectorAll('#lista .row').length,
    requests:window.__requests.length,
    error:document.getElementById('err').textContent,
    official:document.querySelector('#mapa-oferta-aviso a')?.href||''
   };
  })()`);
  assert.equal(outage.pins,0,JSON.stringify(outage));
  assert.equal(outage.rows,0);
  assert.equal(outage.requests,2,'No giant national XLSX fallback on phone');
  assert.match(outage.error,/No se pudo confirmar la ubicación/);
  assert.equal(outage.official,'https://mapaescolar.abc.gob.ar/mapaescolar/');
  await shot('map-'+width+'-no-network');
  results.push({width,matched:1,coordinates_verified:true,layout_ok:true,
   failure_clears_old_pin:true,avoids_large_download:true});
 }
 console.log('APD_SCHOOL_MAP_REAL_BROWSER_QA '+JSON.stringify({passed:true,results}));
}finally{
 for(const state of pending.values()){clearTimeout(state.timeout);state.reject(Error('closing Chrome'));}
 pending.clear();
 socket?.close();chrome.kill('SIGTERM');
 await sleep(200);rmSync(root,{recursive:true,force:true});
}
