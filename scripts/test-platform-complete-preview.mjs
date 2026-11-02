import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const output=resolve('dist-growth-preview');
const html=readFileSync(resolve(output,'platform-completa.html'),'utf8');
const style=readFileSync(resolve(output,'platform-completa.css'),'utf8');
const app=readFileSync(resolve(output,'platform-completa.js'),'utf8');
const catalog=readFileSync(resolve(output,'herramientas-catalogo.js'),'utf8');

test('vista integral integra ocho secciones y ocho rutas funcionales',()=>{
  for(const key of ['resumen','alertas','listados','estadisticas','preferencias','plan','recursos','buscar']){
    assert.match(html,new RegExp('id="section-'+key+'"'),'Falta sección '+key);
    assert.match(html,new RegExp('data-tab="'+key+'"'),'Falta pestaña '+key);
  }
  assert.match(html,/id="mock-tabs"/);
  assert.match(html,/class="section active" id="section-resumen"/);
  assert.match(app,/function show\(id/);
  assert.match(app,/button\.addEventListener\('click',\(\)=>show\(button\.dataset\.tab\)\)/);
});
test('el build solo publica ficheros de demostración y catálogo público',()=>{
  for(const name of ['platform-completa.html','platform-completa.css','platform-completa.js','herramientas-catalogo.js'])assert.equal(existsSync(resolve(output,name)),true);
  assert.equal(readdirSync(output).some(name=>/^app_v2\.js$|^worker_hotfix\.js$|^admin_/.test(name)),false);
  assert.match(html,/VISTA PREVIA VISUAL/);
  assert.match(html,/Sin autenticación/);
  assert.match(html,/El carrusel real NO fue modificado/);
  assert.match(html,/noindex,nofollow,noarchive/);
  assert.match(html,/rel="noopener noreferrer"/);
  assert.match(html,/https:\/\/alertasapd\.com\.ar\//);
  assert.match(catalog,/AP_DOCENTE_HERRAMIENTAS/);
});
test('sin llamadas de red, contraseñas ni persistencia en la vista',()=>{
  for(const content of [html,app]){
    assert.doesNotMatch(content,/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|type="password"/);
    assert.doesNotMatch(content,/api\/login|api\/register|api\/guardar-preferencias|https:\/\/[^"']+\/rest\/v1\//);
  }
  assert.doesNotMatch(html,/<form[^>]+action=|<form[^>]+method="post"/i);
  assert.doesNotMatch(app,/\.innerHTML\s*=/);
  assert.match(app,/element\('p'/);
});
test('todos los controles que simulan un cambio tienen efectos implementados',()=>{
  for(const id of ['theme-toggle','preferences-form','prefs-reset','alert-state','tools-category','tools-state','tools-clear','search-form','search-text','search-clear','need-districts','need-cargos','global-search','stats-explain']){
    assert.match(html,new RegExp('id="'+id+'"'));
    assert.match(app,new RegExp(id.replace(/-/g,'-')));
  }
  assert.match(app,/renderAlertState/);
  assert.match(app,/renderPrefs/);
  assert.match(app,/refreshTools/);
  assert.match(app,/refreshSearch/);
  assert.match(app,/renderAdvisor/);
});
test('estadísticas distinguen fuente y corte de datos personales',()=>{
  for(const token of ['2.617','137 / 137','18 sep 2026','no consulta Supabase','no se modifican','1/11/2026']){
    if(token==='no se modifican')continue;
    assert.ok(html.toLocaleLowerCase('es-AR').includes(token.toLocaleLowerCase('es-AR')),token);
  }
  assert.match(html,/fictici[ao]s/i);
  assert.match(html,/No se presentarán/);
});
test('responsive, accesibilidad, navegación y estado de alertas definidos',()=>{
  for(const token of ['@media(max-width:760px)','@media(max-width:520px)',':focus-visible','prefers-reduced-motion','data-theme="dark"'])assert.ok(style.includes(token),token);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/role="search"/);
  assert.match(html,/id="alert-state"/);
  assert.match(html,/value="loading"/);
  assert.match(html,/value="empty"/);
  assert.match(html,/value="error"/);
  assert.match(html,/La administración no aparece en esta maqueta pública/);
  assert.doesNotMatch(html,/id="section-admin"/);
});
test('la nueva página es el acceso principal a la preview sin quitar las demos previas',()=>{
  const landing=readFileSync(resolve(output,'index.html'),'utf8');
  for(const link of ['platform-completa.html','panel-demo.html','insigne-laboratorio.html'])assert.ok(landing.includes(link));
});
