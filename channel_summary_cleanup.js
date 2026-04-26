(function(){
'use strict';
if(window.__apdChannelSummaryCleanupLoaded) return;
window.__apdChannelSummaryCleanupLoaded = true;

function byId(id){return document.getElementById(id);}
function esc(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

let planExpirationFetching = false;
let planExpirationLastFetch = 0;
let planExpirationCache = null;

function injectDarkContrastStyle(){
  if(byId('apd-dark-contrast-style')) return;
  const style = document.createElement('style');
  style.id = 'apd-dark-contrast-style';
  style.textContent = `
    body.apd-dark,
    body.apd-dark main,
    body.apd-dark .section {
      background:#071426 !important;
      color:#eaf2ff !important;
    }

    body.apd-dark .container,
    body.apd-dark .panel-header,
    body.apd-dark .panel-card,
    body.apd-dark .form-card,
    body.apd-dark .hero-card,
    body.apd-dark .channel-pref-box,
    body.apd-dark .card,
    body.apd-dark .box,
    body.apd-dark .plan-card,
    body.apd-dark .listado-card,
    body.apd-dark .repo-card,
    body.apd-dark .stat-card,
    body.apd-dark .alert-card,
    body.apd-dark #panel-content > div {
      background:#10233a !important;
      color:#eaf2ff !important;
      border-color:#31506f !important;
    }

    body.apd-dark h1,
    body.apd-dark h2,
    body.apd-dark h3,
    body.apd-dark h4,
    body.apd-dark h5,
    body.apd-dark h6,
    body.apd-dark p,
    body.apd-dark span,
    body.apd-dark div,
    body.apd-dark label,
    body.apd-dark li,
    body.apd-dark td,
    body.apd-dark th,
    body.apd-dark strong,
    body.apd-dark b,
    body.apd-dark small,
    body.apd-dark .card-lbl,
    body.apd-dark .panel-sub,
    body.apd-dark .prefs-hint,
    body.apd-dark .ph,
    body.apd-dark .muted,
    body.apd-dark .text-muted {
      color:#eaf2ff !important;
    }

    body.apd-dark .prefs-hint,
    body.apd-dark .ph,
    body.apd-dark small,
    body.apd-dark .muted,
    body.apd-dark .text-muted,
    body.apd-dark .panel-sub,
    body.apd-dark .mini-text,
    body.apd-dark .help-text,
    body.apd-dark .subtle {
      color:#b9d2f0 !important;
    }

    body.apd-dark input,
    body.apd-dark select,
    body.apd-dark textarea {
      background:#071426 !important;
      color:#ffffff !important;
      border-color:#426381 !important;
      caret-color:#ffffff !important;
    }

    body.apd-dark input::placeholder,
    body.apd-dark textarea::placeholder {
      color:#8fb1d6 !important;
      opacity:1 !important;
    }

    body.apd-dark input[type="checkbox"] {
      accent-color:#60a5fa !important;
    }

    body.apd-dark table,
    body.apd-dark thead,
    body.apd-dark tbody,
    body.apd-dark tr {
      background:#10233a !important;
      color:#eaf2ff !important;
      border-color:#31506f !important;
    }

    body.apd-dark td,
    body.apd-dark th {
      border-color:#31506f !important;
    }

    body.apd-dark th,
    body.apd-dark .table-head,
    body.apd-dark .area-title,
    body.apd-dark .stat-num,
    body.apd-dark .stat-value,
    body.apd-dark .badge-num,
    body.apd-dark .score,
    body.apd-dark .number,
    body.apd-dark [class*="num"],
    body.apd-dark [class*="score"],
    body.apd-dark [class*="puntaje"],
    body.apd-dark [class*="total"] {
      color:#ffffff !important;
      font-weight:800 !important;
    }

    body.apd-dark a:not(.btn):not(.apd-footer-support-btn) {
      color:#93c5fd !important;
      text-decoration-color:#60a5fa !important;
    }

    body.apd-dark .btn,
    body.apd-dark button,
    body.apd-dark .mini-btn {
      color:#ffffff !important;
      border-color:#426381 !important;
    }

    body.apd-dark .btn-primary,
    body.apd-dark button.btn-primary,
    body.apd-dark .btn.btn-primary {
      background:#2563eb !important;
      color:#ffffff !important;
      border-color:#60a5fa !important;
    }

    body.apd-dark .btn-secondary,
    body.apd-dark .btn-outline,
    body.apd-dark .btn-ghost,
    body.apd-dark .mini-btn,
    body.apd-dark .apd-inline-check,
    body.apd-dark .chip,
    body.apd-dark .pill,
    body.apd-dark .badge {
      background:#173454 !important;
      color:#eaf2ff !important;
      border-color:#426381 !important;
    }

    body.apd-dark .ac-list,
    body.apd-dark .autocomplete-list,
    body.apd-dark .dropdown,
    body.apd-dark .menu,
    body.apd-dark option {
      background:#071426 !important;
      color:#ffffff !important;
      border-color:#426381 !important;
    }

    body.apd-dark .plan-expiration-box {
      background:#0b2a48 !important;
      color:#ffffff !important;
      border-color:#60a5fa !important;
    }

    body.apd-dark .plan-expiration-box * {
      color:#ffffff !important;
    }

    body.apd-dark .footer,
    body.apd-dark footer {
      background:#0b2a48 !important;
      color:#dbeafe !important;
      border-top:1px solid #31506f !important;
    }

    body.apd-dark .apd-footer-support-btn {
      background:#ffffff !important;
      color:#0f3460 !important;
    }
  `;
  document.head.appendChild(style);
}

function setupThemeToggle(){
  injectDarkContrastStyle();
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

function styleFooterSupportButton(){
  const footer = document.querySelector('.footer-inner');
  if(!footer || footer.dataset.apdSupportButtonReady === '1') return;
  footer.innerHTML = [
    '<div class="apd-footer-brand" style="color:#dbeafe;font-weight:700;">APDocentePBA · Sistema de alertas para docentes PBA · 2026</div>',
    '<div class="apd-footer-legal" style="margin-top:7px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap;align-items:center;color:#93c5fd;">',
      '<a href="./terminos.html" style="color:#dbeafe;text-decoration:none;font-weight:700;">Términos</a>',
      '<span style="color:#60a5fa;">·</span>',
      '<a href="./privacidad.html" style="color:#dbeafe;text-decoration:none;font-weight:700;">Privacidad</a>',
      '<span style="color:#60a5fa;">·</span>',
      '<a href="./suscripciones.html" style="color:#dbeafe;text-decoration:none;font-weight:700;">Suscripciones</a>',
    '</div>',
    '<div class="apd-footer-support-wrap" style="margin-top:16px;display:flex;justify-content:center;">',
      '<a class="apd-footer-support-btn" href="./soporte.html" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 26px;border-radius:999px;background:#ffffff;color:#0f3460;text-decoration:none;font-weight:900;font-size:15px;box-shadow:0 10px 28px rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.75);">🛟 Soporte</a>',
    '</div>'
  ].join('');
  footer.dataset.apdSupportButtonReady = '1';
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
  styleFooterSupportButton();
}

function planNameFromInfo(info){
  const plan = info && info.plan || {};
  const sub = info && info.subscription || {};
  return String(plan.display_name || plan.nombre || plan.name || sub.plan_code || plan.code || '').trim();
}

function expirationHtml(info){
  const sub = info && info.subscription || {};
  const rawDays = sub.days_remaining;
  const days = rawDays === null || rawDays === undefined || rawDays === '' ? null : Number(rawDays);
  const label = String(sub.ends_at_label || '').trim();
  const expired = sub.is_expired === true;
  const planName = planNameFromInfo(info);

  if (!label && !Number.isFinite(days)) return '';

  let statusText = '';
  let toneBg = '#eef6ff';
  let toneBorder = '#bfdcff';
  let toneColor = '#0f3460';

  if (expired) {
    statusText = 'Plan vencido';
    toneBg = '#fff1f2';
    toneBorder = '#fecdd3';
    toneColor = '#be123c';
  } else if (Number.isFinite(days)) {
    if (days <= 0) statusText = 'Vence hoy';
    else if (days === 1) statusText = 'Vence mañana';
    else statusText = 'Vence en ' + days + ' días';

    if (days <= 3) {
      toneBg = '#fff7ed';
      toneBorder = '#fed7aa';
      toneColor = '#9a3412';
    } else if (days <= 7) {
      toneBg = '#fefce8';
      toneBorder = '#fde68a';
      toneColor = '#854d0e';
    }
  } else {
    statusText = 'Vencimiento informado';
  }

  return '<div id="apd-plan-expiration" class="plan-expiration-box" style="margin-top:12px;padding:12px;border:1px solid '+toneBorder+';border-radius:14px;background:'+toneBg+';color:'+toneColor+';">'
    + '<div style="font-weight:800;margin-bottom:4px;">⏳ '+esc(statusText)+'</div>'
    + (planName ? '<div style="font-size:13px;"><strong>Plan:</strong> '+esc(planName)+'</div>' : '')
    + (label ? '<div style="font-size:13px;"><strong>Vencimiento:</strong> '+esc(label)+'</div>' : '')
    + '</div>';
}

function paintPlanExpiration(info){
  const box = byId('panel-plan');
  if(!box || !info) return;
  const html = expirationHtml(info);
  byId('apd-plan-expiration')?.remove();
  if(!html) return;
  const anchor = byId('plan-summary-actions');
  if(anchor) anchor.insertAdjacentHTML('beforebegin', html);
  else box.insertAdjacentHTML('beforeend', html);
}

async function fetchPlanInfo(){
  if(planExpirationFetching) return null;
  const now = Date.now();
  if(planExpirationCache && now - planExpirationLastFetch < 25000) return planExpirationCache;
  const userId = typeof window.obtenerToken === 'function' ? String(window.obtenerToken() || '').trim() : '';
  if(!userId) return null;
  planExpirationFetching = true;
  try{
    let info = null;
    if(typeof window.obtenerMiPlan === 'function') info = await window.obtenerMiPlan(userId);
    else if(typeof window.workerFetchJson === 'function') info = await window.workerFetchJson('/api/mi-plan?user_id=' + encodeURIComponent(userId));
    if(info && (info.plan || info.subscription)) {
      planExpirationCache = info;
      planExpirationLastFetch = Date.now();
      window.planActual = info;
    }
    return info;
  }catch(err){
    console.warn('APD plan expiration fetch error:', err);
    return null;
  }finally{
    planExpirationFetching = false;
  }
}

function renderPlanExpiration(){
  const box = byId('panel-plan');
  if(!box) return;
  if(window.planActual && (window.planActual.plan || window.planActual.subscription)) {
    paintPlanExpiration(window.planActual);
  }
  fetchPlanInfo().then(function(info){ if(info) paintPlanExpiration(info); });
}

function run(){
  injectDarkContrastStyle();
  setupThemeToggle();
  publicCopy();
  cleanupSummary();
  cleanCanales();
  renderPlanExpiration();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
[300,800,1500,2500,4000,6000,9000,12000,16000].forEach(function(ms){setTimeout(run,ms);});
})();
