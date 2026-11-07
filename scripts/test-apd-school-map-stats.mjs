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
 assert.match(body,/Buscar escuela en el mapa/);
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
