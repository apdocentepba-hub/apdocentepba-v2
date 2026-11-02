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
  assert.deepEqual(readdirSync(out).sort(), ['_headers', 'growth_activation_guide.js', 'herramientas-catalogo.js', 'index.html', 'insigne-laboratorio.html', 'insigne_rules_lab.js', 'panel-demo.html', 'platform-completa.css', 'platform-completa.html', 'platform-completa.js', 'platform-visual.html', 'platform_refresh_v1.css', 'robots.txt'].sort());
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

test('la demo informa canales independientes de activar alertas', () => {
  const html = readFileSync(path.join(out, 'panel-demo.html'), 'utf8');
  assert.match(html, /id="pref-alertas-email"/);
  assert.match(html, /id="pref-alertas-activas"/);
  assert.match(html, /email sigue desactivado/);
  assert.match(html, /No se enviaron avisos/);
});

test('la demo ofrece listas de ejemplo y no ejecuta HTML del docente', () => {
  const html = readFileSync(path.join(out, 'panel-demo.html'), 'utf8');
  assert.match(html, /<datalist id="apd-preview-distritos"/);
  assert.match(html, /<datalist id="apd-preview-cargos"/);
  assert.match(html, /<option value="AVELLANEDA"/);
  assert.match(html, /<option value="PRECEPTOR"/);
  assert.match(html, /document\.createTextNode\(' ' \+ text\)/);
  assert.doesNotMatch(html, /lines\[0\]\.innerHTML|lines\[1\]\.innerHTML/);
});

test('niveles y turnos opcionales respetan opciones del panel real sin escribir datos', () => {
  const html = readFileSync(path.join(out, 'panel-demo.html'), 'utf8');
  assert.match(html, /id="pref-turnos"/);
  assert.match(html, /name="pref-nivel-modalidad"/);
  assert.match(html, /value="SECUNDARIO"/);
  assert.match(html, /value="TECNICO PROFESIONAL"/);
  assert.match(html, /option value="T">Tarde/);
  assert.match(html, /values\.levels\.join\(', '\)/);
  assert.match(html, /values\.turn \|\| '\(cualquiera\)'/);
});

test('Insigne LAB aparece sólo como experimento aislado en la preview',()=>{
  const landing=readFileSync(path.join(out,'index.html'),'utf8');
  const lab=readFileSync(path.join(out,'insigne-laboratorio.html'),'utf8');
  const engine=readFileSync(path.join(out,'insigne_rules_lab.js'),'utf8');
  assert.match(landing,/insigne-laboratorio\.html/);
  assert.match(lab,/Propuesta NO habilitada/);
  assert.match(lab,/No almacena información ni envía alertas/);
  assert.match(lab,/id="lab-district"/);
  assert.match(lab,/id="lab-cargo"/);
  assert.match(lab,/id="lab-mode"/);
  assert.match(lab,/insigne_rules_lab\.js/);
  assert.doesNotMatch(lab,/api\/guardar-preferencias|api\/login|type="password"|supabase\.co/);
  for (const text of [lab,engine]) {
    assert.doesNotMatch(text,/fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|localStorage|sessionStorage/);
  }
});

test('la propuesta de navegación es estática, accesible y sin sesiones reales',()=>{
  const html=readFileSync(path.join(out,'platform-visual.html'),'utf8');
  assert.match(html,/VISTA PREVIA VISUAL/);
  assert.match(html,/Cuenta y ofertas ficticias; cifras provinciales de un corte auditado/i);
  assert.match(html,/carrusel real NO fue modificado/i);
  for(const section of ['resumen','alertas','listados','recursos','plan','estadisticas','preferencias']){
    assert.match(html,new RegExp('id="section-'+section+'"'));
  }
  assert.doesNotMatch(html,/type="password"|\/api\/login|\/api\/register|localStorage|sessionStorage|fetch\s*\(|sendBeacon|XMLHttpRequest/);
  assert.match(html,/platform_refresh_v1\.css/);
});

test('la propuesta identifica fuente y fecha del corte, sin aparentar estadística en vivo',()=>{
  const html=readFileSync(path.join(out,'platform-visual.html'),'utf8');
  assert.match(html,/2\.617/);
  assert.match(html,/137 \/ 137/);
  assert.match(html,/18 sep 2026/);
  assert.match(html,/no consulta Supabase ni actualiza estos números en vivo/);
  assert.doesNotMatch(html,/\/api\/estadisticas/);
});
