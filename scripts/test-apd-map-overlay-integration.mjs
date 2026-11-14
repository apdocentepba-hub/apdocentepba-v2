import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../app_v2.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const moduleSource=fs.readFileSync(new URL('../apd_offer_school_map_overlay.mjs',import.meta.url),'utf8');
const map=fs.readFileSync(new URL('../mapa-escuelas-pba.html',import.meta.url),'utf8');
const start=moduleSource.indexOf('const keyPattern=');
const end=moduleSource.indexOf('function removeLinks()',start);
assert.ok(start>=0&&end>start);
const schoolMapHref=vm.runInNewContext(
 moduleSource.slice(start,end).replace('export function schoolMapHref','function schoolMapHref')+
 '\nschoolMapHref',
 {URLSearchParams}
);
test('offer school key links directly to internal WFS map',()=>{
 const href=schoolMapHref({escuela:'0005MS0004',distrito:'Avellaneda'});
 assert.match(href,/^\.\/mapa-escuelas-pba\.html\?/);
 const link=new URL(href,'https://alertasapd.com.ar/');
 assert.equal(link.searchParams.get('clave'),'0005MS0004');
 assert.equal(link.searchParams.get('distrito'),'Avellaneda');
});
test('mixed-case provincial key normalizes without inventing a location',()=>{
 const a=schoolMapHref({escuela:'0005mt0006',distrito:' Quilmes '});
 const link=new URL(a,'https://alertasapd.com.ar/');
 assert.equal(link.searchParams.get('clave'),'0005MT0006');
 assert.equal(link.searchParams.get('distrito'),'Quilmes');
});
test('invalid, incomplete and malicious codes never create a location link',()=>{
 for(const value of ['Escuela 6','0005MS0004<script>','0005MS0004 OR 1=1','','0005MS000']){
  assert.equal(schoolMapHref({escuela:value,distrito:'Avellaneda'}),null,value);
 }
});
test('link does not require user location nor send credentials',()=>{
 assert.doesNotMatch(moduleSource,/fetch\(|geolocation|getCurrentPosition|localStorage|sessionStorage|Authorization|user_id|Bearer/i);
 assert.match(moduleSource,/rel='noopener noreferrer'/);
 assert.match(moduleSource,/window\.APD_offerSchoolMapReady=true/);
});
test('strict WFS map matches school by exact provincial key',()=>{
 assert.match(map,/ofertaClave/);
 assert.match(map,/const found=result\.features\.map\(x=>normalizarRegistroWfs\(x,ofertaClave\)\)/);
 assert.match(map,/if\(found\.length!==1\)throw Error/);
 assert.match(map,/CQL_FILTER:"clave='"/);
});
test('map and comparator are lazy-loaded after confirmed plan in existing panel observer',()=>{
 assert.match(html,/new MutationObserver\(sync\)/);
 assert.match(html,/observer\.observe\(panel,\{childList:true,subtree:false\}\)/);
 assert.match(html,/planActual\?\.access_active===true/);
 assert.match(html,/import\('\.\/apd_offer_school_map_overlay\.mjs\?v=20261114-identity1'\)/);
 assert.match(html,/import\('\.\/apd_comparador_panel\.mjs\?v=20261113-auto1'\)/);
 assert.doesNotMatch(html,/<script[^>]+src="apd_offer_school_map_overlay\.mjs/);
});
test('core alert renderer remains untouched by the integrated overlay',()=>{
 assert.doesNotMatch(app,/APD_offerSchoolMapReady|APD_comparatorRefresh|buildSchoolMapLinks/);
 assert.match(app,/function renderAlertaActual\(\)/);
 assert.match(app,/function renderAlertasAPD\(alertas\)/);
});
test('module appends internal link only after identity was checked by the panel',()=>{
 assert.match(moduleSource,/if\(enabled!==true\)return/);
 assert.match(moduleSource,/document\.querySelector\('#panel-alertas \.alerta-main-card \.alerta-actions'\)/);
 assert.match(moduleSource,/if\(internal\)actions\.appendChild/);
 assert.match(moduleSource,/window\.APD_offerSchoolMapReset=removeLinks/);
});
test('external official link is the only fallback for schools without key',()=>{
 assert.match(moduleSource,/https:\/\/mapaescolar\.abc\.gob\.ar\/mapaescolar\//);
 assert.doesNotMatch(moduleSource,/maps\.google\.com|query=.*es|latitud|longitud/i);
});
