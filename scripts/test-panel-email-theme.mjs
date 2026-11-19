import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression test without network or credentials. Only reads local frontend files.
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const index = read('index.html');
const css = read('apd_email_panel_theme_20261119.css');
const app = read('app_v2.js');
const stylesheet = 'apd_email_panel_theme_20261119.css?v=1';

assert.equal(index.split(stylesheet).length - 1, 1, 'theme must be loaded exactly once');
assert.ok(
  index.indexOf('public-landing-v3.css') < index.indexOf(stylesheet),
  'panel theme must come after the other stylesheets'
);
assert.ok(
  index.indexOf(stylesheet) < index.indexOf('<script src="app_v2.js'),
  'theme must load before frontend scripts'
);

// Colors and typeface verified against the real APD email, 19/11/2026 14:00.
for (const hex of [
  '#0f3460', '#1a4f8a', '#f0f2f7', '#f8fbff',
  '#f8fafc', '#d6deea', '#111827', '#6b7280',
  '#2563eb', '#163f7a', '#ecfdf5', '#fef3c7',
  '#f5f3ff', '#eefbf3', '#fff8e8', '#f6f9ff'
]) assert.ok(css.includes(hex), 'missing APD email color ' + hex);
assert.ok(css.includes('font-family:Arial,Helvetica,sans-serif'), 'email font missing');
assert.ok(css.includes('body:not(.apd-dark) #panel-docente'), 'scoping/dark guard missing');

for (const selector of [
  '.alerta-floating', '.alerta-tags', '.alerta-row', '.alerta-pid-card',
  '#alerta-postulantes-meta', '.alerta-meta-item',
  '.apd-comparator-panel'
]) assert.ok(css.includes(selector), 'missing panel component ' + selector);

assert.ok(css.includes('.alerta-feature-grid::before'), 'offer section label must be CSS-only');
assert.ok(css.includes('content:"DATOS DE LA OFERTA"'), 'email section heading absent');
assert.ok(!app.includes('class="alerta-section-label"'), 'protected renderer must not be changed');
for (const keep of [
  'function renderAlertaActual()', 'function renderPidMatchBlock(', 'cargarResumenPostulantes(a);',
  'id="alerta-prev"', 'id="alerta-next"', 'id="apd-comparador-panel"'
]) {
  assert.ok(app.includes(keep) || index.includes(keep), 'frontend contract missing: ' + keep);
}
// R2 layout contract: the 19/11 mail is compact, not the old R290 billboard.
// We test structure and ordering without embedding PII or network-dependent data.
for (const contract of [
  'Fidelity pass R2',
  'max-width:700px!important',
  'flex-direction:column!important',
  'font-size:15px!important',
  'font-size:9px!important',
  'font-size:12px!important',
  'order:1;',
  'order:2;',
  'order:3;',
  'order:4;',
  'order:5;',
  'order:6;',
  'order:7;',
  'order:8;',
  'order:9;',
  'grid-template-columns:repeat(2,minmax(0,1fr))!important',
  '.alerta-row-curso { order:1; }',
  '.alerta-row-modulos { order:2; }',
  '.alerta-row-horarios { order:3; }',
  '.alerta-row-vigencia { order:4; }',
  '.alerta-row-cierre { order:5; }',
  '.alerta-main-card > #alerta-pid-box {order:5;}',
  '.alerta-main-card > #alerta-postulantes-meta {order:6;}',
  '@media(max-width:520px)',
  '.alerta-feature-grid > .alerta-row {'
]) assert.ok(css.includes(contract), 'email layout missing ' + contract);
assert.ok(
  css.includes('body:not(.apd-dark) #panel-docente #panel-alertas .alerta-main-card'),
  'email layout must only change logged-in light-theme APD panel'
);
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, 'CSS braces');
assert.ok(!/@import\s|url\s*\(/.test(css), 'external style dependency not allowed');
console.log('PASS: APD email palette, fonts, panel scope, dark mode, renderer and page linkage');
