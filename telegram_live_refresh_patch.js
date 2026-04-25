(function () {
  'use strict';

  if (window.__apdTelegramLiveRefreshLoaded) return;
  window.__apdTelegramLiveRefreshLoaded = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }

  function planDisplayName(raw) {
    const key = String(raw || '').trim().toUpperCase();
    if (!key) return 'tu plan';
    if (key === 'TRIAL_7D') return 'Prueba 7 días';
    if (key === 'PLUS') return 'Plus';
    if (key === 'PREMIUM' || key === 'PRO') return 'Premium';
    if (key === 'INSIGNE') return 'Insigne';
    return key;
  }

  function setPill(pill, text, bg, color, border) {
    if (!pill) return;
    pill.textContent = text;
    pill.style.background = bg;
    pill.style.color = color;
    pill.style.borderColor = border;
  }

  function ensureWhatsappCopyPatch() {
    if (window.__apdWhatsappQueryOnlyCopyPatchLoaded) return;
    if ([...document.scripts].some(s => s.src && s.src.includes('whatsapp_query_only_copy_patch.js'))) return;
    const s = document.createElement('script');
    s.src = 'whatsapp_query_only_copy_patch.js?v=1';
    s.defer = true;
    s.id = 'apd-whatsapp-query-only-copy-loader';
    document.body.appendChild(s);
  }

  function patchPublicCopy() {
    const hero = document.querySelector('.hero-eyebrow');
    if (hero && /beta/i.test(hero.textContent || '')) {
      hero.textContent = '🎯 Servicio de alertas para docentes PBA';
    }

    document.querySelectorAll('a[href="./soporte-beta.html"], a[href="soporte-beta.html"]').forEach(a => {
      a.setAttribute('href', './soporte.html');
    });

    const listadosCard = byId('panel-listados-pid-card');
    const listadosHint = listadosCard?.querySelector('.prefs-hint');
    if (listadosHint) {
      listadosHint.textContent = 'Consulta de puntaje por DNI, listado y año. Función incluida en plan Insigne o según habilitación vigente de tu plan.';
    }

    const backfillLabel = byId('panel-backfill-provincia')?.closest('.panel-card')?.querySelector('.card-lbl');
    if (backfillLabel && /Backfill/i.test(backfillLabel.textContent || '')) {
      backfillLabel.textContent = '🛠️ Herramientas de actualización';
    }
  }

  function patchChannelsSummaryCopy() {
    const canales = byId('panel-canales');
    if (!canales) return;

    const notes = canales.querySelectorAll('.plan-note');
    if (notes.length >= 2 && /pr[oó]ximamente|a[uú]n no disponible/i.test(notes[1].textContent || '')) {
      notes[1].textContent = 'Telegram está disponible según tu plan y requiere vincular el bot desde tus preferencias.';
    }
    if (notes.length >= 3) {
      notes[2].textContent = 'WhatsApp queda reservado para Insigne y funciona en modo consulta manual: escribís ALERTAS y recibís la respuesta en ese momento.';
    }

    const rows = canales.querySelectorAll('.plan-pill-row');
    rows.forEach(row => {
      const txt = row.textContent || '';
      const neutral = row.querySelector('.plan-pill-neutral');
      if (!neutral) return;
      if (/Telegram/i.test(txt) && /Pr[oó]ximamente|No incluido/i.test(neutral.textContent || '')) {
        neutral.textContent = 'Según plan';
      }
      if (/WhatsApp/i.test(txt) && /En preparación|Pr[oó]ximamente/i.test(neutral.textContent || '')) {
        neutral.textContent = 'Consulta manual';
      }
    });
  }

  function patchAllPublicCopy() {
    patchPublicCopy();
    patchChannelsSummaryCopy();
    ensureWhatsappCopyPatch();
  }

  function renderTelegramCard(status, requested) {
    const pill = byId('telegram-pref-pill');
    const note = byId('telegram-pref-note');
    const actions = byId('telegram-pref-actions');
    const mini = byId('telegram-pref-mini');
    const checkbox = byId('pref-alertas-telegram');
    if (!pill || !note || !actions || !mini || !checkbox) return;

    const connected = !!status?.connected;
    const botLink = String(status?.bot_link || '').trim();
    const botUser = String(status?.bot_username || '').replace(/^@+/, '').trim();
    const masked = String(status?.chat_id_masked || '').trim();
    const user = String(status?.username || '').trim();
    const allowedByPlan = status?.allowed_by_plan !== false;
    const planName = planDisplayName(status?.plan_name || status?.plan_code || '');
    const isRequested = !!requested;

    checkbox.disabled = !allowedByPlan;

    if (!allowedByPlan) {
      checkbox.checked = false;
      setPill(pill, 'No incluido', '#f8fafc', '#475569', '#cbd5e1');
      note.textContent = `Telegram no está habilitado para ${planName}.`;
      actions.innerHTML = '';
      mini.textContent = '';
      return;
    }

    if (connected) {
      checkbox.checked = isRequested;
      setPill(
        pill,
        isRequested ? 'Conectado y activo' : 'Conectado',
        isRequested ? '#ecfdf3' : '#eef4ff',
        isRequested ? '#166534' : '#0f3460',
        isRequested ? '#bbf7d0' : '#d6e4ff'
      );
      note.textContent = isRequested
        ? 'Telegram quedó listo para enviar alertas automáticas al chat vinculado.'
        : 'Telegram ya está vinculado, pero el canal está apagado en tus preferencias.';
      actions.innerHTML = botLink
        ? `<a class="btn btn-outline" href="${esc(botLink)}" target="_blank" rel="noopener noreferrer">Abrir bot</a>`
        : '';
      mini.textContent = [planName ? `Plan: ${planName}` : '', masked ? `Chat: ${masked}` : '', user ? `Usuario: @${user}` : '']
        .filter(Boolean)
        .join(' · ');
      return;
    }

    checkbox.checked = isRequested;
    setPill(pill, isRequested ? 'Pendiente de conexión' : 'Pendiente', '#fff7ed', '#9a3412', '#fed7aa');
    note.textContent = botUser
      ? `Abrí el bot @${botUser}, tocá Iniciar y después ya vas a poder recibir alertas en Telegram.`
      : 'Abrí el bot de Telegram y tocá Iniciar para vincular el chat.';
    actions.innerHTML = botLink
      ? `<a class="btn btn-primary" href="${esc(botLink)}" target="_blank" rel="noopener noreferrer">Conectar Telegram</a>`
      : '';
    mini.textContent = `Incluido en ${planName || 'tu plan'}.`;
  }

  function renderWhatsAppCard(status, requested) {
    const pill = byId('whatsapp-pref-pill');
    const note = byId('whatsapp-pref-note');
    const actions = byId('whatsapp-pref-actions');
    const mini = byId('whatsapp-pref-mini');
    const checkbox = byId('pref-alertas-whatsapp');
    if (!pill || !note || !actions || !mini || !checkbox) return;

    const allowedByPlan = !!status?.allowed_by_plan;
    const connected = !!status?.connected;
    const planName = planDisplayName(status?.plan_name || status?.plan_code || '');
    const phoneMasked = String(status?.phone_masked || '').trim();
    const connectHint = String(status?.connect_hint || '').trim();
    const isRequested = !!requested;

    checkbox.disabled = !allowedByPlan;

    if (!allowedByPlan) {
      checkbox.checked = false;
      setPill(pill, 'No incluido', '#f8fafc', '#475569', '#cbd5e1');
      note.textContent = `WhatsApp queda reservado para Insigne. Con ${planName || 'tu plan'} podés usar email y Telegram.`;
      actions.innerHTML = '';
      mini.textContent = '';
      return;
    }

    if (connected) {
      checkbox.checked = isRequested;
      setPill(
        pill,
        isRequested ? 'Conectado y activo' : 'Conectado',
        isRequested ? '#ecfdf3' : '#eef4ff',
        isRequested ? '#166534' : '#0f3460',
        isRequested ? '#bbf7d0' : '#d6e4ff'
      );
      note.textContent = isRequested
        ? 'WhatsApp quedó listo para consulta manual. Escribí ALERTAS en el chat para pedir tus alertas del momento.'
        : 'WhatsApp ya está vinculado, pero el canal está apagado en tus preferencias. Cuando lo actives, vas a consultar escribiendo ALERTAS.';
      actions.innerHTML = '';
      mini.textContent = [planName ? `Plan: ${planName}` : '', phoneMasked ? `Número: ${phoneMasked}` : '', 'Modo consulta manual: ALERTAS']
        .filter(Boolean)
        .join(' · ');
      return;
    }

    checkbox.checked = isRequested;
    setPill(pill, isRequested ? 'Pendiente de conexión' : 'Pendiente', '#fff7ed', '#9a3412', '#fed7aa');
    note.textContent = connectHint || 'Vinculá tu número y después consultá escribiendo ALERTAS en el chat de WhatsApp.';
    actions.innerHTML = '';
    mini.textContent = planName ? `Incluido en ${planName}. Modo consulta manual: ALERTAS.` : 'Modo consulta manual: ALERTAS.';
  }

  async function refreshChannelStatusFromWorker() {
    try {
      if (typeof window.workerFetchJson !== 'function' || typeof window.obtenerToken !== 'function') return;

      const userId = String(window.obtenerToken() || '').trim();
      if (!userId) return;

      const [tg, wa] = await Promise.all([
        window.workerFetchJson(`/api/telegram/status?user_id=${encodeURIComponent(userId)}`).catch(() => null),
        window.workerFetchJson(`/api/whatsapp/status?user_id=${encodeURIComponent(userId)}`).catch(() => null)
      ]);

      const tgCheck = byId('pref-alertas-telegram');
      const waCheck = byId('pref-alertas-whatsapp');

      if (tg) {
        renderTelegramCard(tg, tgCheck ? !!tgCheck.checked : !!tg.alerts_requested);
      }

      if (wa) {
        renderWhatsAppCard(wa, waCheck ? !!waCheck.checked : !!wa.alerts_requested);
      }

      patchAllPublicCopy();
    } catch (err) {
      console.error('APD telegram live refresh error:', err);
    }
  }

  function patchCargarPrefs() {
    if (typeof window.cargarPrefsEnFormulario !== 'function' || window.cargarPrefsEnFormulario.__apdLiveRefreshPatched) {
      return false;
    }

    const original = window.cargarPrefsEnFormulario;
    window.cargarPrefsEnFormulario = function () {
      const out = original.apply(this, arguments);
      setTimeout(refreshChannelStatusFromWorker, 0);
      setTimeout(refreshChannelStatusFromWorker, 700);
      setTimeout(patchAllPublicCopy, 900);
      return out;
    };
    window.cargarPrefsEnFormulario.__apdLiveRefreshPatched = true;
    return true;
  }

  function boot() {
    patchAllPublicCopy();
    const observer = new MutationObserver(patchAllPublicCopy);
    if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    let tries = 0;
    const tick = () => {
      tries += 1;
      patchAllPublicCopy();
      const done = patchCargarPrefs();
      if (done) {
        setTimeout(refreshChannelStatusFromWorker, 1200);
        return;
      }
      if (tries < 20) setTimeout(tick, 300);
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
