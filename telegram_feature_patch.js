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
      .replace(/"/g, '&quot;');
  }

  async function fetchTelegramStatus(userId) {
    if (!userId || typeof window.workerFetchJson !== 'function') return null;
    try {
      return await window.workerFetchJson(`/api/telegram/status?user_id=${encodeURIComponent(userId)}`);
    } catch {
      return null;
    }
  }

  function ensureUi() {
    const form = byId('form-preferencias');
    if (!form) return;

    const checks = form.querySelector('.checks-grid');
    if (checks && !byId('pref-alertas-telegram')) {
      const label = document.createElement('label');
      label.innerHTML = '<input type="checkbox" id="pref-alertas-telegram"> Avisar por Telegram';
      checks.appendChild(label);
    }

    if (!byId('telegram-pref-box')) {
      const box = document.createElement('div');
      box.id = 'telegram-pref-box';
      box.className = 'telegram-pref-box';
      box.style.cssText = 'margin-top:12px;padding:14px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:#fff';
      box.innerHTML = [
        '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">',
        '<strong style="color:#0f3460">📨 Telegram</strong>',
        '<span id="telegram-pref-pill" style="display:inline-block;padding:6px 10px;border-radius:999px;background:#eef4ff;color:#0f3460;border:1px solid #d6e4ff;font-size:12px;font-weight:700">Disponible</span>',
        '</div>',
        '<div id="telegram-pref-note" style="font-size:13px;line-height:1.45;color:#475569;margin-top:8px">Podés vincular un chat de Telegram para recibir alertas por ese canal.</div>',
        '<div id="telegram-pref-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px"></div>',
        '<div id="telegram-pref-mini" style="font-size:12px;color:#64748b;margin-top:8px"></div>'
      ].join('');
      const actions = form.querySelector('.form-actions');
      if (actions) actions.parentNode.insertBefore(box, actions);
    }
  }

  function renderStatus(status, enabled) {
    ensureUi();
    const pill = byId('telegram-pref-pill');
    const note = byId('telegram-pref-note');
    const actions = byId('telegram-pref-actions');
    const mini = byId('telegram-pref-mini');
    const checkbox = byId('pref-alertas-telegram');
    if (checkbox && typeof enabled === 'boolean') checkbox.checked = enabled;
    if (!pill || !note || !actions || !mini) return;

    const connected = !!status?.connected;
    const botLink = String(status?.bot_link || '').trim();
    const botUser = String(status?.bot_username || '').replace(/^@+/, '').trim();
    const masked = String(status?.chat_id_masked || '').trim();
    const user = String(status?.username || '').trim();

    if (connected) {
      pill.textContent = enabled ? 'Conectado y activo' : 'Conectado';
      pill.style.background = enabled ? '#ecfdf3' : '#eef4ff';
      pill.style.color = enabled ? '#166534' : '#0f3460';
      pill.style.borderColor = enabled ? '#bbf7d0' : '#d6e4ff';
      note.textContent = enabled
        ? 'Telegram ya quedó activo como canal de alertas.'
        : 'Telegram ya está vinculado, pero el canal está apagado en tus preferencias.';
      actions.innerHTML = botLink ? `<a class="btn btn-outline" href="${esc(botLink)}" target="_blank" rel="noopener noreferrer">Abrir bot</a>` : '';
      mini.textContent = [masked ? `Chat: ${masked}` : '', user ? `Usuario: @${user}` : ''].filter(Boolean).join(' · ');
    } else if (botLink) {
      pill.textContent = 'Pendiente';
      pill.style.background = '#fff7ed';
      pill.style.color = '#9a3412';
      pill.style.borderColor = '#fed7aa';
      note.textContent = botUser
        ? `Abrí el bot @${botUser}, tocá Iniciar y después guardá tus preferencias.`
        : 'Abrí el bot de Telegram y tocá Iniciar para vincular el chat.';
      actions.innerHTML = `<a class="btn btn-primary" href="${esc(botLink)}" target="_blank" rel="noopener noreferrer">Conectar Telegram</a>`;
      mini.textContent = 'La vinculación usa un enlace seguro generado para tu cuenta.';
    } else {
      pill.textContent = 'Sin configurar';
      note.textContent = 'Falta configurar el bot de Telegram en el worker.';
      actions.innerHTML = '';
      mini.textContent = '';
    }

    const resumen = byId('panel-preferencias-resumen');
    if (resumen) {
      let node = resumen.querySelector('[data-telegram-summary="1"]');
      if (!node) {
        resumen.insertAdjacentHTML('beforeend', '<p data-telegram-summary="1"><strong>Telegram:</strong> -</p>');
        node = resumen.querySelector('[data-telegram-summary="1"]');
      }
      if (node) node.innerHTML = `<strong>Telegram:</strong> ${connected ? (enabled ? 'Conectado y activo' : 'Conectado') : 'No conectado'}`;
    }

    const canales = byId('panel-canales');
    if (canales) {
      canales.innerHTML = `
        <div class="plan-stack">
          <div class="plan-pill-row"><span class="plan-pill">📧 Email</span><span class="plan-pill plan-pill-neutral">Incluido</span></div>
          <p class="plan-note">Alertas por email disponibles como canal base.</p>
          <div class="plan-pill-row"><span class="plan-pill">📨 Telegram</span><span class="plan-pill plan-pill-neutral">${connected ? (enabled ? 'Activo' : 'Conectado') : 'Disponible'}</span></div>
          <p class="plan-note">${esc(note.textContent)}</p>
          <div class="plan-pill-row"><span class="plan-pill">💬 WhatsApp</span><span class="plan-pill plan-pill-neutral">En preparación</span></div>
          <p class="plan-note">WhatsApp sigue reservado para una etapa posterior.</p>
        </div>`;
    }
  }

  function patchFunctions() {
    if (typeof window.buildPreferenciasPayload === 'function' && !window.buildPreferenciasPayload.__telegramPatched) {
      const orig = window.buildPreferenciasPayload;
      window.buildPreferenciasPayload = function () {
        const out = orig.apply(this, arguments) || {};
        out.alertas_telegram = !!byId('pref-alertas-telegram')?.checked;
        return out;
      };
      window.buildPreferenciasPayload.__telegramPatched = true;
    }

    if (typeof window.obtenerPreferenciasPorUserId === 'function' && !window.obtenerPreferenciasPorUserId.__telegramPatched) {
      const orig = window.obtenerPreferenciasPorUserId;
      window.obtenerPreferenciasPorUserId = async function (userId) {
        const pref = await orig.apply(this, arguments);
        const status = await fetchTelegramStatus(userId);
        if (status) {
          pref.alertas_telegram = !!status.alerts_enabled;
          pref.telegram_connected = !!status.connected;
          pref.telegram_bot_link = status.bot_link || '';
          pref.telegram_bot_username = status.bot_username || '';
          pref.telegram_chat_id_masked = status.chat_id_masked || '';
          pref.telegram_username = status.username || '';
        }
        return pref;
      };
      window.obtenerPreferenciasPorUserId.__telegramPatched = true;
    }

    if (typeof window.cargarPrefsEnFormulario === 'function' && !window.cargarPrefsEnFormulario.__telegramPatched) {
      const orig = window.cargarPrefsEnFormulario;
      window.cargarPrefsEnFormulario = function (data) {
        const out = orig.apply(this, arguments);
        const pref = data?.preferencias || {};
        renderStatus({
          connected: !!pref.telegram_connected,
          bot_link: pref.telegram_bot_link || '',
          bot_username: pref.telegram_bot_username || '',
          chat_id_masked: pref.telegram_chat_id_masked || '',
          username: pref.telegram_username || ''
        }, !!pref.alertas_telegram);
        return out;
      };
      window.cargarPrefsEnFormulario.__telegramPatched = true;
    }

    if (typeof window.cargarDashboard === 'function' && !window.cargarDashboard.__telegramPatched) {
      const orig = window.cargarDashboard;
      window.cargarDashboard = async function () {
        const out = await orig.apply(this, arguments);
        const userId = typeof window.obtenerToken === 'function' ? window.obtenerToken() : '';
        const status = await fetchTelegramStatus(userId);
        renderStatus(status || {}, !!status?.alerts_enabled);
        return out;
      };
      window.cargarDashboard.__telegramPatched = true;
    }
  }

  function bindCheckbox() {
    const box = byId('pref-alertas-telegram');
    if (!box || box.dataset.telegramBound === '1') return;
    box.addEventListener('change', async () => {
      const userId = typeof window.obtenerToken === 'function' ? window.obtenerToken() : '';
      const status = await fetchTelegramStatus(userId);
      renderStatus(status || {}, box.checked);
    });
    box.dataset.telegramBound = '1';
  }

  function boot() {
    let tries = 0;
    const tick = () => {
      tries += 1;
      ensureUi();
      patchFunctions();
      bindCheckbox();
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
