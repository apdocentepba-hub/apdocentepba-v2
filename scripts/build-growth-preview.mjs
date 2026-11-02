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
  <a href="./platform-completa.html" style="color:#402a02;margin-left:12px">Ver propuesta visual integral</a>
  <a href="./insigne-laboratorio.html" style="color:#402a02;margin-left:12px">Probar Insigne LAB</a>
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
.notice{font-size:12px;color:#5c7481;margin-top:8px}.checks-grid{display:flex;flex-wrap:wrap;gap:8px 13px}.checks-grid label{display:inline-flex;align-items:center;gap:5px;background:#f2f8fa;padding:7px 9px;border:1px solid #d4e3e7;border-radius:8px;font-size:13px;cursor:pointer}.checks-grid input{accent-color:#0a5366}
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
<form id="form-preferencias"><div class="field"><label for="pref-distrito-principal">Distrito principal</label><input id="pref-distrito-principal" value="" list="apd-preview-distritos" placeholder="Ejemplo: AVELLANEDA" autocomplete="off"><datalist id="apd-preview-distritos"><option value="AVELLANEDA"><option value="LANÚS"><option value="QUILMES"><option value="LOMAS DE ZAMORA"><option value="LA MATANZA"><option value="BERAZATEGUI"></datalist><small class="notice">Sugerencias ilustrativas; no son el catálogo completo del sistema real.</small></div>
<div class="field"><label for="pref-cargo-1">Cargo o materia</label><input id="pref-cargo-1" list="apd-preview-cargos" placeholder="Ejemplo: PRECEPTOR" autocomplete="off"><datalist id="apd-preview-cargos"><option value="PRECEPTOR"><option value="MAESTRO DE GRADO"><option value="MATEMÁTICA"><option value="INGLÉS"><option value="INFORMÁTICA"></datalist><small class="notice">Escribí o seleccioná una sugerencia de ejemplo.</small></div>
<div class="field"><label for="pref-turnos">Turno (opcional)</label><select id="pref-turnos"><option value="">Cualquier turno</option><option value="M">Mañana</option><option value="T">Tarde</option><option value="V">Vespertino</option><option value="N">Noche</option><option value="ALTERNADO">Alternado</option></select></div>
<div class="field"><span id="apd-preview-niveles-label">Nivel o modalidad (opcional)</span><div class="checks-grid" role="group" aria-labelledby="apd-preview-niveles-label">
<label><input type="checkbox" name="pref-nivel-modalidad" value="INICIAL">Inicial</label>
<label><input type="checkbox" name="pref-nivel-modalidad" value="PRIMARIO">Primario</label>
<label><input type="checkbox" name="pref-nivel-modalidad" value="SECUNDARIO">Secundario</label>
<label><input type="checkbox" name="pref-nivel-modalidad" value="SUPERIOR">Superior / Formación Docente</label>
<label><input type="checkbox" name="pref-nivel-modalidad" value="TECNICO PROFESIONAL">Técnico-Profesional</label>
<label><input type="checkbox" name="pref-nivel-modalidad" value="ADULTOS">Jóvenes y Adultos</label></div><small class="notice">Ejemplos de modalidades de prueba; no son todos los filtros disponibles en producción.</small></div>
<div class="field"><label for="pref-alertas-activas">Estado de alerta</label><select id="pref-alertas-activas"><option value="no">Pausadas</option><option value="si">Activas (solo simulación)</option></select></div>
<div class="field"><label for="pref-alertas-email">¿Querés recibir avisos por email?</label><select id="pref-alertas-email"><option value="no">No (solo alertas en pantalla)</option><option value="si">Sí (solo simulación, sin envíos)</option></select><small class="notice">En el sistema real, los canales dependen del plan y deben confirmarse en Preferencias.</small></div>
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
  function updateRow(index, text) {
    var row = lines[index];
    var strong = row.querySelector('strong');
    if (!strong) return;
    // Usar textContent: el texto del visitante nunca se interpreta como HTML.
    while (strong.nextSibling) strong.nextSibling.remove();
    row.appendChild(document.createTextNode(' ' + text));
  }
  updateRow(0, values.district || '(sin filtro)');
  updateRow(1, values.cargo || '(sin filtro)');
  updateRow(2, values.levels && values.levels.length ? values.levels.join(', ') : '(cualquiera)');
  updateRow(3, values.turn || '(cualquiera)');
  updateRow(4, values.active ? 'Activas (demo)' : 'Pausadas');
  updateRow(5, values.email ? 'Sí (demo)' : 'No');
}

document.getElementById('form-preferencias').addEventListener('submit', function(event) {
  event.preventDefault();
  var district = document.getElementById('pref-distrito-principal').value.trim().toUpperCase();
  var cargo = document.getElementById('pref-cargo-1').value.trim().toUpperCase();
  var turnSelect = document.getElementById('pref-turnos');
  var turn = turnSelect.value ? turnSelect.options[turnSelect.selectedIndex].text : '';
  var levels = Array.from(document.querySelectorAll('input[name="pref-nivel-modalidad"]:checked'), function(el) { return el.value; });
  var active = document.getElementById('pref-alertas-activas').value === 'si';
  var email = document.getElementById('pref-alertas-email').value === 'si';
  // No datos privados: demostración solamente, sin llamadas de red ni almacenamiento.
  updateDemo({ district: district, cargo: cargo, levels: levels, turn: turn, active: active, email: email });
  document.getElementById('demo-msg').textContent = active && !email
    ? 'Vista actualizada. Ojo: marcaste alertas activas, pero email sigue desactivado. No se enviaron avisos.'
    : 'Vista simulada actualizada. No se guardó ni envió nada.';
  window.APD_activatePanelTab('inicio');
});
document.getElementById('reset-demo').addEventListener('click', function() {
  document.getElementById('form-preferencias').reset();
  updateDemo({ district: '', cargo: '', levels: [], turn: '', active: false, email: false });
  window.APD_activatePanelTab('inicio');
});
</script>
<script src="./growth_activation_guide.js?v=1"></script></body></html>`;
writeFileSync(path.join(out, 'panel-demo.html'), panel, 'utf8');
copyFileSync(path.join(root, 'growth_activation_guide.js'), path.join(out, 'growth_activation_guide.js'));
copyFileSync(path.join(root, 'insigne_rules_lab.js'), path.join(out, 'insigne_rules_lab.js'));
copyFileSync(path.join(root, 'scripts/previews/platform-visual.html'), path.join(out, 'platform-visual.html'));
copyFileSync(path.join(root, 'platform_refresh_v1.css'), path.join(out, 'platform_refresh_v1.css'));
copyFileSync(path.join(root, 'scripts/previews/platform-completa.html'), path.join(out, 'platform-completa.html'));
copyFileSync(path.join(root, 'scripts/previews/platform-completa.css'), path.join(out, 'platform-completa.css'));
copyFileSync(path.join(root, 'scripts/previews/platform-completa.js'), path.join(out, 'platform-completa.js'));
copyFileSync(path.join(root, 'assets/js/herramientas-catalogo.js'), path.join(out, 'herramientas-catalogo.js'));

copyFileSync(path.join(root, 'scripts/previews/insigne-laboratorio.html'), path.join(out, 'insigne-laboratorio.html'));
writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
writeFileSync(path.join(out, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n', 'utf8');
console.log('APD_PREVIEW_BUILD_OK', out);
