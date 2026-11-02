import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync('apd_ui_v21.js','utf8');
const css=readFileSync('apd_ui_v21.css','utf8');
const html=readFileSync('index.html','utf8');
const tabs=readFileSync('panel_tabs_patch.js','utf8');
const core=readFileSync('app_v2.js','utf8');
const worker=readFileSync('worker-live/worker_hotfix.js','utf8');
test('se activa exclusivamente sobre panel existente y no sustituye el motor',()=>{
 assert.match(html,/apd_ui_v21\.css\?v=20261101/);
 assert.match(html,/apd_ui_v21\.js\?v=20261101/);
 assert.match(ui,/const p=\$\('panel-docente'\)/);
 assert.match(ui,/function attachTabs\(/);
 assert.match(ui,/APD_activatePanelTab/);
 assert.match(ui,/MutationObserver\(schedule\)/);
 assert.match(css,/body\.apd-ui-v21-live/);
 assert.doesNotMatch(css,/(?:^|\})\s*\.alerta-[\w-]+\s*\{/m);
 assert.doesNotMatch(css,/(?:^|\})\s*#panel-alertas\s*\{/m);
 assert.match(core,/function renderAlertasAPD\(/);
 assert.match(worker,/\/api\/mis-alertas/);
});
test('login y registro no muestran navegación privada',()=>{
 assert.match(ui,/panelVisible\(\)/);
 assert.match(ui,/sidebar\.hidden=true/);
 assert.match(css,/body:not\(\.apd-ui-v21-live\) \.apd-v21-sidebar\{display:none!important\}/);
 assert.match(css,/\.apd-v21-sidebar\[hidden\]/);
 assert.match(ui,/checkedToken='';adminNonce\+\+/);
});
test('administración nunca aparece sin afirmación explícita del backend',()=>{
 assert.match(tabs,/t\[0\]==='admin' \? window\.APD_adminAccessConfirmed===true/);
 assert.match(ui,/adminApiGet\('\/api\/admin\/me'\)/);
 assert.match(ui,/res\?\.user\?\.es_admin===true/);
 assert.match(css,/\.apd-top-tab\[data-top-tab-key="admin"\]\{display:none!important\}/);
 assert.match(ui,/nonce!==adminNonce/);
 assert.doesNotMatch(ui,/\/api\/admin\/usuarios|\/api\/admin\/pagos/);
});
test('ayuda y checklist orientan sin leer datos privados ni guardar preferencias',()=>{
 for(const id of ['email','offers','slow','plan','history'])assert.match(ui,new RegExp('(?:^|\\n) '+id+':\\{'));
 assert.match(ui,/Comprobá tu configuración antes de esperar avisos/);
 assert.match(ui,/0 de 3 pasos marcados/);
 assert.match(ui,/no verifica el Worker ni envía notificaciones/);
 assert.match(ui,/https:\/\/misservicios\.abc\.gob\.ar\/actos\.publicos\.digitales\//);
 for(const forbidden of ['localStorage.setItem(','sessionStorage.setItem(','/api/guardar-preferencias','/api/sync-offers','fetch(','XMLHttpRequest','WebSocket'])
  assert.ok(!ui.includes(forbidden),forbidden);
});
test('sin falsa estadística, cambios de plan ni instrucciones que afecten al carrusel',()=>{
 assert.ok(tabs.includes('<em class="apd-monitor-badge">APD</em>'));
 assert.ok(tabs.includes('<em class="apd-monitor-badge">PID</em>'));
 assert.ok(!tabs.includes('>12</em>')&&!tabs.includes('>8</em>'));
 assert.ok(!ui.includes('renderAlertasAPD(')&&!ui.includes('planActual='));
 assert.ok(!ui.includes('cargarPrefsEnFormulario('));
 assert.match(ui,/Las mejoras de carga progresiva están en validación/);
});
