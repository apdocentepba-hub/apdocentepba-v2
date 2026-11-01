import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-growth-preview');

test('la construcción de la demo funciona sin bibliotecas externas', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/build-growth-preview.mjs')], { cwd: root, timeout: 10000 });
  assert.deepEqual(readdirSync(out).sort(), ['_headers', 'growth_activation_guide.js', 'index.html', 'panel-demo.html', 'robots.txt'].sort());
});

test('la landing no muestra botones de registro/login que usen backend real', () => {
  const html = readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(html, /VISTA PREVIA/);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /href="\.\/panel-demo.html"/);
  assert.doesNotMatch(html, /href="\.\/\?utm_source/);
  assert.doesNotMatch(html, /<script src=/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test('el panel de demostración no contiene autenticación, claves ni Worker', () => {
  const html = readFileSync(path.join(out, 'panel-demo.html'), 'utf8');
  assert.match(html, /Datos ficticios/);
  assert.match(html, /id="panel-preferencias-resumen"/);
  assert.match(html, /id="form-preferencias"/);
  assert.doesNotMatch(html, /app_v2\.js|worker_hotfix|api\/login|api\/register|type="password"|supabase\.co/);
  assert.doesNotMatch(html, /(?:\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|localStorage|sessionStorage)/);
  assert.doesNotMatch(html, /action=|method="post"/i);
});

test('Robots y metadatos previenen indexación accidental', () => {
  assert.match(readFileSync(path.join(out, 'robots.txt'), 'utf8'), /Disallow: \/$/m);
  assert.match(readFileSync(path.join(out, '_headers'), 'utf8'), /X-Robots-Tag: noindex, nofollow/);
});
