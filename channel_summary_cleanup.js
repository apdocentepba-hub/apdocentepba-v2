(function(){
'use strict';
if(window.__apdChannelSummaryCleanupLoaded) return;
window.__apdChannelSummaryCleanupLoaded = true;

function byId(id){return document.getElementById(id);}
function esc(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function setupThemeToggle(){
  if(byId('apd-theme-toggle')) return;
  const saved = localStorage.getItem('apd_theme') || 'light';
  document.body.classList.toggle('apd-dark', saved === 'dark');
  const btn = document.createElement('button');
  btn.id = 'apd-theme-toggle';
  btn.className = 'apd-theme-toggle';
  btn.type = 'button';
  function sync(){ btn.textContent = document.body.classList.contains('apd-dark') ? '☀️ Claro' : '🌙 Oscuro'; }
  btn.addEventListener('click', function(){
    const nextDark = !document.body.classList.contains('apd-dark');
    document.body.classList.toggle('apd-dark', nextDark);
    localStorage.setItem('apd_theme', nextDark ? 'dark' : 'light');
    sync();
  });
  sync();
  document.body.appendChild(btn);
}

function prefStatus(label){
  const pref = byId('panel-preferencias-resumen');
  const text = String(pref && pref.textContent || '');
  const re = new RegExp(label+'\\s*:\\s*(Conectado y activo|Conectado|Pendiente de conexión|Disponible|Incluido en Insigne|Según plan)','i');
  const m = text.match(re);
  return m && m[1] ? m[1] : '';
}

function formStatus(label){
  const id = label === 'Telegram' ? 'telegram-pref-pill' : 'whatsapp-pref-pill';
  const pill = byId(id);
  const t = String(pill && pill.textContent || '').trim();
  if(/Conectado y activo/i.test(t)) return 'Conectado y activo';
  if(/^Conectado$/i.test(t)) return 'Conectado';
  if(/Pendiente/i.test(t)) return 'Pendiente de conexión';
  if(/Disponible/i.test(t)) return 'Disponible';
  return '';
}

function isInsigne(){
  const txt = [byId('panel-plan')&&byId('panel-plan').textContent, byId('panel-datos-docente')&&byId('panel-datos-docente').textContent, byId('panel-preferencias-resumen')&&byId('panel-preferencias-resumen').textContent, byId('panel-canales')&&byId('panel-canales').textContent].join(' ');
  return /INSIGNE|Plan\s+Insigne/i.test(txt);
}

function wanted(label){
  return formStatus(label) || prefStatus(label) || (isInsigne() ? 'Incluido en Insigne' : 'Según plan');
}

function cleanupSummary(){
  const resumen = byId('panel-preferencias-resumen');
  if(!resumen) return;
  const telegram = wanted('Telegram');
  const whatsapp = wanted('WhatsApp');
  Array.from(resumen.querySelectorAll('p,div,li')).forEach(function(el){
    const t = String(el.textContent||'').trim();
    if(/^Telegram\s*:/i.test(t) || /^WhatsApp\s*:/i.test(t)) el.remove();
  });
  const p1 = document.createElement('p');
  p1.dataset.apdChannelSummary = 'telegram';
  p1.innerHTML = '<strong>Telegram:</strong> ' + esc(telegram);
  const p2 = document.createElement('p');
  p2.dataset.apdChannelSummary = 'whatsapp';
  p2.innerHTML = '<strong>WhatsApp:</strong> ' + esc(whatsapp);
  resumen.appendChild(p1);
  resumen.appendChild(p2);
}

function cleanCanales(){
  if(!isInsigne()) return;
  const canales = byId('panel-canales');
  if(!canales) return;
  canales.querySelectorAll('*').forEach(function(el){
    if(el.children.length) return;
    const t = String(el.textContent||'').trim();
    if(/^(No incluido|Solo disponible en Insigne|En preparación|Según plan)$/i.test(t)) el.textContent = 'Incluido en Insigne';
    if(/Telegram aún no disponible|Telegram no está habilitado/i.test(t)) el.textContent = 'Telegram incluido en tu plan Insigne. Abrí el bot desde Preferencias para conectarlo.';
    if(/WhatsApp en preparación|WhatsApp no está habilitado|WhatsApp queda reservado/i.test(t)) el.textContent = 'WhatsApp incluido en tu plan Insigne. Funciona por consulta manual: escribí ALERTAS en el bot.';
  });
}

function publicCopy(){
  const hero = document.querySelector('.hero-eyebrow');
  if(hero && /Beta abierta/i.test(hero.textContent || '')) hero.textContent = '🎯 Alertas docentes para APD de la Provincia de Buenos Aires';
  document.querySelectorAll('.card-lbl').forEach(function(el){
    if(/Backfill provincial/i.test(String(el.textContent||''))) el.textContent = '🛠️ Actualización provincial';
  });
  const reset = byId('btn-provincia-reset');
  if(reset && reset.textContent.trim()==='Reset') reset.textContent = 'Reiniciar';
  const pidHint = byId('panel-listados-pid-card') && byId('panel-listados-pid-card').querySelector('.prefs-hint');
  if(pidHint && !/Insigne/i.test(pidHint.textContent || '')) pidHint.textContent = 'Consulta de puntaje por DNI, listado y año. Función disponible según tu plan; el acceso completo corresponde al plan Insigne.';
  document.querySelectorAll('a[href="./soporte-beta.html"]').forEach(function(a){ a.setAttribute('href','./soporte.html'); });
}

function run(){
  setupThemeToggle();
  publicCopy();
  cleanupSummary();
  cleanCanales();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
[300,800,1500,2500,4000,6000,9000,12000,16000].forEach(function(ms){setTimeout(run,ms);});
})();
