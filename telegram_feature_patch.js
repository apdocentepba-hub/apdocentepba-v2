(function () {
  'use strict';

  if (window.__apdTelegramFeaturePatchLoaded) return;
  window.__apdTelegramFeaturePatchLoaded = true;

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

  function findChecksHost(form) {
    const email = byId('pref-alertas-email');
    const whatsapp = byId('pref-alertas-whatsapp');
    const emailHost = email?.closest('label')?.parentElement;
    const whatsappHost = whatsapp?.closest('label')?.parentElement;

    if (emailHost && whatsappHost && emailHost === whatsappHost) return emailHost;
    if (emailHost) return emailHost;
    if (whatsappHost) return whatsappHost;
    return form.querySelector('.checks-grid') || form;
  }

  function ensureInlineCheck(form, id, labelText, afterId) {
    const host = findChecksHost(form);
    if (!host) return null;

    let input = byId(id);
    let label = input?.closest('label') || null;

    if (!label) {
      label = document.createElement('label');
      label.className = 'apd-inline-check';
      input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      label.appendChild(input);
      label.appendChild(document.createTextNode(` ${labelText}`));
    } else {
      label.classList.add('apd-inline-check');
      const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) {
        textNode.textContent = ` ${labelText}`;
      } else if (!label.textContent.includes(labelText)) {
        label.appendChild(document.createTextNode(` ${labelText}`));
      }
    }

    const afterLabel = byId(afterId)?.closest('label');
    if (afterLabel && afterLabel.parentElement === host) {
      if (afterLabel.nextSibling !== label) {
        host.insertBefore(label, afterLabel.nextSibling);
      }
    } else if (label.parentElement !== host) {
      host.appendChild(label);
    }

    label.style.display = '';
    label.style.marginRight = '18px';
    label.style.whiteSpace = 'nowrap';
    return input;
  }

  function ensureBoxes(form) {
    if (!form || byId('telegram-pref-box')) return;

    const actions = form.querySelector('.form-actions');
    if (!actions) return;

    const telegramBox = document.createElement('div');
    telegramBox.id = 'telegram-pref-box';
    telegramBox.className = 'channel-pref-box';
    telegramBox.style.cssText = 'margin-top:12px;padding:14px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:#fff';
    telegramBox.innerHTML = [
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">',
      '<strong style="color:#0f3460">📨 Telegram</strong>',
      '<span id="telegram-pref-pill" style="display:inline-block;padding:6px 10px;border-radius:999px;background:#eef4ff;color:#0f3460;border:1px solid #d6e4ff;font-size:12px;font-weight:700">Disponible</span>',
      '</div>',
      '<div id="telegram-pref-note" style="font-size:13px;line-height:1.45;color:#475569;margin-top:8px"></div>',
      '<div id="telegram-pref-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px"></div>',
      '<div id="telegram-pref-mini" style="font-size:12px;color:#64748b;margin-top:8px"></div>'
    ].join('');

    const whatsappBox = document.createElement('div');
    whatsappBox.id = 'whatsapp-pref-box';
    whatsappBox.className = 'channel-pref-box';
    whatsappBox.style.cssText = 'margin-top:12px;padding:14px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:#fff';
    whatsappBox.innerHTML = [
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">',
      '<strong style="color:#0f3460">💬 WhatsApp</strong>',
      '<span id="whatsapp-pref-pill" style="display:inline-block;padding:6px 10px;border-radius:999px;background:#eef4ff;color:#0f3460;border:1px solid #d6e4ff;font-size:12px;font-weight:700">Disponible</span>',
      '</div>',
      '<div id="whatsapp-pref-note" style="font-size:13px;line-height:1.45;color:#475569;margin-top:8px"></div>',
      '<div id="whatsapp-pref-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px"></div>',
      '<div id="whatsapp-pref-mini" style="font-size:12px;color:#64748b;margin-top:8px"></div>'
    ].join('');

    actions.parentNode.insertBefore(telegramBox, actions);
    actions.parentNode.insertBefore(whatsappBox, actions);
  }

  function ensureUi() {
    const form = byId('form-preferencias');
    if (!form) return;
    ensureInlineCheck(form, 'pref-alertas-telegram', 'Avisar por Telegram', 'pref-alertas-whatsapp');
    ensureInlineCheck(form, 'pref-alertas-whatsapp', 'Avisar por WhatsApp', 'pref-alertas-email');
    ensureBoxes(form);
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
    checkbox.checked = allowedByPlan ? isRequested : false;

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

    setPill(pill, isRequested ? 'Pendiente de conexión' : 'Pendiente', '#fff7ed', '#9a3412', '#fed7aa');
    note.textContent = botUser
      ? `Abrí el bot @${botUser}, tocá Iniciar y después ya vas a poder recibir alertas en Telegram.`
      : 'Abrí el bot de Telegram y tocá Iniciar para vincular el chat.';
    actions.innerHTML = botLink ? `<a class="btn btn-primary" href="${esc(botLink)}" target="_blank" rel="noopener noreferrer">Conectar Telegram</a>` : '';
    mini.textContent = `Incluido en ${planName || 'tu plan'}.`;
  }

  function renderWhatsAppStatus(status, requested) {
    ensureUi();
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
    checkbox.checked = allowedByPlan ? isRequested : false;

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
      ? 'Solo disponible en Insigne'
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
  }

  let lastTelegramStatus = null;
  let lastWhatsAppStatus = null;

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
        const pref = await orig.apply(this, arguments) || {};
        const [tg, wa] = await Promise.all([
          fetchTelegramStatus(userId),
          fetchWhatsAppStatus(userId)
        ]);

        if (typeof pref.alertas_telegram !== 'boolean') {
          pref.alertas_telegram = requestedFlag(tg, false);
        }
        if (typeof pref.alertas_whatsapp !== 'boolean') {
          pref.alertas_whatsapp = requestedFlag(wa, false);
        }

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
        ensureUi();

        const pref = data?.preferencias || {};
        const tgRequested = !!pref.alertas_telegram;
        const waRequested = !!pref.alertas_whatsapp;

        const tgCheck = byId('pref-alertas-telegram');
        const waCheck = byId('pref-alertas-whatsapp');
        if (tgCheck) tgCheck.checked = tgRequested;
        if (waCheck) waCheck.checked = waRequested;

        lastTelegramStatus = {
          connected: !!pref.telegram_connected,
          allowed_by_plan: pref.telegram_allowed_by_plan !== false,
          plan_name: pref.telegram_plan_name || '',
          plan_code: pref.telegram_plan_code || '',
          bot_link: pref.telegram_bot_link || '',
          bot_username: pref.telegram_bot_username || '',
          chat_id_masked: pref.telegram_chat_id_masked || '',
          username: pref.telegram_username || ''
        };

        lastWhatsAppStatus = {
          connected: !!pref.whatsapp_connected,
          allowed_by_plan: !!pref.whatsapp_allowed_by_plan,
          plan_name: pref.whatsapp_plan_name || '',
          plan_code: pref.whatsapp_plan_code || '',
          phone_masked: pref.whatsapp_phone_masked || '',
          connect_hint: pref.whatsapp_connect_hint || ''
        };

        renderTelegramStatus(lastTelegramStatus, tgRequested);
        renderWhatsAppStatus(lastWhatsAppStatus, waRequested);

        renderChannelSummary(pref);
        return out;
      };
      window.cargarPrefsEnFormulario.__channelsPatched = true;
    }
  }

  function bindPreviewOnChange(id, type) {
    const box = byId(id);
    if (!box || box.dataset.channelsBound === '1') return;
    box.addEventListener('change', () => {
      const requested = !!box.checked;
      if (type === 'telegram') {
        renderTelegramStatus(lastTelegramStatus || { allowed_by_plan: true }, requested);
      } else {
        renderWhatsAppStatus(lastWhatsAppStatus || { allowed_by_plan: !box.disabled }, requested);
      }
    });
    box.dataset.channelsBound = '1';
  }

  function boot() {
    let tries = 0;
    const tick = () => {
      tries += 1;
      ensureUi();
      patchFunctions();
      bindPreviewOnChange('pref-alertas-telegram', 'telegram');
      bindPreviewOnChange('pref-alertas-whatsapp', 'whatsapp');
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
