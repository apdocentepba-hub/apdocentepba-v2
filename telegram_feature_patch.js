(function () {
  'use strict';

  if (window.__apdTelegramFeaturePatchLoaded) return;
  window.__apdTelegramFeaturePatchLoaded = true;

  function byId(id) { return document.getElementById(id); }
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

  function patchPlanesPayload(data) {
    const copy = data && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data;
    const planes = Array.isArray(copy?.planes) ? copy.planes : [];
    planes.forEach((plan) => {
      const code = String(plan?.code || plan?.display_code || '').trim().toUpperCase();
      const flags = (plan && typeof plan.feature_flags === 'object' && plan.feature_flags) ? plan.feature_flags : {};
      flags.email = true;
      flags.telegram = true;
      flags.telegram_coming_soon = false;
      flags.whatsapp = code === 'INSIGNE';
      flags.whatsapp_coming_soon = false;
      plan.feature_flags = flags;

      const limits = [];
      const normales = Number(plan?.max_distritos_normales || plan?.max_distritos || 1) || 1;
      const emergencia = Number(plan?.max_distritos_emergencia || 0) || 0;
      const cargos = Number(plan?.max_cargos || 2) || 2;

      if (emergencia > 0) {
        limits.push(`${normales} distritos principales + ${emergencia} de emergencia`);
      } else {
        limits.push(`${Number(plan?.max_distritos || normales + emergencia || 1)} distrito(s)`);
      }
      limits.push(`${cargos} materias/cargos`);
      limits.push('Email incluido');
      limits.push('Telegram incluido');
      limits.push(code === 'INSIGNE' ? 'WhatsApp incluido' : 'WhatsApp solo en Insigne');
      plan.features = limits;

      if (code === 'INSIGNE') {
        plan.descripcion = 'Cobertura máxima: 3 distritos principales + 2 de emergencia, hasta 10 materias/cargos, email y Telegram incluidos. WhatsApp disponible solo en este plan.';
      } else if (code === 'PREMIUM' || code === 'PRO') {
        plan.descripcion = 'Cobertura fuerte para multiplicar oportunidades: email y Telegram incluidos. WhatsApp reservado para Insigne.';
      } else if (code === 'PLUS') {
        plan.descripcion = 'Más alcance sin irte de presupuesto: email y Telegram incluidos. WhatsApp reservado para Insigne.';
      } else if (code === 'TRIAL_7D') {
        plan.descripcion = 'Probá APDocentePBA durante 7 días con email y Telegram incluidos. WhatsApp reservado para Insigne.';
      }
    });
    return copy;
  }

  function patchWorkerFetchJson() {
    if (typeof window.workerFetchJson !== 'function' || window.workerFetchJson.__apdChannelsPatched) return;

    const original = window.workerFetchJson;
    window.workerFetchJson = async function () {
      const path = String(arguments[0] || '');
      const data = await original.apply(this, arguments);

      if (path === '/api/planes' || path.startsWith('/api/planes?')) {
        return patchPlanesPayload(data);
      }

      return data;
    };
    window.workerFetchJson.__apdChannelsPatched = true;
  }

  async function fetchTelegramStatus(userId) {
    if (!userId || typeof window.workerFetchJson !== 'function') return null;
    try {
      return await window.workerFetchJson(`/api/telegram/status?user_id=${encodeURIComponent(userId)}`);
    } catch {
      return null;
    }
  }

  async function fetchWhatsAppStatus(userId) {
    if (!userId || typeof window.workerFetchJson !== 'function') return null;
    try {
      return await window.workerFetchJson(`/api/whatsapp/status?user_id=${encodeURIComponent(userId)}`);
    } catch {
      return null;
    }
  }

  function requestedFlag(status, fallback) {
    if (status && typeof status.alerts_requested === 'boolean') return status.alerts_requested;
    return !!fallback;
  }

  function ensureCheck(checks, id, labelText) {
    if (!checks || byId(id)) return;
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" id="${id}"> ${labelText}`;
    checks.appendChild(label);
  }

  function ensureBox(form, id, title, pillId, noteId, actionsId, miniId) {
    if (byId(id)) return;
    const box = document.createElement('div');
    box.id = id;
    box.className = 'channel-pref-box';
    box.style.cssText = 'margin-top:12px;padding:14px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:#fff';
    box.innerHTML = [
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">',
      `<strong style="color:#0f3460">${title}</strong>`,
      `<span id="${pillId}" style="display:inline-block;padding:6px 10px;border-radius:999px;background:#eef4ff;color:#0f3460;border:1px solid #d6e4ff;font-size:12px;font-weight:700">Disponible</span>`,
      '</div>',
      `<div id="${noteId}" style="font-size:13px;line-height:1.45;color:#475569;margin-top:8px"></div>`,
      `<div id="${actionsId}" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px"></div>`,
      `<div id="${miniId}" style="font-size:12px;color:#64748b;margin-top:8px"></div>`
    ].join('');
    const actions = form.querySelector('.form-actions');
    if (actions) actions.parentNode.insertBefore(box, actions);
  }

  function ensureUi() {
    const form = byId('form-preferencias');
    if (!form) return;

    const checks = form.querySelector('.checks-grid');
    ensureCheck(checks, 'pref-alertas-telegram', 'Avisar por Telegram');
    ensureCheck(checks, 'pref-alertas-whatsapp', 'Avisar por WhatsApp');

    ensureBox(
      form,
      'telegram-pref-box',
      '📨 Telegram',
      'telegram-pref-pill',
      'telegram-pref-note',
      'telegram-pref-actions',
      'telegram-pref-mini'
    );

    ensureBox(
      form,
      'whatsapp-pref-box',
      '💬 WhatsApp',
      'whatsapp-pref-pill',
      'whatsapp-pref-note',
      'whatsapp-pref-actions',
      'whatsapp-pref-mini'
    );
  }

  function setPill(pill, text, bg, color, border) {
    if (!pill) return;
    pill.textContent = text;
    pill.style.background = bg;
    pill.style.color = color;
    pill.style.borderColor = border;
  }

  function renderTelegramStatus(status, requested) {
    ensureUi();

    const pill = byId('telegram-pref-pill');
    const note = byId('telegram-pref-note');
    const actions = byId('telegram-pref-actions');
    const mini = byId('telegram-pref-mini');
    const checkbox = byId('pref-alertas-telegram');

    if (!pill || !note || !actions || !mini) return;

    const connected = !!status?.connected;
    const botLink = String(status?.bot_link || '').trim();
    const botUser = String(status?.bot_username || '').replace(/^@+/, '').trim();
    const masked = String(status?.chat_id_masked || '').trim();
    const user = String(status?.username || '').trim();
    const allowedByPlan = status?.allowed_by_plan !== false;
    const planName = planDisplayName(status?.plan_name || status?.plan_code || '');
    const isRequested = requestedFlag(status, requested);

    if (checkbox) {
      checkbox.disabled = !allowedByPlan;
      checkbox.checked = allowedByPlan ? isRequested : false;
    }

    if (!allowedByPlan) {
      setPill(pill, 'No incluido', '#f8fafc', '#475569', '#cbd5e1');
      note.textContent = `Telegram no está habilitado para ${planName}.`;
      actions.innerHTML = '';
      mini.textContent = '';
      return;
    }

    if (connected) {
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
      actions.innerHTML = botLink ? `<a class="btn btn-outline" href="${esc(botLink)}" target="_blank" rel="noopener noreferrer">Abrir bot</a>` : '';
      mini.textContent = [planName ? `Plan: ${planName}` : '', masked ? `Chat: ${masked}` : '', user ? `Usuario: @${user}` : '']
        .filter(Boolean)
        .join(' · ');
      return;
    }

    if (botLink) {
      setPill(pill, isRequested ? 'Pendiente de conexión' : 'Pendiente', '#fff7ed', '#9a3412', '#fed7aa');
      note.textContent = botUser
        ? `Abrí el bot @${botUser}, tocá Iniciar y después ya vas a poder recibir alertas en Telegram.`
        : 'Abrí el bot de Telegram y tocá Iniciar para vincular el chat.';
      actions.innerHTML = `<a class="btn btn-primary" href="${esc(botLink)}" target="_blank" rel="noopener noreferrer">Conectar Telegram</a>`;
      mini.textContent = `Incluido en ${planName || 'tu plan'}.`;
      return;
    }

    setPill(pill, 'Sin configurar', '#fff7ed', '#9a3412', '#fed7aa');
    note.textContent = 'Falta configurar el bot o el webhook de Telegram en el worker.';
    actions.innerHTML = '';
    mini.textContent = '';
  }

  function renderWhatsAppStatus(status, requested) {
    ensureUi();

    const pill = byId('whatsapp-pref-pill');
    const note = byId('whatsapp-pref-note');
    const actions = byId('whatsapp-pref-actions');
    const mini = byId('whatsapp-pref-mini');
    const checkbox = byId('pref-alertas-whatsapp');

    if (!pill || !note || !actions || !mini) return;

    const allowedByPlan = !!status?.allowed_by_plan;
    const connected = !!status?.connected;
    const planName = planDisplayName(status?.plan_name || status?.plan_code || '');
    const phoneMasked = String(status?.phone_masked || '').trim();
    const connectHint = String(status?.connect_hint || '').trim();
    const isRequested = requestedFlag(status, requested);

    if (checkbox) {
      checkbox.disabled = !allowedByPlan;
      checkbox.checked = allowedByPlan ? isRequested : false;
    }

    if (!allowedByPlan) {
      setPill(pill, 'No incluido', '#f8fafc', '#475569', '#cbd5e1');
      note.textContent = `WhatsApp queda reservado para Insigne. Con ${planName || 'tu plan'} podés usar email y Telegram.`;
      actions.innerHTML = '';
      mini.textContent = '';
      return;
    }

    if (connected) {
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

    setPill(pill, isRequested ? 'Pendiente de conexión' : 'Pendiente', '#fff7ed', '#9a3412', '#fed7aa');
    note.textContent = connectHint || 'Escribí al número del bot desde tu WhatsApp para vincularlo y consultar alertas.';
    actions.innerHTML = '';
    mini.textContent = planName ? `Incluido en ${planName}.` : '';
  }

  function renderChannelSummary(pref) {
    const telegramAllowed = pref.telegram_allowed_by_plan !== false;
    const telegramRequested = !!pref.alertas_telegram;
    const telegramLabel = !telegramAllowed
      ? `No incluido en ${planDisplayName(pref.telegram_plan_name || pref.telegram_plan_code || '')}`
      : pref.telegram_connected
        ? (telegramRequested ? 'Conectado y activo' : 'Conectado')
        : (telegramRequested ? 'Pendiente de conexión' : 'No conectado');

    const whatsappAllowed = !!pref.whatsapp_allowed_by_plan;
    const whatsappRequested = !!pref.alertas_whatsapp;
    const whatsappLabel = !whatsappAllowed
      ? `Solo disponible en Insigne`
      : pref.whatsapp_connected
        ? (whatsappRequested ? 'Conectado y activo' : 'Conectado')
        : (whatsappRequested ? 'Pendiente de conexión' : 'No conectado');

    const resumen = byId('panel-preferencias-resumen');
    if (resumen) {
      let tg = resumen.querySelector('[data-telegram-summary="1"]');
      if (!tg) {
        resumen.insertAdjacentHTML('beforeend', '<p data-telegram-summary="1"><strong>Telegram:</strong> -</p>');
        tg = resumen.querySelector('[data-telegram-summary="1"]');
      }
      if (tg) tg.innerHTML = `<strong>Telegram:</strong> ${esc(telegramLabel)}`;

      let wa = resumen.querySelector('[data-whatsapp-summary="1"]');
      if (!wa) {
        resumen.insertAdjacentHTML('beforeend', '<p data-whatsapp-summary="1"><strong>WhatsApp:</strong> -</p>');
        wa = resumen.querySelector('[data-whatsapp-summary="1"]');
      }
      if (wa) wa.innerHTML = `<strong>WhatsApp:</strong> ${esc(whatsappLabel)}`;
    }

    const canales = byId('panel-canales');
    if (canales) {
      canales.innerHTML = `
        <div class="plan-stack">
          <div class="plan-pill-row"><span class="plan-pill">📧 Email</span><span class="plan-pill plan-pill-neutral">Incluido</span></div>
          <p class="plan-note">Canal principal estable para recibir digest de alertas por Brevo.</p>

          <div class="plan-pill-row"><span class="plan-pill">📨 Telegram</span><span class="plan-pill plan-pill-neutral">${esc(telegramLabel)}</span></div>
          <p class="plan-note">Telegram queda disponible en todos los planes y puede enviar alertas automáticas cuando el chat ya está vinculado.</p>

          <div class="plan-pill-row"><span class="plan-pill">💬 WhatsApp</span><span class="plan-pill plan-pill-neutral">${esc(whatsappLabel)}</span></div>
          <p class="plan-note">WhatsApp se reserva para Insigne y queda orientado a consultas para bajar costo.</p>
        </div>`;
    }
  }

  function patchFunctions() {
    patchWorkerFetchJson();

    if (typeof window.buildPreferenciasPayload === 'function' && !window.buildPreferenciasPayload.__channelsPatched) {
      const orig = window.buildPreferenciasPayload;
      window.buildPreferenciasPayload = function () {
        const out = orig.apply(this, arguments) || {};
        out.alertas_telegram = !!byId('pref-alertas-telegram')?.checked;
        out.alertas_whatsapp = !!byId('pref-alertas-whatsapp')?.checked;
        return out;
      };
      window.buildPreferenciasPayload.__channelsPatched = true;
    }

    if (typeof window.obtenerPreferenciasPorUserId === 'function' && !window.obtenerPreferenciasPorUserId.__channelsPatched) {
      const orig = window.obtenerPreferenciasPorUserId;
      window.obtenerPreferenciasPorUserId = async function (userId) {
        const pref = await orig.apply(this, arguments);
        const [tg, wa] = await Promise.all([
          fetchTelegramStatus(userId),
          fetchWhatsAppStatus(userId)
        ]);

        pref.alertas_telegram = requestedFlag(tg, pref.alertas_telegram);
        pref.alertas_whatsapp = requestedFlag(wa, pref.alertas_whatsapp);

        if (tg) {
          pref.telegram_connected = !!tg.connected;
          pref.telegram_allowed_by_plan = tg.allowed_by_plan !== false;
          pref.telegram_plan_name = tg.plan_name || tg.plan_code || '';
          pref.telegram_plan_code = tg.plan_code || '';
          pref.telegram_bot_link = tg.bot_link || '';
          pref.telegram_bot_username = tg.bot_username || '';
          pref.telegram_chat_id_masked = tg.chat_id_masked || '';
          pref.telegram_username = tg.username || '';
        } else {
          pref.telegram_allowed_by_plan = true;
        }

        if (wa) {
          pref.whatsapp_connected = !!wa.connected;
          pref.whatsapp_allowed_by_plan = !!wa.allowed_by_plan;
          pref.whatsapp_plan_name = wa.plan_name || wa.plan_code || '';
          pref.whatsapp_plan_code = wa.plan_code || '';
          pref.whatsapp_phone_masked = wa.phone_masked || '';
          pref.whatsapp_connect_hint = wa.connect_hint || '';
        }

        return pref;
      };
      window.obtenerPreferenciasPorUserId.__channelsPatched = true;
    }

    if (typeof window.cargarPrefsEnFormulario === 'function' && !window.cargarPrefsEnFormulario.__channelsPatched) {
      const orig = window.cargarPrefsEnFormulario;
      window.cargarPrefsEnFormulario = function (data) {
        const out = orig.apply(this, arguments);
        const pref = data?.preferencias || {};
        renderTelegramStatus({
          connected: !!pref.telegram_connected,
          allowed_by_plan: pref.telegram_allowed_by_plan !== false,
          plan_name: pref.telegram_plan_name || '',
          plan_code: pref.telegram_plan_code || '',
          bot_link: pref.telegram_bot_link || '',
          bot_username: pref.telegram_bot_username || '',
          chat_id_masked: pref.telegram_chat_id_masked || '',
          username: pref.telegram_username || ''
        }, !!pref.alertas_telegram);
        renderWhatsAppStatus({
          connected: !!pref.whatsapp_connected,
          allowed_by_plan: !!pref.whatsapp_allowed_by_plan,
          plan_name: pref.whatsapp_plan_name || '',
          plan_code: pref.whatsapp_plan_code || '',
          phone_masked: pref.whatsapp_phone_masked || '',
          connect_hint: pref.whatsapp_connect_hint || ''
        }, !!pref.alertas_whatsapp);
        renderChannelSummary(pref);
        return out;
      };
      window.cargarPrefsEnFormulario.__channelsPatched = true;
    }

    if (typeof window.cargarDashboard === 'function' && !window.cargarDashboard.__channelsPatched) {
      const orig = window.cargarDashboard;
      window.cargarDashboard = async function () {
        const out = await orig.apply(this, arguments);
        const userId = typeof window.obtenerToken === 'function' ? window.obtenerToken() : '';
        const [tg, wa] = await Promise.all([
          fetchTelegramStatus(userId),
          fetchWhatsAppStatus(userId)
        ]);

        const telegramRequested = requestedFlag(tg, false);
        const whatsappRequested = requestedFlag(wa, false);

        renderTelegramStatus(tg || { allowed_by_plan: true }, telegramRequested);
        renderWhatsAppStatus(wa || { allowed_by_plan: false }, whatsappRequested);

        renderChannelSummary({
          alertas_telegram: telegramRequested,
          telegram_connected: !!tg?.connected,
          telegram_allowed_by_plan: tg?.allowed_by_plan !== false,
          telegram_plan_name: tg?.plan_name || tg?.plan_code || '',
          telegram_plan_code: tg?.plan_code || '',
          alertas_whatsapp: whatsappRequested,
          whatsapp_connected: !!wa?.connected,
          whatsapp_allowed_by_plan: !!wa?.allowed_by_plan,
          whatsapp_plan_name: wa?.plan_name || wa?.plan_code || '',
          whatsapp_plan_code: wa?.plan_code || ''
        });

        return out;
      };
      window.cargarDashboard.__channelsPatched = true;
    }
  }

  function bindCheckbox(id, fetcher, renderer) {
    const box = byId(id);
    if (!box || box.dataset.channelsBound === '1') return;
    box.addEventListener('change', async () => {
      const userId = typeof window.obtenerToken === 'function' ? window.obtenerToken() : '';
      const status = await fetcher(userId);
      renderer(status || {}, box.checked);
    });
    box.dataset.channelsBound = '1';
  }

  function boot() {
    let tries = 0;
    const tick = () => {
      tries += 1;
      ensureUi();
      patchFunctions();
      bindCheckbox('pref-alertas-telegram', fetchTelegramStatus, renderTelegramStatus);
      bindCheckbox('pref-alertas-whatsapp', fetchWhatsAppStatus, renderWhatsAppStatus);

      if (tries < 20 && (!byId('form-preferencias') || typeof window.buildPreferenciasPayload !== 'function')) {
        setTimeout(tick, 500);
      }
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
