import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const landing = readFileSync(new URL('../empezar.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../instagram_entry_patch.js', import.meta.url), 'utf8');

function harness({ action = 'registro', token = '', readyState = 'complete', dashboard = true, rejectDashboard = false, existingTarget = true } = {}) {
  const events = [];
  const warnings = [];
  const registered = {};
  const document = {
    readyState,
    getElementById(id) { return existingTarget && (id === 'registro' || id === 'login') ? { id } : null; },
    addEventListener(type, fn, options) { registered[type] = { fn, options }; }
  };
  const window = {
    obtenerToken() { return token; },
    mostrarSeccion(section) { events.push(['show', section]); }
  };
  if (dashboard) {
    window.cargarDashboard = () => {
      events.push(['dashboard']);
      return rejectDashboard ? Promise.reject(new Error('fetch failed')) : Promise.resolve();
    };
  }
  const location = { search: '?utm_source=instagram&utm_medium=social&apd=' + encodeURIComponent(action) };
  vm.runInNewContext(script, {
    URLSearchParams, location, document, window, Promise,
    console: { warn(...args) { warnings.push(args.map(String).join(' ')); } }
  }, { filename: 'instagram_entry_patch.js' });
  return { events, warnings, registered };
}

test('landing tiene metadatos SEO y URL canónica', () => {
  assert.match(landing, /<html lang="es-AR">/);
  assert.match(landing, /<meta name="description"/);
  assert.match(landing, /<link rel="canonical" href="https:\/\/alertasapd\.com\.ar\/empezar\.html">/);
  assert.match(landing, /<meta property="og:title"/);
});

test('al menos dos CTA a registro con parámetros UTM válidos', () => {
  const hrefs = [...landing.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'));
  const links = hrefs.filter(href => href.includes('apd=registro'));
  assert.ok(links.length >= 2, 'Faltan CTA a registro');
  for (const link of links) {
    const u = new URL(link, 'https://alertasapd.com.ar/empezar.html');
    assert.equal(u.pathname, '/');
    assert.equal(u.searchParams.get('apd'), 'registro');
    assert.equal(u.searchParams.get('utm_source'), 'instagram');
    assert.equal(u.searchParams.get('utm_medium'), 'social');
    assert.equal(u.searchParams.get('utm_campaign'), 'apd_landing');
  }
});

test('los enlaces de login desembocan en la sección esperada', () => {
  const hrefs = [...landing.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'));
  const links = hrefs.filter(href => href.includes('apd=login'));
  assert.ok(links.length >= 1);
  links.forEach(link => assert.equal(new URL(link, 'https://alertasapd.com.ar/empezar.html').searchParams.get('apd'), 'login'));
});

test('la landing contiene FAQ, privacidad y aviso de independencia', () => {
  assert.match(landing, /Preguntas frecuentes/);
  assert.match(landing, /\.\/privacidad\.html/);
  assert.match(landing, /\.\/terminos\.html/);
  assert.match(landing, /no está afiliada ni patrocinada/);
  assert.match(landing, /:focus-visible/);
  assert.match(landing, /@media\(max-width:540px\)/);
  assert.doesNotMatch(landing, /<script[^>]+src=/i);
});

test('el index productivo referencia versión nueva del parche de campañas', () => {
  assert.match(index, /<script src="instagram_entry_patch\.js\?v=2"><\/script>/);
  assert.match(index, /id="registro"/);
  assert.match(index, /id="login"/);
});

test('invitado abre registro desde Instagram', () => {
  assert.deepEqual(harness().events, [['show', 'registro']]);
});

test('invitado abre login desde Instagram', () => {
  assert.deepEqual(harness({ action: 'login' }).events, [['show', 'login']]);
});

test('usuario autenticado abre dashboard en vez de quedar inmóvil', () => {
  assert.deepEqual(harness({ token: 'token-ejemplo' }).events, [['dashboard']]);
  assert.deepEqual(harness({ action: 'login', token: 'token-ejemplo' }).events, [['dashboard']]);
});

test('usuario autenticado tiene fallback sin cargarDashboard', () => {
  assert.deepEqual(harness({ token: 'token-ejemplo', dashboard: false }).events, [['show', 'panel-docente']]);
});

test('acción no reconocida nunca abre panel ni otra pantalla', () => {
  assert.deepEqual(harness({ action: 'preferencias', token: 'token-ejemplo' }).events, []);
});

test('el acceso espera al DOMContentLoaded cuando corresponde', () => {
  const h = harness({ readyState: 'loading' });
  assert.deepEqual(h.events, []);
  assert.equal(h.registered.DOMContentLoaded.options.once, true);
  h.registered.DOMContentLoaded.fn();
  assert.deepEqual(h.events, [['show', 'registro']]);
});

test('no intenta navegar si falta la sección pública', () => {
  assert.deepEqual(harness({ existingTarget: false }).events, []);
});

test('el fallo asíncrono de dashboard se registra sin rechazo sin manejar', async () => {
  const h = harness({ token: 'token-ejemplo', rejectDashboard: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.events, [['dashboard']]);
  assert.equal(h.warnings.length, 1);
});
