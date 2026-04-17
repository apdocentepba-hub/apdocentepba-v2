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
    if (key === 'PREMIUM' || key === 'PRO') return 'Pro';
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
        ? 'WhatsApp quedó listo para consultas desde el número vinculado.'
        : 'WhatsApp ya está vinculado, pero el canal está apagado en tus preferencias.';
      actions.innerHTML = '';
      mini.textContent = [planName ? `Plan: ${planName}` : '', phoneMasked ? `Número: ${phoneMasked}` : '']
        .filter(Boolean)
        .join(' · ');
      return;
    }

    checkbox.checked = isRequested;
    setPill(pill, isRequested ? 'Pendiente de conexión' : 'Pendiente', '#fff7ed', '#9a3412', '#fed7aa');
    note.textContent = connectHint || 'Escribí al número del bot desde tu WhatsApp para vincularlo y consultar alertas.';
    actions.innerHTML = '';
    mini.textContent = planName ? `Incluido en ${planName}.` : '';
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
      return out;
    };
    window.cargarPrefsEnFormulario.__apdLiveRefreshPatched = true;
    return true;
  }

  function boot() {
    let tries = 0;
    const tick = () => {
      tries += 1;
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
