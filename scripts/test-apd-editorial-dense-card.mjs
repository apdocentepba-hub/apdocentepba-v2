import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('app_v2.js','utf8');
const css=readFileSync('apd_comparador_panel.css','utf8');
const school=readFileSync('scripts/apd-official-school-identity.mjs','utf8');
const start=app.indexOf('function renderPidMatchBlock(');
const end=app.indexOf('\nfunction renderAlertaActual()',start);
assert.ok(start>=0&&end>start);
const markup=app.slice(start,end);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
function renderPid(a={},status={tone:'warn',title:'NO COMPATIBLE CON TU PID',
 text:'No tenés ese ítem en tu PID'}){
 const environment={
  buildPidChanceInfo:()=>status,parsePidNumber:()=>0,
  formatPuntaje:n=>Number(n).toFixed(2),
  alertaRow:(k,v)=>'<div class="alerta-row">'+esc(k)+': '+esc(v)+'</div>',esc
 };
 const render=vm.runInNewContext(markup+'\nrenderPidMatchBlock',environment);
 return render(a,null);
}
test('PID status and brief are always visible; full nine-field breakdown is initially collapsed',()=>{
 const html=renderPid();
 assert.match(html,/alerta-pid-status/);
 assert.match(html,/NO COMPATIBLE CON TU PID/);
 assert.match(html,/No tenés ese ítem en tu PID/);
 assert.match(html,/<details class="alerta-pid-disclosure">/);
 assert.doesNotMatch(html,/<details[^>]+open/);
 assert.match(html,/<summary>Ver desglose PID/);
 for(const field of ['Motivo','Área PID','Bloque PID','Puntaje base',
  'Bonus residencia','Distrito residencia','Tu puntaje total',
  'Listado PID','Año PID'])assert.ok(html.includes(field),field);
});
test('PID dynamic status never becomes executable HTML',()=>{
 const html=renderPid({pid_reason:'<img src=x onerror=alert(1)>'},{
  tone:'info',title:'<script>alert(1)</script>',
  text:'<svg onload=alert(1)>'});
 assert.doesNotMatch(html,/<script>|<svg onload|<img src/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;svg/);
 assert.match(html,/&lt;img/);
});
test('Code-first school layout preserves accessible public name and address',()=>{
 assert.match(app,/alerta-location-value alerta-school-key/);
 assert.match(app,/apd-official-school-name/);
 assert.match(school,/value\.textContent=key/);
 assert.match(school,/nameLine\.textContent=presentation\.name/);
 assert.match(school,/addressLine\.textContent='Dirección registrada: '/);
 assert.doesNotMatch(school,/innerHTML/);
});
test('Four-column desktop metadata and two-column phone layout avoid the final-row billboard',()=>{
 assert.match(css,/APD design study 2026-11-14/);
 assert.match(css,/max-width:720px/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/alerta-row-modulos/);
 assert.match(css,/alerta-pid-disclosure summary:focus-visible/);
 assert.match(css,/#alerta-postulantes-meta \.alerta-meta-grid/);
});
