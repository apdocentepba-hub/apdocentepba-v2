(function(){
'use strict';
if(window.__apdChannelSummaryCleanupLoaded) return;
window.__apdChannelSummaryCleanupLoaded = true;

function byId(id){return document.getElementById(id);}
function esc(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

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
  const txt = [byId('panel-plan')&&byId('panel-plan').textContent, byId('panel-datos-docente')&&byId('panel-datos-docente').textContent, byId('panel-preferencias-resumen')&&byId('panel-preferencias-resumen').textContent].join(' ');
  return /INSIGNE|Plan\s+Insigne/i.test(txt);
}

function wanted(label){
  return formStatus(label) || prefStatus(label) || (isInsigne() ? 'Incluido en Insigne' : 'Según plan');
}

function cleanup(){
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

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cleanup, {once:true}); else cleanup();
[300,800,1500,2500,4000,6000,9000,12000,16000].forEach(function(ms){setTimeout(cleanup,ms);});
})();
