/**
 * Construye una demo pública de crecimiento sin credenciales ni backend.
 * No copiar index.html ni scripts de autenticación a Render.
 * Uso: node scripts/build-growth-preview.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-growth-preview');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const landing = readFileSync(path.join(root, 'empezar.html'), 'utf8');
assert.match(landing, /<h1/);
assert.match(landing, /<\/body>/i);

const banner = `<div class="apd-preview-ribbon" role="status" style="position:sticky;top:0;z-index:9999;background:#ffedb7;color:#402a02;padding:13px 20px;font:700 14px system-ui;text-align:center;border-bottom:2px solid #d29d30">
  VISTA PREVIA · Diseño de prueba sin conexión a cuentas ni envíos.
  <a href="./panel-demo.html" style="color:#402a02;margin-left:12px">Probar panel simulado</a>
  <a href="https://alertasapd.com.ar/" style="color:#402a02;margin-left:12px">Sitio real</a>
</div>`;
let html = landing
  .replace(/<link rel="canonical"[^>]+>\s*/i, '')
  .replace(/<meta property="og:url"[^>]+>\s*/i, '')
  .replace(/<head>/i, '<head>\n<meta name="robots" content="noindex,nofollow,noarchive">\n<meta name="referrer" content="strict-origin-when-cross-origin">')
  .replace(/<body>/i, '<body>\n' + banner)
  .replace(/href="\.\/\?utm_source=instagram&amp;utm_medium=social&amp;utm_campaign=apd_landing(?:&amp;utm_content=[^"&]+)?&amp;apd=(?:registro|login)"/g, 'href="./panel-demo.html"')
  .replace(/href="\.\/(como-funciona|herramientas|privacidad|terminos)\.html"/g, 'href="https://alertasapd.com.ar/$1.html" rel="noopener noreferrer"');
assert.doesNotMatch(html, /href="\.\/\?utm_source=/);
assert.match(html, /noindex,nofollow/);
writeFileSync(path.join(out, 'index.html'), html, 'utf8');

const panel = `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Demo de activación · APDocentePBA</title>
<style>
:root{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#193a50;background:#f2f8fa}
*{box-sizing:border-box}body{margin:0}.preview-head{background:#092b41;color:#fff;padding:20px 16px}
.shell{max-width:1020px;margin:auto}.preview-head a{color:#c5ffe2}
.preview-banner{background:#ffedb7;color:#402a02;padding:12px 16px;font-size:14px;font-weight:750}
nav{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}
nav button,.demo-actions button{border:1px solid #bdd6dd;background:white;border-radius:10px;padding:12px 16px;color:#143a52;cursor:pointer;font:700 14px system-ui}
nav button[aria-selected=true]{background:#143f55;color:#fff}
main{padding:0 16px 50px}.panel-header{padding-top:18px}.panel-header h2{margin:0}
.panel-tab-pane{display:none}.panel-tab-pane.active{display:block}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.panel-card{background:white;border:1px solid #d8e6ec;border-radius:16px;padding:20px;box-shadow:0 7px 20px #1233}
.panel-card h3{margin:0 0 10px}.panel-card p{font-size:14px;line-height:1.5;margin:8px 0}
.field{display:flex;flex-direction:column;gap:6px;margin:12px 0}.field input,.field select{font:inherit;padding:12px;border:1px solid #c2d7dc;border-radius:8px;max-width:460px}
.notice{font-size:12px;color:#5c7481;margin-top:8px}
.demo-actions{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 18px}
@media(max-width:660px){.cards{grid-template-columns:1fr}nav button{flex:1}}
</style></head>
<body><div class="preview-banner" role="status">VISTA PREVIA · Datos ficticios · No ingreses contraseñas ni datos personales</div>
<header class="preview-head"><div class="shell"><strong>🔔 APDocentePBA · DEMO DEL PANEL</strong>
<p>Recorré el nuevo proceso de activación sin iniciar sesión.</p>
<a href="./">← Volver a la landing de prueba</a></div></header>
<main id="panel-docente"><div class="container shell">
<div class="panel-header"><h2 id="panel-bienvenida">Hola, Docente (ejemplo)</h2><p>Esta pantalla es una simulación: no consulta datos reales.</p></div>
<nav aria-label="Secciones del panel"><button data-tab="inicio" aria-selected="true">Mi panel</button><button data-tab="preferencias" aria-selected="false">Preferencias</button></nav>
<div id="panel-tab-pane-inicio" class="panel-tab-pane active">
<div class="cards"><section class="panel-card"><h3>⚙️ Mis preferencias</h3>
<div id="panel-preferencias-resumen"><p><strong>Distritos:</strong> (sin filtro)</p><p><strong>Cargos/Materias:</strong> (sin filtro)</p><p><strong>Nivel:</strong> (cualquiera)</p><p><strong>Turno:</strong> (cualquiera)</p><p><strong>Alertas:</strong> Pausadas</p><p><strong>Email:</strong> No</p></div>
</section><section class="panel-card"><h3>📊 Estadísticas</h3><p>0 alertas en esta demostración.</p><p class="notice">Las ofertas reales y las suscripciones no se muestran en la demo.</p></section></div></div>
<div id="panel-tab-pane-preferencias" class="panel-tab-pane">
<div class="panel-card" style="max-width:760px"><h3>🧩 Elegí qué buscás</h3>
<form id="form-preferencias"><div class="field"><label for="pref-distrito-principal">Distrito principal</label><input id="pref-distrito-principal" value="" placeholder="Ejemplo: AVELLANEDA" autocomplete="off"></div>
<div class="field"><label for="pref-cargo-1">Cargo o materia</label><input id="pref-cargo-1" placeholder="Ejemplo: PRECEPTOR" autocomplete="off"></div>
<div class="field"><label for="pref-alertas-activas">Estado de alerta</label><select id="pref-alertas-activas"><option value="no">Pausadas</option><option value="si">Activas (solo simulación)</option></select></div>
<div class="demo-actions"><button type="submit">Simular guardado</button><button type="button" id="reset-demo">Restablecer ejemplo</button></div>
<p class="notice" id="demo-msg" role="status">No se guarda ni se envía ninguna información.</p></form></div></div>
</div></main>
<script>
window.APD_activatePanelTab = function(key) {
  var target = key === 'preferencias' ? 'preferencias' : 'inicio';
  document.querySelectorAll('.panel-tab-pane').forEach(function(el) { el.classList.toggle('active', el.id === 'panel-tab-pane-' + target); });
  document.querySelectorAll('[data-tab]').forEach(function(el) { el.setAttribute('aria-selected', String(el.dataset.tab === target)); });
};
document.querySelectorAll('[data-tab]').forEach(function(el) { el.addEventListener('click', function() { window.APD_activatePanelTab(el.dataset.tab); }); });
function updateDemo(values) {
  var lines = document.getElementById('panel-preferencias-resumen').querySelectorAll('p');
  lines[0].innerHTML = '<strong>Distritos:</strong> ' + (values.district || '(sin filtro)');
  lines[1].innerHTML = '<strong>Cargos/Materias:</strong> ' + (values.cargo || '(sin filtro)');
  lines[4].innerHTML = '<strong>Alertas:</strong> ' + (values.active ? 'Activas' : 'Pausadas');
}
document.getElementById('form-preferencias').addEventListener('submit', function(event) {
  event.preventDefault();
  var district = document.getElementById('pref-distrito-principal').value.trim().toUpperCase();
  var cargo = document.getElementById('pref-cargo-1').value.trim().toUpperCase();
  var active = document.getElementById('pref-alertas-activas').value === 'si';
  // No datos privados: demostración solamente, sin llamadas de red ni almacenamiento.
  updateDemo({ district: district.replace(/[<>]/g, ''), cargo: cargo.replace(/[<>]/g, ''), active: active });
  document.getElementById('demo-msg').textContent = 'Vista simulada actualizada. No se guardó nada.';
  window.APD_activatePanelTab('inicio');
});
document.getElementById('reset-demo').addEventListener('click', function() {
  document.getElementById('form-preferencias').reset();
  updateDemo({ district: '', cargo: '', active: false });
  window.APD_activatePanelTab('inicio');
});
</script>
<script src="./growth_activation_guide.js?v=1"></script></body></html>`;
writeFileSync(path.join(out, 'panel-demo.html'), panel, 'utf8');
copyFileSync(path.join(root, 'growth_activation_guide.js'), path.join(out, 'growth_activation_guide.js'));
writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
writeFileSync(path.join(out, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n', 'utf8');
console.log('APD_PREVIEW_BUILD_OK', out);
