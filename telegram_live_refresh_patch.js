(function () {
  'use strict';

  if (window.__apdTelegramLiveRefreshLoaded) return;
  window.__apdTelegramLiveRefreshLoaded = true;

  function byId(id) { return document.getElementById(id); }
  function esc(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;'); }
  function planCode(raw) { return String(raw || '').trim().toUpperCase(); }
  function isInsigne(raw) { return /\bINSIGNE\b/i.test(String(raw || '')); }

  function planDisplayName(raw) {
    const key = planCode(raw);
    if (!key) return 'tu plan';
    if (key === 'FREE') return 'Gratis';
    if (key === 'COMPLETO') return 'Completo';
    if (key === 'TRIAL_14D') return 'Prueba de Completo';
    if (key === 'TRIAL_7D') return 'Prueba 7 días';
    if (key === 'PLUS') return 'Plus';
    if (key === 'PREMIUM' || key === 'PRO') return 'Premium';
    if (key === 'INSIGNE') return 'Insigne';
    return key;
  }

  function currentPlanText() {
    return [
      byId('panel-plan')?.textContent || '',
      byId('panel-datos-docente')?.textContent || '',
      byId('panel-preferencias-resumen')?.textContent || '',
      byId('panel-canales')?.textContent || ''
    ].join(' ');
  }

  function allowedByPlan(status, channel) {
    return status?.allowed_by_plan === true;
  }

  function setPill(pill, text, bg, color, border) {
    if (!pill) return;
    pill.textContent = text;
    pill.style.background = bg;
    pill.style.color = color;
    pill.style.borderColor = border;
  }

  function normalizePhone(raw) {
    const digits = String(raw || '').replace(/\D+/g, '');
    if (!digits || digits.length < 8 || /x/i.test(String(raw || ''))) return '';
    return digits;
  }

  function whatsappBotUrl(status) {
    const direct = String(status?.bot_link || status?.whatsapp_link || status?.wa_link || status?.connect_url || status?.deep_link || '').trim();
    if (/^https?:\/\//i.test(direct)) return direct;
    const phone = normalizePhone(status?.bot_phone || status?.whatsapp_phone || status?.phone || status?.phone_e164 || status?.from_number || status?.business_phone || '');
    return phone ? `https://wa.me/${phone}?text=ALERTAS` : '';
  }

  function dedupeSummary() {
    const resumen = byId('panel-preferencias-resumen');
    if (!resumen) return;

    const rows = Array.from(resumen.querySelectorAll('p, div, li'))
      .filter(el => /^\s*(Telegram|WhatsApp)\s*:/i.test(String(el.textContent || '').trim()));

    const seen = { telegram: false, whatsapp: false };
    rows.forEach(el => {
      const text = String(el.textContent || '').trim();
      const key = /^Telegram\s*:/i.test(text) ? 'telegram' : /^WhatsApp\s*:/i.test(text) ? 'whatsapp' : '';
      if (!key) return;
      if (seen[key]) {
        el.remove();
        return;
      }
      seen[key] = true;
    });
  }

  function setSummaryLine(label, value) {
    const resumen = byId('panel-preferencias-resumen');
    if (!resumen) return;
    dedupeSummary();

    const rows = Array.from(resumen.querySelectorAll('p, div, li'));
    let row = rows.find(el => new RegExp('^\\s*' + label + '\\s*:', 'i').test(String(el.textContent || '').trim()));
    if (!row) {
      row = document.createElement('p');
      row.dataset.apdChannelSummary = label.toLowerCase();
      resumen.appendChild(row);
    }
    row.innerHTML = `<strong>${label}:</strong> ${esc(value)}`;
    dedupeSummary();
  }

  function cleanInicioChannels() {
    dedupeSummary();
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
    const allowed = allowedByPlan(status, 'telegram');
    const planName = planDisplayName(status?.plan_name || status?.plan_code || currentPlanText());
    const isRequested = !!requested;

    checkbox.disabled = !allowed;

    if (!allowed) {
      checkbox.checked = false;
      setPill(pill, 'Según plan', '#f8fafc', '#475569', '#cbd5e1');
      note.textContent = `Telegram: acceso no confirmado para tu plan.`;
      actions.innerHTML = '';
      mini.textContent = planName ? `Plan detectado: ${planName}` : '';
      cleanInicioChannels();
      return;
    }

    checkbox.checked = isRequested;

    if (connected) {
      setPill(pill, isRequested ? 'Conectado y activo' : 'Conectado', isRequested ? '#ecfdf3' : '#eef4ff', isRequested ? '#166534' : '#0f3460', isRequested ? '#bbf7d0' : '#d6e4ff');
      note.textContent = isRequested ? 'Telegram quedó listo para enviar alertas automáticas al chat vinculado.' : 'Telegram ya está vinculado, pero el canal está apagado en tus preferencias.';
      actions.innerHTML = botLink ? `<a class="btn btn-outline" href="${esc(botLink)}" target="_blank" rel="noopener noreferrer">Abrir bot</a>` : '';
      mini.textContent = [planName ? `Plan: ${planName}` : '', masked ? `Chat: ${masked}` : '', user ? `Usuario: @${user}` : ''].filter(Boolean).join(' · ');
      setSummaryLine('Telegram', isRequested ? 'Conectado y activo' : 'Conectado');
      cleanInicioChannels();
      return;
    }

    setPill(pill, isRequested ? 'Pendiente de conexión' : 'Disponible', '#fff7ed', '#9a3412', '#fed7aa');
    note.textContent = botUser ? `Abrí el bot @${botUser}, tocá Iniciar y después ya vas a poder recibir alertas en Telegram.` : 'Telegram está disponible. Abrí el bot y tocá Iniciar para vincular el chat.';
    actions.innerHTML = botLink ? `<a class="btn btn-primary" href="${esc(botLink)}" target="_blank" rel="noopener noreferrer">Conectar Telegram</a>` : '';
    mini.textContent = `Incluido en ${planName || 'tu plan'}.`;
    setSummaryLine('Telegram', isRequested ? 'Pendiente de conexión' : 'Disponible');
    cleanInicioChannels();
  }

  function renderWhatsAppCard(status, requested) {
    const pill = byId('whatsapp-pref-pill');
    const note = byId('whatsapp-pref-note');
    const actions = byId('whatsapp-pref-actions');
    const mini = byId('whatsapp-pref-mini');
    const checkbox = byId('pref-alertas-whatsapp');
    if (!pill || !note || !actions || !mini || !checkbox) return;

    const allowed = allowedByPlan(status, 'whatsapp');
    const connected = !!status?.connected;
    const planName = planDisplayName(status?.plan_name || status?.plan_code || currentPlanText());
    const phoneMasked = String(status?.phone_masked || '').trim();
    const connectHint = String(status?.connect_hint || '').trim();
    const isRequested = !!requested;
    const botUrl = whatsappBotUrl(status || {});

    checkbox.disabled = !allowed;

    if (!allowed) {
      checkbox.checked = false;
      setPill(pill, 'Según plan', '#f8fafc', '#475569', '#cbd5e1');
      note.textContent = 'WhatsApp: acceso no confirmado para tu plan.';
      actions.innerHTML = botUrl ? `<a class="btn btn-primary" href="${esc(botUrl)}" target="_blank" rel="noopener noreferrer">Abrir bot de WhatsApp</a>` : '';
      mini.textContent = planName ? `Plan detectado: ${planName}` : '';
      cleanInicioChannels();
      return;
    }

    checkbox.checked = isRequested;

    if (connected) {
      setPill(pill, isRequested ? 'Conectado y activo' : 'Conectado', isRequested ? '#ecfdf3' : '#eef4ff', isRequested ? '#166534' : '#0f3460', isRequested ? '#bbf7d0' : '#d6e4ff');
      note.textContent = isRequested ? 'WhatsApp quedó listo para consultas desde el número vinculado. Escribí ALERTAS en el bot.' : 'WhatsApp ya está vinculado, pero el canal está apagado en tus preferencias. Igual podés abrir el bot y escribir ALERTAS.';
      actions.innerHTML = botUrl ? `<a class="btn btn-primary" href="${esc(botUrl)}" target="_blank" rel="noopener noreferrer">Abrir bot de WhatsApp</a>` : '';
      mini.textContent = [planName ? `Plan: ${planName}` : '', phoneMasked ? `Número: ${phoneMasked}` : ''].filter(Boolean).join(' · ');
      setSummaryLine('WhatsApp', isRequested ? 'Conectado y activo' : 'Conectado');
      cleanInicioChannels();
      return;
    }

    setPill(pill, isRequested ? 'Pendiente de conexión' : 'Disponible', '#fff7ed', '#9a3412', '#fed7aa');
    note.textContent = connectHint || 'WhatsApp está incluido en tu plan. Funciona por consulta manual: escribí ALERTAS en el bot.';
    actions.innerHTML = botUrl ? `<a class="btn btn-primary" href="${esc(botUrl)}" target="_blank" rel="noopener noreferrer">Abrir bot de WhatsApp</a>` : '';
    mini.textContent = planName ? `Incluido en ${planName}.` : '';
    setSummaryLine('WhatsApp', isRequested ? 'Pendiente de conexión' : 'Disponible');
    cleanInicioChannels();
  }

  async function refreshChannelStatusFromWorker() {
    try {
      if (typeof window.workerFetchJson !== 'function' || typeof window.obtenerToken !== 'function') {
        cleanInicioChannels();
        return;
      }

      const userId = String(window.obtenerToken() || '').trim();
      if (!userId) {
        cleanInicioChannels();
        return;
      }

      const [tg, wa] = await Promise.all([
        window.workerFetchJson(`/api/telegram/status?user_id=${encodeURIComponent(userId)}`).catch(() => null),
        window.workerFetchJson(`/api/whatsapp/status?user_id=${encodeURIComponent(userId)}`).catch(() => null)
      ]);

      if (String(window.obtenerToken() || '').trim() !== userId) return;
      const tgCheck = byId('pref-alertas-telegram');
      const waCheck = byId('pref-alertas-whatsapp');

      renderTelegramCard(tg, tg?.alerts_requested === true);
      renderWhatsAppCard(wa, wa?.alerts_requested === true);
      cleanInicioChannels();
    } catch (err) {
      console.error('APD telegram live refresh error:', err);
      cleanInicioChannels();
    }
  }

  function patchCargarPrefs() {
    if (typeof window.cargarPrefsEnFormulario !== 'function' || window.cargarPrefsEnFormulario.__apdLiveRefreshPatched) return false;
    const original = window.cargarPrefsEnFormulario;
    window.cargarPrefsEnFormulario = function () {
      const out = original.apply(this, arguments);
      setTimeout(refreshChannelStatusFromWorker, 0);
      setTimeout(refreshChannelStatusFromWorker, 700);
      setTimeout(cleanInicioChannels, 1200);
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
      cleanInicioChannels();
      if (done) {
        setTimeout(refreshChannelStatusFromWorker, 1200);
        setTimeout(cleanInicioChannels, 2500);
      }
      if (tries < 30) setTimeout(tick, 500);
    };
    tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
