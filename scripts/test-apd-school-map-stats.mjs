import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app_v2.js',import.meta.url),'utf8');
const start=source.indexOf('function buildSchoolMapLinks(alerta) {');
const end=source.indexOf('\nfunction renderAlertaActual()',start);
assert.ok(start>0&&end>start,'map function must precede offer renderer');
const build=vm.runInNewContext(source.slice(start,end)+'\nbuildSchoolMapLinks');

test('school offer provides both a map search and official map link',()=>{
 const a=build({escuela:'E.E.S.T. N° 6',distrito:'Avellaneda'});
 assert.match(a.googleMaps,/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
 assert.equal(a.exact,false);
 assert.match(decodeURIComponent(a.googleMaps),/E\.E\.S\.T\. N° 6, Avellaneda/);
 assert.equal(a.official,'https://mapaescolar.abc.gob.ar/mapaescolar/');
});
test('never invent a map search from an unknown district or school',()=>{
 assert.equal(build({escuela:'Escuela técnica'}),null);
 assert.equal(build({distrito:'Avellaneda'}),null);
 assert.equal(build({escuela:'x',distrito:'Avellaneda'}),null);
});
test('uses exact GPS only when explicit source verification exists',()=>{
 const item={escuela:'EEST 6',distrito:'Avellaneda',latitud:-34.6871,longitud:-58.3361};
 const plain=build(item);
 assert.equal(plain.exact,false);
 const verified=build({...item,coordinates_verified:true,geo_source:'mapa_escolar_abc'});
 assert.equal(verified.exact,true);
 assert.match(decodeURIComponent(verified.googleMaps),/-34\.687100,-58\.336100/);
});
test('untrusted or out-of-range coordinates cannot become exact pins',()=>{
 const base={escuela:'Escuela 1',distrito:'Quilmes',coordinates_verified:true};
 for(const item of [
  {...base,geo_source:'unknown',latitud:-34.8,longitud:-58.2},
  {...base,geo_source:'mapa_escolar_abc',latitud:0,longitud:0},
  {...base,geo_source:'mapa_escolar_abc',latitud:-200,longitud:-58},
  {...base,geo_source:'mapa_escolar_abc',latitud:'oops',longitud:-58},
 ]){
  assert.equal(build(item).exact,false);
 }
});
test('special characters in school names are URL encoded, not executable code',()=>{
 const p=build({escuela:'Técnica 6 & "<script>"',distrito:'Quilmes'});
 assert.ok(!p.googleMaps.includes('<script>'));
 assert.ok(!p.googleMaps.includes('"<'));
 assert.equal(p.exact,false);
});
test('offer renderer includes accessible external map links',()=>{
 const body=source.slice(source.indexOf('function renderAlertaActual()'),source.indexOf('\nfunction ',source.indexOf('function renderAlertaActual()')+5));
 assert.match(body,/const schoolMap = buildSchoolMapLinks\(a\)/);
 assert.match(body,/Ver escuela en mapa/);
 assert.match(body,/Mapa Escolar ABC/);
 assert.match(body,/target="_blank" rel="noopener noreferrer"/);
});
test('historical stats do not mislabel estimated or stale statuses as official realtime',()=>{
 assert.doesNotMatch(source,/<span class="historico-stat-l">Activas ahora<\/span>/);
 assert.match(source,/Activas estimadas en captura/);
 assert.match(source,/Cambios entre capturas/);
 assert.match(source,/no certifican vacantes vigentes ni adjudicaciones oficiales/);
});
test('existing official ABC postulantes link is retained',()=>{
 assert.match(source,/Abrir postulantes en ABC/);
 assert.match(source,/const abcUrl = buildPostulantesUrl\(a\)/);
});

test('historical freshness requires timezone, rejects stale and future captures',()=>{
 const a=source.indexOf('function historicoCapturaEsReciente(');
 const b=source.indexOf('\nfunction renderHistoricoAPD(',a);
 assert.ok(a>0&&b>a);
 const fn=vm.runInNewContext(source.slice(a,b)+';historicoCapturaEsReciente');
 const now=Date.parse('2026-11-07T20:00:00Z');
 assert.equal(fn('2026-11-07T19:00:00Z',now),true);
 assert.equal(fn('2026-11-05T21:00:00Z',now),true);
 assert.equal(fn('2026-11-05T19:59:00Z',now),false);
 assert.equal(fn('2026-11-07T20:06:00Z',now),false);
 assert.equal(fn('2026-11-07T19:00:00',now),false);
 assert.equal(fn('07/11/2026 19:00',now),false);
 assert.equal(fn('',now),false);
});
test('stale historical values cannot appear as current counts',()=>{
 const body=source.slice(source.indexOf('function renderHistoricoAPD('),
   source.indexOf('\nasync function cargarHistoricoPanel(',source.indexOf('function renderHistoricoAPD(')));
 assert.match(body,/historicoCapturaEsReciente\(data\.ultima_captura\)/);
 assert.match(body,/recienteNumero\(data\.activas_estimadas\)/);
 assert.match(body,/recienteNumero\(data\.nuevas_7d\)/);
 assert.match(body,/recienteNumero\(data\.cambios_estado_recientes\)/);
 assert.match(body,/Histórico desactualizado/);
 assert.match(body,/historicoReciente && data\.cierran_72h/);
});

test('APD-owned map accepts school and district deep-links safely',()=>{
 const html=fs.readFileSync(new URL('../mapa-escuelas-pba.html',import.meta.url),'utf8');
 const inline=html.match(/<script>([\s\S]*?)<\/script>/i);
 assert.ok(inline?.[1],'inline map script exists');
 assert.doesNotThrow(()=>new Function(inline[1]),'map script must parse');
 assert.match(html,/new URLSearchParams\(window\.location\.search\)/);
 assert.match(html,/ofertaEscuela/);
 assert.match(html,/ofertaDistrito/);
 assert.match(html,/if\(ofertaEscuela\)\$\('q'\)\.value=ofertaEscuela/);
 assert.match(html,/matchingDistrict=ds\.find/);
 assert.match(source,/apdMap: "\.\/mapa-escuelas-pba\.html\?escuela="/);
});
test('external school names are escaped before entering map HTML',()=>{
 const html=fs.readFileSync(new URL('../mapa-escuelas-pba.html',import.meta.url),'utf8');
 assert.match(html,/const escaparHtml=v=>/);
 assert.match(html,/escaparHtml\(x\.nombre/);
 assert.doesNotMatch(html,/ds\.map\(x=>`<option>\$\{x\}<\/option>`\)/);
});

test('real ABC provincial school keys open an exact-key search, never an invented Google location',()=>{
 const row=build({escuela:'0005MS0004',distrito:'AVELLANEDA'});
 assert.equal(row.clave,'0005MS0004');
 assert.equal(row.googleMaps,null);
 assert.equal(row.exact,false);
 assert.match(row.apdMap,/mapa-escuelas-pba\.html\?clave=0005MS0004&distrito=AVELLANEDA/);
 const name=build({escuela:'Escuela Secundaria N° 4',distrito:'AVELLANEDA'});
 assert.equal(name.clave,'');
 assert.match(name.apdMap,/\?escuela=/);
 assert.ok(name.googleMaps);
});
test('school code cannot turn into an arbitrary or ambiguous geocoded marker',()=>{
 for(const x of ['0005MS0004<script>','999MS0004','0005MS000','0005MS00044']){
  const v=build({escuela:x,distrito:'Avellaneda'});
  assert.ok(!v || !v.clave);
 }
 const v=build({escuela:'0005MS0004',distrito:'Avellaneda',latitud:-34.7,longitud:-58.3});
 assert.equal(v.googleMaps,null);
});
test('the map only compares exact provincial keys, not fuzzy names or nearby keys',()=>{
 const html=fs.readFileSync(new URL('../mapa-escuelas-pba.html',import.meta.url),'utf8');
 const start=html.indexOf('function filtrar(){');
 const end=html.indexOf('function render(){',start);
 assert.ok(start>0&&end>start);
 const snippet=html.slice(start,end);
 const inputs={q:{value:'0005MS0004'},distrito:{value:''},nivel:{value:''}};
 const fn=vm.runInNewContext(`
 let datos=[
  {nombre:'Escuela Secundaria 4',clave:'0005MS0004',dist:'AVELLANEDA'},
  {nombre:'Escuela Secundaria 40',clave:'0005MS0040',dist:'AVELLANEDA'},
  {nombre:'Escuela Secundaria 4',clave:'0005MS0004',dist:'QUILMES'}
 ];
 let visibles=[];const ofertaClave='0005MS0004';
 const norm=v=>String(v||'').trim().toLowerCase();
 const inputs=${JSON.stringify(inputs)};
 const $=id=>inputs[id];
 const render=()=>{};
 ${snippet}
 filtrar();
 visibles;`);
 assert.equal(fn.length,2);
 assert.ok(fn.every(row=>row.clave==='0005MS0004'));
 assert.ok(fn.some(row=>row.dist==='AVELLANEDA'));
});
test('map refuses code search on OSM fallback without a verified provincial key',()=>{
 const html=fs.readFileSync(new URL('../mapa-escuelas-pba.html',import.meta.url),'utf8');
 assert.match(html,/const ofertaClave=\/\^\[0-9\]\{4\}\[A-Z\]\{2\}\[0-9\]\{4\}\$\//);
 assert.match(html,/if\(ofertaClave&&code!==ofertaClave\)return false/);
 assert.match(html,/ofertaClave\?false:await cargarZIPs\(errores\)\|\|await cargarOSM\(errores\)/);
 assert.match(html,/No encontramos la clave provincial/);
 assert.match(html,/Abrir Mapa Escolar ABC para verificar/);
 assert.match(html,/clave:String\(pick\(r,/);
});
