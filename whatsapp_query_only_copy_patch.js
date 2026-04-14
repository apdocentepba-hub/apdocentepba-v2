(() => {
  'use strict';

  if (window.__apdWhatsappQueryOnlyCopyPatchLoaded) return;
  window.__apdWhatsappQueryOnlyCopyPatchLoaded = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function patchPlanesPayload(data) {
    const copy = data && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data;
    const planes = Array.isArray(copy?.planes) ? copy.planes : [];

    planes.forEach((plan) => {
      const code = String(plan?.code || plan?.display_code || '').trim().toUpperCase();
      const features = Array.isArray(plan?.features) ? plan.features.slice() : [];
      plan.features = features.map((item) => {
        const text = String(item || '');
        if (/WhatsApp incluido/i.test(text)) return 'WhatsApp consulta manual';
        if (/WhatsApp solo en Insigne/i.test(text)) return 'WhatsApp consulta manual solo en Insigne';
        return text;
      });

      if (code === 'INSIGNE') {
        plan.descripcion = 'Cobertura máxima: 3 distritos principales + 2 de emergencia, hasta 10 materias/cargos, email y Telegram incluidos. WhatsApp queda disponible en modo consulta manual escribiendo ALERTAS.';
      } else if (code === 'PREMIUM' || code === 'PRO') {
        plan.descripcion = 'Cobertura fuerte para multiplicar oportunidades: email y Telegram incluidos. WhatsApp consulta manual reservado para Insigne.';
      } else if (code === 'PLUS') {
        plan.descripcion = 'Más alcance sin irte de presupuesto: email y Telegram incluidos. WhatsApp consulta manual reservado para Insigne.';
      } else if (code === 'TRIAL_7D') {
        plan.descripcion = 'Probá APDocentePBA durante 7 días con email y Telegram incluidos. WhatsApp consulta manual reservado para Insigne.';
      }
    });

    return copy;
  }

  function patchWorkerFetchJson() {
    if (typeof window.workerFetchJson !== 'function' || window.workerFetchJson.__apdWhatsappQueryOnlyPatched) return;

    const original = window.workerFetchJson;
    window.workerFetchJson = async function () {
      const path = String(arguments[0] || '');
      const data = await original.apply(this, arguments);

      if (path === '/api/planes' || path.startsWith('/api/planes?')) {
        return patchPlanesPayload(data);
      }

      if (path === '/api/whatsapp/status' || path.startsWith('/api/whatsapp/status?')) {
        if (data && typeof data === 'object') {
          const copy = JSON.parse(JSON.stringify(data));
          copy.channel_mode = copy.channel_mode || 'query_only';
          if (copy.allowed_by_plan) {
            copy.connect_hint = 'Vinculá tu número y después consultá escribiendo ALERTAS en el chat de WhatsApp.';
          }
          return copy;
        }
      }

      return data;
    };

    window.workerFetchJson.__apdWhatsappQueryOnlyPatched = true;
  }

  function replaceLabelText() {
    const input = byId('pref-alertas-whatsapp');
    const label = input?.closest('label');
    if (!label) return;

    const raw = (label.textContent || '').replace(/\s+/g, ' ').trim();
    if (/Avisar por WhatsApp/i.test(raw)) {
      const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) {
        textNode.textContent = ' Habilitar consulta por WhatsApp';
      } else {
        label.appendChild(document.createTextNode(' Habilitar consulta por WhatsApp'));
      }
    }
  }

  function patchWhatsappBox() {
    const pill = byId('whatsapp-pref-pill');
    const note = byId('whatsapp-pref-note');
    const mini = byId('whatsapp-pref-mini');
    if (!pill || !note || !mini) return;

    const pillText = String(pill.textContent || '').trim();
    if (pillText === 'Conectado y activo') {
      note.textContent = 'WhatsApp quedó listo para consulta manual. Escribí ALERTAS en el chat para pedir tus alertas del momento.';
    } else if (pillText === 'Conectado') {
      note.textContent = 'WhatsApp ya está vinculado, pero el canal está apagado en tus preferencias. Cuando lo actives, vas a consultar escribiendo ALERTAS.';
    } else if (pillText === 'Pendiente') {
      note.textContent = 'Vinculá tu número y después consultá escribiendo ALERTAS en el chat de WhatsApp.';
    } else if (pillText === 'No incluido') {
      note.textContent = 'WhatsApp consulta manual queda reservado para Insigne. Con tu plan podés usar email y Telegram.';
    }

    const miniText = String(mini.textContent || '').trim();
    if (/Incluido en/i.test(miniText) && !/ALERTAS/i.test(miniText)) {
      mini.textContent = `${miniText} · Modo consulta manual: ALERTAS`;
    }
  }

  function patchSummary() {
    const summary = document.querySelector('[data-whatsapp-summary="1"]');
    if (!summary) return;
    if (/Solo disponible en Insigne/i.test(summary.textContent || '')) return;
    summary.innerHTML = '<strong>WhatsApp:</strong> Consulta manual';
  }

  function patchChannelsCard() {
    const canales = byId('panel-canales');
    if (!canales) return;
    const notes = canales.querySelectorAll('.plan-note');
    if (notes.length >= 3) {
      notes[2].textContent = 'WhatsApp queda reservado para Insigne y funciona en modo consulta manual: el docente escribe ALERTAS y recibe la respuesta en ese momento.';
    }

    const pills = canales.querySelectorAll('.plan-pill-row .plan-pill-neutral');
    if (pills.length >= 3) {
      const current = String(pills[2].textContent || '').trim();
      if (/Conectado|Activo/i.test(current)) {
        pills[2].textContent = 'Consulta manual';
      }
    }
  }

  function patchAll() {
    patchWorkerFetchJson();
    replaceLabelText();
    patchWhatsappBox();
    patchSummary();
    patchChannelsCard();
  }

  const observer = new MutationObserver(() => {
    patchAll();
  });

  function boot() {
    patchAll();
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    let tries = 0;
    const tick = () => {
      tries += 1;
      patchAll();
      if (tries < 20) setTimeout(tick, 500);
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
