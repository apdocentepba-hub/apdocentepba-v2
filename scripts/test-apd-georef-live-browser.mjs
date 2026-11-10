/**
 * Real browser / real Georef smoke. Candidate-only, read-only.
 * Synthetic fixed public example, NO APD users, credentials or private data.
 * Tests the actual Insigne JS module in Chromium from a local HTTP origin.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const chromeCmd=['google-chrome','google-chrome-stable','chromium','chromium-browser']
 .find(bin=>spawnSync('which',[bin],{stdio:'ignore'}).status===0);
assert.ok(chromeCmd,'Chromium no está disponible en el runner');
const profile=mkdtempSync(path.join(tmpdir(),'apd-georef-live-'));
const moduleBody=readFileSync('scripts/apd-home-georef.mjs','utf8');
const server=createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/scripts/apd-home-georef.mjs'){
  res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8',
   'Cache-Control':'no-store'});res.end(moduleBody);return;
 }
 if(p==='/'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
   'Cache-Control':'no-store',
   'Content-Security-Policy':"default-src 'self'; connect-src 'self' https://apis.datos.gob.ar; script-src 'self'"});
  res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Georef API browser smoke</title><body>Fixture local aislado</body></html>');return;
 }
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=spawn(chromeCmd,[
 '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
 '--disable-background-networking','--no-first-run',
 '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:['ignore','ignore','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0,requestCount=0;
const pending=new Map(),domains=new Set();
const bounded=(promise,ms,description)=>Promise.race([promise,new Promise((_,reject)=>
 setTimeout(()=>reject(Error(description+' excedió '+ms+' ms')),ms))]);
async function debugPort(){
 for(let i=0;i<120;i++){
  const file=path.join(profile,'DevToolsActivePort');
  if(existsSync(file))return Number(readFileSync(file,'utf8').split('\n')[0]);
  if(browser.exitCode!==null)throw Error('Chrome se cerró antes de iniciar');
  await sleep(100);
 }
 throw Error('Chrome no habilitó DevTools');
}
function cdp(method,params={}){
 const id=++seq;
 return bounded(new Promise((resolve,reject)=>{
  pending.set(id,{resolve,reject});
  ws.send(JSON.stringify({id,method,params}));
 }),22000,method);
}
async function evaluate(expression){
 const response=await cdp('Runtime.evaluate',{expression,awaitPromise:true,
  returnByValue:true,timeout:20000});
 if(response.exceptionDetails)
  throw Error('Error en la página: '+
   (response.exceptionDetails.text||response.exceptionDetails.exception?.description||'desconocido'));
 return response.result?.value;
}
try{
 const cp=await debugPort();
 const pages=await(await fetch('http://127.0.0.1:'+cp+'/json/list')).json();
 const page=pages.find(t=>t.type==='page');
 assert.ok(page,'Chrome no creó página');
 ws=new WebSocket(page.webSocketDebuggerUrl);
 ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.method==='Network.requestWillBeSent'){
   const url=m.params?.request?.url||'';
   if(url.startsWith('http')){domains.add(new URL(url).origin);requestCount++}
  }
  if(!m.id)return;
  const p=pending.get(m.id);
  if(!p)return;
  pending.delete(m.id);
  m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result||{});
 });
 await bounded(new Promise((resolve,reject)=>{
  ws.addEventListener('open',resolve,{once:true});
  ws.addEventListener('error',reject,{once:true});
 }),15000,'WebSocket DevTools');
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
 await cdp('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
 for(let i=0;i<60;i++){
  if(await evaluate('document.readyState')==='complete')break;
  await sleep(100);
 }
 // Public fixture: no user-provided address, account or geolocation.
 const pageScript=[
  '(async()=>{',
  " const georef=await import('/scripts/apd-home-georef.mjs');",
  " const response=await georef.lookupHomeAddressesDetailed('Urquiza 400, Rosario, Rosario, Santa Fe');",
  ' return {scope:response.scope,attempted:response.attempted,',
  ' candidateCount:response.candidates.length,',
  ' allArgentina:response.candidates.every(x=>',
  "   Number.isFinite(x.lat)&&Number.isFinite(x.lon)&&x.source==='GEOREF_AR_V2'&&x.height===400),",
  " sampleAreas:response.candidates.slice(0,3).map(x=>x.label.split(',').slice(1).join(',').trim())",
  ' };',
  '})()'
 ].join('\n');
 const result=await bounded(evaluate(pageScript),25000,'Georef desde Chromium');
 assert.ok(result,'No hubo respuesta de la página');
 assert.ok(result.candidateCount>0,'Georef no devolvió candidatos normalizados');
 assert.equal(result.allArgentina,true,'Candidatos con origen, altura o coordenadas inválidas');
 assert.ok(result.attempted>=1&&result.attempted<=4,
  'La consulta repitió filtros fuera del límite');
 const expected='https://apis.datos.gob.ar';
 assert.ok(domains.has(expected),'El navegador nunca consultó Georef');
 assert.ok([...domains].every(v=>v===expected||v==='http://127.0.0.1:'+port),
  'El navegador contactó un origen no previsto');
 console.log('GEOREF_REAL_CHROMIUM_PASS',JSON.stringify({
  browser:'Chromium headless',origin:'localhost',
  georefHost:expected,scope:result.scope,
  queries:result.attempted,candidates:result.candidateCount,
  labelsOnly:result.sampleAreas,
  publicFixtureOnly:true,credentialsUsed:false,networkRequestCount:requestCount
 }));
}finally{
 for(const p of pending.values())p.reject(Error('Chrome cerrado'));
 pending.clear();
 try{ws?.close()}catch{}
 browser.kill('SIGTERM');
 await new Promise(resolve=>server.close(resolve));
 rmSync(profile,{recursive:true,force:true});
}
