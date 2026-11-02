import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const load=path=>readFileSync(path,'utf8');
const catalogSrc=load('assets/js/herramientas-catalogo.js');
const ctx={window:{}};vm.runInNewContext(catalogSrc,ctx);
const catalog=ctx.window.AP_DOCENTE_HERRAMIENTAS;
const search=load('assets/js/herramientas-buscador-v2.js');
const official=load('centro-abc-servado.html');
test('nuevo centro ABC aparece en catálogo público y ruta existe',()=>{
 assert.ok(Array.isArray(catalog));
 assert.ok(catalog.length>=35);
 const c=catalog.find(x=>x.id==='centro-abc-servado');
 assert.ok(c&&c.estado==='Activo');
 assert.equal(c.url,'./centro-abc-servado.html');
 assert.equal(existsSync('centro-abc-servado.html'),true);
});
test('todo el catálogo resuelve rutas locales sin enlaces extraños',()=>{
 for(const resource of catalog){
   assert.match(resource.url,/^\.\/[a-z0-9_-]+\.html(?:\?v=\d+)?$/i,resource.id);
   assert.equal(existsSync(resource.url.replace(/\?.*$/,'').slice(2)),true,resource.id);
 }
});
test('centro ABC vincula exclusivamente portales institucionales verificados',()=>{
 for(const url of [
 'https://servado.abc.gob.ar/notificaciones',
 'https://servado.abc.gob.ar/calendario-inscripciones',
 'https://servado.abc.gob.ar/pid',
 'https://servado.abc.gob.ar/pad',
 'https://servado.abc.gob.ar/lof',
 'https://servado.abc.gob.ar/cyd',
 'https://servado.abc.gob.ar/cya',
 'https://misservicios.abc.gob.ar/actos.publicos.digitales/',
 'https://srv4.abc.gob.ar/?i=AGENTES',
 'https://mapaescolar.abc.gob.ar/'
 ])assert.ok(official.includes(url),url);
 assert.match(official,/Verificada el 1\/11\/2026/);
 assert.match(official,/no.*monitor en tiempo real/i);
 assert.match(official,/no ingresa a tu cuenta ABC/);
 assert.doesNotMatch(official,/type="password"|fetch\s*\(|XMLHttpRequest|localStorage/);
 const anchors=[...official.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].map(x=>x[0]);
 assert.ok(anchors.length>=12);
 for(const a of anchors)assert.match(a,/rel="noopener noreferrer"/);
});
test('buscador exige todos los términos y prioriza título; nunca inyecta catálogo como HTML',()=>{
 assert.match(search,/words\.every\(w=>hay\.includes\(w\)\)/);
 assert.match(search,/title\.includes\(w\)\?4/);
 assert.match(search,/textContent/);
 assert.match(search,/replaceChildren/);
 assert.doesNotMatch(search,/\.innerHTML\s*=/);
 assert.match(search,/URLSearchParams/);
});
test('buscador y herramientas usan un único motor con anuncios accesibles',()=>{
 const one=load('buscar-herramientas.html');
 const two=load('herramientas.html');
 for(const s of [one,two]){
  assert.match(s,/herramientas-buscador-v2\.js/);
  assert.match(s,/role="search"/);
  assert.match(s,/for="q"/);
  assert.doesNotMatch(s,/<script>const q=/);
 }
 assert.match(one,/aria-live="polite"/);
});
test('la portada prioriza el centro ABC en vez de futuras funciones sin terminar',()=>{
 const home=load('index.html');
 const sources=load('fuentes-oficiales.html');
 assert.match(home,/centro-abc-servado\.html/);
 assert.match(sources,/Revisión de accesos públicos ABC:<\/b> 01\/11\/2026/);
 assert.match(sources,/https:\/\/srv4\.abc\.gob\.ar\//);
 assert.doesNotMatch(sources,/13\/06\/2026/);
});
test('el roadmap no promete como futura una función que ya tiene herramienta',()=>{
 const html=load('proximamente.html');
 for(const target of ['validador-actas.html','asistente-comunicado-familias.html','centro-abc-servado.html'])assert.ok(html.includes(target));
 assert.match(html,/En estudio o pendientes de validación/);
 assert.match(html,/Todavía no se envían avisos/);
});
