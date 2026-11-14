import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app_v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../apd_comparador_panel.css',import.meta.url),'utf8');
const start=source.indexOf('function renderAlertaActual()');
const end=source.indexOf('\nfunction fmtNum(',start);
assert.ok(start>=0&&end>start,'Actual app renderer found');
const renderer=source.slice(start,end);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
export function renderOffer(input){
 const badge={textContent:'',classList:{remove(){},add(){}}};
 const box={
  innerHTML:'',querySelector(){return null;},querySelectorAll(){return [];}
 };
 const offer={
  escuela:'0045MS0033',distrito:'GENERAL SAN MARTÍN',
  turno:'Mañana',nivel_modalidad:'Secundaria',revista:'Suplencia',
  descripcioncargo:'MATEMÁTICA - CICLO SUPERIOR (MCS)',
  cursodivision:'5°1°',hsmodulos:'3',
  dias_horarios:'Miércoles: 12:00 a 13:00; Viernes: 7:30 a 9:30',
  supl_desde_label:'12/11/2026',supl_hasta_label:'28/12/2026',
  finoferta_label:'16/11/2026, 07:30',...input
 };
 const helpers={
  document:{getElementById(id){return id==='panel-alertas'?box:
   id==='alertas-badge'?badge:null}},
  alertasState:{items:[offer],index:0},planActual:{access_active:true},
  tituloAlerta:o=>o.descripcioncargo,
  turnoTexto:o=>o,
  esc,normalizarCursoDivision:o=>String(o||'-'),
  fmtFechaABC:()=>'',buildPostulantesUrl:()=>null,
  renderProgress:()=>'',renderDots:()=>'',renderWindowPreview:()=>'', 
  renderPidMatchBlock:()=>'',cargarResumenPostulantes:()=>{}
 };
 vm.runInNewContext(renderer+'\nrenderAlertaActual()',helpers);
 return box.innerHTML;
}
test('Suplencia: school and district dominate, hours and modules retain actual values',()=>{
 const html=renderOffer();
 assert.match(html,/alerta-revista-suplencia/);
 assert.match(html,/Escuela · Clave ABC/);
 assert.match(html,/0045MS0033/);
 assert.match(html,/GENERAL SAN MARTÍN/);
 assert.match(html,/Turno · Mañana/);
 assert.match(html,/alerta-row-horarios/);
 assert.match(html,/Miércoles: 12:00 a 13:00/);
 assert.match(html,/Viernes: 7:30 a 9:30/);
 assert.match(html,/alerta-row-vigencia/);
 assert.match(html,/12\/11\/2026.*28\/12\/2026/);
 assert.match(html,/alerta-row-curso/);
 assert.match(html,/5°1°/);
 assert.match(html,/alerta-row-modulos/);
 assert.match(html,/>3<\/span>/);
 assert.match(html,/alerta-row-cierre/);
 assert.match(html,/16\/11\/2026, 07:30/);
});
test('Provisionalidad has a distinct appointment-type class; no inference by cargo',()=>{
 assert.match(renderOffer({revista:'Provisionalidad'}),/alerta-revista-provisional/);
 assert.match(renderOffer({revista:'PROVISIONAL'}),/alerta-revista-provisional/);
 assert.match(renderOffer({revista:'Titular'}),/alerta-revista-titular/);
 assert.match(renderOffer({revista:'',descripcioncargo:'Suplencia en Matemática'}),/alerta-revista-otra/);
});
test('No invented school names or localities; real supplied name is highlighted',()=>{
 let html=renderOffer();
 assert.doesNotMatch(html,/Escuela General San Martín/);
 assert.doesNotMatch(html,/Localidad: General San Martín/);
 html=renderOffer({nombreestablecimiento:'ESCUELA SECUNDARIA 33',localidad:'Villa Ballester'});
 assert.match(html,/ESCUELA SECUNDARIA 33/);
 assert.match(html,/Clave: 0045MS0033/);
 assert.match(html,/Localidad: Villa Ballester/);
});
test('All feed text escaped; no hidden sensitive content or network dependency',()=>{
 const html=renderOffer({nombre_escuela:'<img src=x onerror=alert(1)>',
  distrito:'"><svg onload=alert(1)>',dias_horarios:'<script>alert(1)</script>'});
 assert.doesNotMatch(html,/<img src=x|<svg onload|<script>alert/);
 assert.match(html,/&lt;img/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(renderer,/\bfetch\s*\(|XMLHttpRequest|navigator\.geolocation/);
});
test('Compact card width, readable key fields and two accessible appointment colours',()=>{
 assert.match(css,/#panel-alertas \.alerta-carousel-shell\s*\{[^}]*max-width:760px/);
 assert.match(css,/#panel-alertas \.alerta-main-card\s*\{[^}]*max-width:760px/);
 assert.match(css,/\.alerta-main-card\.alerta-revista-suplencia/);
 assert.match(css,/\.alerta-main-card\.alerta-revista-provisional/);
 assert.match(css,/\.alerta-row-horarios/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/body\.apd-dark #panel-alertas/);
});
