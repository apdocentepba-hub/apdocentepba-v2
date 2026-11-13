/**
 * Read-only production smoke: compare public GitHub Pages assets with the
 * exact checkout running this script. No login, cookies, GPS, or user data.
 *
 * Run: node scripts/apd-public-deployment-smoke.mjs
 * A failed check means the CDN is stale, unavailable, or serving different
 * bytes; it does NOT by itself identify the cause.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const ORIGIN = 'https://alertasapd.com.ar';
const FILES = Object.freeze([
 // Entry point, comparator UI and authenticated home reference.
 'index.html',
 'apd_comparador_panel.mjs',
 'apd_comparador_panel.css',
 'account_home_reference_patch.js',
 // School map overlay and all private planner/comparator dependencies.
 'apd_offer_school_map_overlay.mjs',
 'scripts/apd-comparador-criterios.mjs',
 'scripts/apd-comparador-datos-evaluacion.mjs',
 'scripts/apd-mi-jornada-comparador.mjs',
 'scripts/apd-home-georef.mjs',
 'scripts/apd-mi-jornada-ui.mjs',
 'scripts/apd-account-home-write-policy.mjs',
 'scripts/apd-insigne-planner-entitlement.mjs',
 'scripts/apd-school-geodistance.mjs',
 // Multimodal routes and opt-in AMBA mapped bus-route layers.
 'scripts/apd-mobility-ui.mjs',
 'scripts/apd-multimodal-transport.mjs',
 'scripts/apd-amba-bus-routes.mjs'
]);
const MAX_BYTES = 2_000_000;
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

async function readPublicFile(path) {
 const url = new URL('/'+path,ORIGIN);
 // Different URL per run avoids treating a cached prior check as evidence.
 url.searchParams.set('apd_readonly_smoke',String(Date.now()));
 const response = await fetch(url,{
  method:'GET',redirect:'error',credentials:'omit',
  signal:AbortSignal.timeout(15000),
  headers:{Accept:'*/*','Cache-Control':'no-cache'}
 });
 assert.equal(response.status,200,path+': HTTP '+response.status);
 assert.ok(response.body,path+': response body unavailable');
 const length=Number(response.headers.get('content-length')||0);
 assert.ok(Number.isFinite(length)&&length<=MAX_BYTES,path+': invalid Content-Length');
 const chunks=[],reader=response.body.getReader();
 let total=0;
 while(true){
  const {done,value}=await reader.read();
  if(done)break;
  total+=value.byteLength;
  if(total>MAX_BYTES){await reader.cancel();throw Error(path+': body exceeds limit')}
  chunks.push(Buffer.from(value));
 }
 assert.ok(total>0,path+': empty response');
 return Buffer.concat(chunks,total);
}

async function run(){
 // Never send any private profile, token, or customer address in this test.
 let mismatch=0;
 for(const file of FILES){
  const expected=await readFile(new URL('../'+file,import.meta.url));
  try{
   const actual=await readPublicFile(file);
   const equal=sha256(actual)===sha256(expected);
   console.log((equal?'PASS':'FAIL')+' '+file+
    ' local='+sha256(expected).slice(0,12)+
    ' public='+sha256(actual).slice(0,12)+
    ' bytes='+actual.length);
   if(!equal)mismatch++;
  }catch(error){
   mismatch++;
   console.error('FAIL '+file+' '+String(error?.message||error));
  }
 }
 const html=(await readFile(new URL('../index.html',import.meta.url),'utf8'));
 const release=html.match(/apd_comparador_panel\.mjs\?v=([^']+)/)?.[1]||'not-found';
 console.log('APD_PUBLIC_SMOKE '+JSON.stringify({
  origin:ORIGIN,release,checked:FILES.length,failed:mismatch,
  scope:'unauthenticated_static_assets_only'
 }));
 if(mismatch)process.exitCode=1;
}
await run();
