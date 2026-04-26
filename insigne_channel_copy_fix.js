(function(){
  'use strict';
  if (window.__apdInsigneChannelCopyFixLoaded) return;
  window.__apdInsigneChannelCopyFixLoaded = true;

  function hasInsigne(){
    const txt = document.body ? document.body.innerText || '' : '';
    return /\bINSIGNE\b|Plan Insigne|PLAN INSIGNE/i.test(txt);
  }

  function leafNodes(root){
    const out=[];
    if(!root) return out;
    root.querySelectorAll('*').forEach(function(el){
      if(el.children.length === 0) out.push(el);
    });
    return out;
  }

  function replaceLeaf(root, re, text){
    leafNodes(root).forEach(function(el){
      const t = String(el.textContent || '').trim();
      if(re.test(t)) el.textContent = text;
    });
  }

  function fix(){
    if(!hasInsigne()) return;

    ['pref-alertas-telegram','pref-alertas-whatsapp'].forEach(function(id){
      const input = document.getElementById(id);
      if(input) input.disabled = false;
    });

    const canales = document.getElementById('panel-canales');
    if(canales){
      replaceLeaf(canales, /^No incluido$/i, 'Incluido en Insigne');
      replaceLeaf(canales, /^Solo disponible en Insigne$/i, 'Incluido en Insigne');
      replaceLeaf(canales, /^En preparación$/i, 'Incluido en Insigne');
      replaceLeaf(canales, /Telegram aún no disponible en este plan\.?/i, 'Telegram incluido en tu plan Insigne. Abrí el bot desde Preferencias para conectarlo.');
      replaceLeaf(canales, /Telegram no está habilitado\.?/i, 'Telegram incluido en tu plan Insigne. Abrí el bot desde Preferencias para conectarlo.');
      replaceLeaf(canales, /WhatsApp en preparación\.?/i, 'WhatsApp incluido en tu plan Insigne. Funciona por consulta manual: escribí ALERTAS en el bot.');
      replaceLeaf(canales, /WhatsApp no está habilitado\.?/i, 'WhatsApp incluido en tu plan Insigne. Funciona por consulta manual: escribí ALERTAS en el bot.');
      replaceLeaf(canales, /WhatsApp queda reservado.*$/i, 'WhatsApp incluido en tu plan Insigne. Funciona por consulta manual: escribí ALERTAS en el bot.');
    }

    const resumen = document.getElementById('panel-preferencias-resumen');
    if(resumen){
      leafNodes(resumen).forEach(function(el){
        const t = String(el.textContent || '').trim();
        if(/^Telegram:\s*(No incluido|no está habilitado|Pendiente de conexión)/i.test(t)) {
          el.innerHTML = '<strong>Telegram:</strong> Disponible para conectar';
        }
        if(/^WhatsApp:\s*(No incluido|Solo disponible|En preparación|Pendiente de conexión)/i.test(t)) {
          el.innerHTML = '<strong>WhatsApp:</strong> Disponible para conectar';
        }
      });
    }
  }

  function boot(){
    fix();
    let n = 0;
    const timer = setInterval(function(){
      n += 1;
      fix();
      if(n >= 12) clearInterval(timer);
    }, 700);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
