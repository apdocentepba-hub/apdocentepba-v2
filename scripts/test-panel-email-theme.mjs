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
  '#alerta-postulantes-meta', '.alerta-meta-item', '.alerta-section-label',
  '.apd-comparator-panel'
]) assert.ok(css.includes(selector), 'missing panel component ' + selector);

assert.equal(app.split('<h3 class="alerta-section-label">DATOS DE LA OFERTA</h3>').length - 1, 1);
for (const keep of [
  'function renderAlertaActual()', 'function renderPidMatchBlock(', 'cargarResumenPostulantes(a);',
  'id="alerta-prev"', 'id="alerta-next"', 'id="apd-comparador-panel"'
]) {
  assert.ok(app.includes(keep) || index.includes(keep), 'frontend contract missing: ' + keep);
}
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, 'CSS braces');
assert.ok(!/@import\s|url\s*\(/.test(css), 'external style dependency not allowed');
console.log('PASS: APD email palette, fonts, panel scope, dark mode, renderer and page linkage');
