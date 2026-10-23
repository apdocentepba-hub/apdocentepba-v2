(()=>{
  'use strict';

  const PATCH_VERSION = '2026-10-22-account-marketing-privacy-2';
  const WORKER_URL = window.API_URL || 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
  const state = window.__apdAccountProfileState || {
    profile: null,
    editingProfile: false,
    passwordOpen: false,
    messages: {
      profile: { text: '', type: '' },
      password: { text: '', type: '' }
    }
  };
  window.__apdAccountProfileState = state;
  state.marketing = state.marketing || { status: 'loading', message: '', loading: false, eligibleForCampaign: false };
  // Only kept in module scope, never rendered, logged or persisted.
  let marketingSessionToken = null;


  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSessionToken() {
    if (typeof window.obtenerAuthBearer === 'function') {
      return String(window.obtenerAuthBearer() || '').trim();
    }
    if (typeof window.obtenerSessionToken === 'function') {
      return String(window.obtenerSessionToken() || '').trim();
    }
    return String(localStorage.getItem('apd_session_token_v1') || '').trim();
  }

  async function accountApi(path, options = {}) {
    const token = getSessionToken();
    if (!token) throw new Error('Sesión no válida. Ingresá nuevamente.');
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    };
    const res = await fetch(`${WORKER_URL}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      if (typeof window.logout === 'function') window.logout();
      throw new Error(data?.message || 'Tu sesión venció. Ingresá nuevamente.');
    }
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.message || data?.error || `Worker ${res.status}`);
    }
    return data;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  async function getCurrentUserRow() {
    const data = await accountApi('/api/account/profile', { method: 'GET' });
    return data?.user || data?.profile || null;
  }

  function profileFromSource(source) {
    return {
      nombre: String(source?.nombre || '').trim(),
      apellido: String(source?.apellido || '').trim(),
      email: String(source?.email || '').trim(),
      celular: String(source?.celular || '').trim()
    };
  }

  function updateProfileState(source, force = false) {
    if (force || !state.editingProfile || !state.profile) {
      state.profile = profileFromSource(source || {});
    }
  }

  function setMessage(kind, text, type) {
    state.messages[kind] = { text: String(text || ''), type: String(type || '') };
  }

  function clearMessage(kind) {
    setMessage(kind, '', '');
  }

  function val(id) {
    return String(document.getElementById(id)?.value || '').trim();
  }

  function editableInput(id, label, value, type = 'text', autocomplete = '') {
    return `
      <div class="field">
        <label for="${id}">${label}</label>
        <input type="${type}" id="${id}" value="${esc(value)}" ${state.editingProfile ? '' : 'disabled'} ${autocomplete ? `autocomplete="${autocomplete}"` : ''} />
      </div>
    `;
  }

  function passwordField(id, label, placeholder, autocomplete) {
    return `
      <div class="field">
        <label for="${id}">${label}</label>
        <div class="pw-wrap">
          <input type="password" id="${id}" placeholder="${esc(placeholder)}" autocomplete="${autocomplete}" />
          <button type="button" class="pw-toggle" data-target="${id}" tabindex="-1">👁</button>
        </div>
      </div>
    `;
  }

  function msgHtml(kind, id) {
    const msg = state.messages[kind] || { text: '', type: '' };
    return `<span id="${id}" class="msg ${msg.type ? `msg-${msg.type}` : ''}">${esc(msg.text || '')}</span>`;
  }

  function buildAccountMarkup() {
    const docente = state.profile || { nombre: '', apellido: '', email: '', celular: '' };
    return `
      <div class="plan-stack">
        <div class="plan-pill-row">
          <span class="plan-pill">Mi cuenta</span>
          <span class="plan-pill plan-pill-neutral">${esc(PATCH_VERSION)}</span>
        </div>
        <p class="plan-note">Tus datos quedan guardados y solo se habilitan para modificar cuando tocás <b>Editar</b>.</p>

        <form id="form-mi-cuenta" style="display:grid;gap:12px;margin-top:10px;">
          <div class="grid-2">
            ${editableInput('mi-cuenta-nombre', 'Nombre', docente.nombre, 'text', 'given-name')}
            ${editableInput('mi-cuenta-apellido', 'Apellido', docente.apellido, 'text', 'family-name')}
          </div>
          <div class="grid-2">
            ${editableInput('mi-cuenta-email', 'Email', docente.email, 'email', 'email')}
            ${editableInput('mi-cuenta-celular', 'Celular', docente.celular, 'text', 'tel')}
          </div>
          <div class="form-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
            ${state.editingProfile
              ? `<button type="submit" class="btn btn-primary">Guardar datos personales</button>
                 <button type="button" id="btn-mi-cuenta-cancelar" class="btn btn-secondary">Cancelar</button>`
              : `<button type="button" id="btn-mi-cuenta-editar" class="btn btn-primary">Editar</button>`}
          </div>
          ${msgHtml('profile', 'mi-cuenta-msg')}
        </form>


        <div style="height:1px;background:#e5e7eb;margin:12px 0;"></div>
        <section id="apd-marketing-settings" aria-label="Comunicaciones comerciales" style="display:grid;gap:8px;">
          <div class="plan-pill-row">
            <span class="plan-pill plan-pill-neutral">Comunicaciones promocionales</span>
          </div>
          <p class="plan-note" style="margin:0;">Estas comunicaciones son distintas de tus alertas docentes. No estás inscripto automáticamente para recibir publicidad.</p>
          <p id="apd-marketing-status" role="status" style="margin:0;">${esc(marketingStatusText())}</p>
          <p class="plan-note" style="margin:0;">La inscripción a promociones estará disponible cuando habilitemos la confirmación independiente por correo.</p>
          <button type="button" id="btn-apd-marketing-optout" class="btn btn-secondary" ${state.marketing.loading || state.marketing.status === 'unsubscribed' ? 'disabled' : ''}>No recibir comunicaciones promocionales</button>
          <p id="apd-marketing-message" role="status" class="plan-note" style="margin:0;">${esc(state.marketing.message || '')}</p>
        </section>
        <div style="height:1px;background:#e5e7eb;margin:12px 0;"></div>
        <div style="display:grid;gap:10px;">
          <div class="plan-pill-row" style="justify-content:space-between;align-items:center;">
            <span class="plan-pill plan-pill-neutral">Contraseña</span>
            <button type="button" id="btn-toggle-password" class="btn btn-secondary">${state.passwordOpen ? 'Ocultar' : 'Editar contraseña'}</button>
          </div>
          ${state.passwordOpen ? `
            <form id="form-mi-password" style="display:grid;gap:12px;">
              <p class="plan-note" style="margin:0;">La contraseña actual se valida en el servidor. La nueva debe tener al menos 6 caracteres.</p>
              ${passwordField('mi-password-actual', 'Contraseña actual', 'Tu contraseña actual', 'current-password')}
              <div class="grid-2">
                ${passwordField('mi-password-nueva', 'Nueva contraseña', 'Mínimo 6 caracteres', 'new-password')}
                ${passwordField('mi-password-repetir', 'Repetir nueva contraseña', 'Repetí la nueva contraseña', 'new-password')}
              </div>
              <div class="form-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="submit" class="btn btn-primary">Guardar nueva contraseña</button>
                <button type="button" id="btn-mi-password-cancelar" class="btn btn-secondary">Cancelar</button>
              </div>
              ${msgHtml('password', 'mi-password-msg')}
            </form>
          ` : msgHtml('password', 'mi-password-msg')}
        </div>
      </div>
    `;
  }

  function refreshPwToggles() {
    document.querySelectorAll('.pw-toggle').forEach(btn => {
      if (btn.dataset.accountPatchBound === '1') return;
      btn.dataset.accountPatchBound = '1';
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const show = target.type === 'password';
        target.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁';
      });
    });
  }

  function renderAccountBox() {
    const box = document.getElementById('panel-datos-docente');
    if (!box) return;
    box.innerHTML = buildAccountMarkup();
    bindEvents();
    refreshPwToggles();
  }

  function enterEditMode() {
    clearMessage('profile');
    state.editingProfile = true;
    renderAccountBox();
  }

  function cancelEditMode() {
    clearMessage('profile');
    state.editingProfile = false;
    renderAccountBox();
  }

  function togglePasswordBox(force) {
    state.passwordOpen = typeof force === 'boolean' ? force : !state.passwordOpen;
    if (!state.passwordOpen) clearMessage('password');
    renderAccountBox();
  }

  async function saveProfile(ev) {
    ev.preventDefault();
    const nombre = val('mi-cuenta-nombre');
    const apellido = val('mi-cuenta-apellido');
    const email = val('mi-cuenta-email').toLowerCase();
    const celular = val('mi-cuenta-celular');
    setMessage('profile', 'Guardando datos personales...', 'info');

    try {
      if (!nombre) throw new Error('Ingresá tu nombre');
      if (!apellido) throw new Error('Ingresá tu apellido');
      if (!email || !isValidEmail(email)) throw new Error('Ingresá un email válido');

      const data = await accountApi('/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ nombre, apellido, email, celular })
      });
      updateProfileState(data?.user || { nombre, apellido, email, celular }, true);
      state.editingProfile = false;
      setMessage('profile', 'Datos personales actualizados', 'ok');
      renderAccountBox();
      if (typeof cargarDashboard === 'function') await cargarDashboard();
    } catch (err) {
      console.error('ERROR ACTUALIZANDO MI CUENTA:', err);
      setMessage('profile', err?.message || 'No se pudieron guardar los cambios', 'error');
      renderAccountBox();
    }
  }

  async function changePassword(ev) {
    ev.preventDefault();
    const currentPassword = val('mi-password-actual');
    const newPassword = val('mi-password-nueva');
    const repeatPassword = val('mi-password-repetir');
    setMessage('password', 'Actualizando contraseña...', 'info');

    try {
      if (newPassword.length < 6) throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
      if (newPassword !== repeatPassword) throw new Error('La repetición no coincide con la nueva contraseña');

      await accountApi('/api/account/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      state.passwordOpen = false;
      setMessage('password', 'Contraseña actualizada', 'ok');
      renderAccountBox();
    } catch (err) {
      console.error('ERROR ACTUALIZANDO PASSWORD:', err);
      setMessage('password', err?.message || 'No se pudo actualizar la contraseña', 'error');
      state.passwordOpen = true;
      renderAccountBox();
    }
  }

  function marketingStatusText() {
    switch (state.marketing.status) {
      case 'unsubscribed': return 'Elegiste no recibir promociones.';
      case 'pending_confirmation': return 'La confirmación está pendiente; no estás habilitado para campañas.';
      case 'subscribed': return state.marketing.eligibleForCampaign
        ? 'Suscripción comercial confirmada y habilitada.'
        : 'Existe una suscripción registrada, pero no habilitada para campañas.';
      case 'loading': return 'Consultando preferencias...';
      case 'unavailable': return 'No se pudo consultar tu preferencia comercial.';
      default: return 'No estás inscripto para promociones.';
    }
  }

  // Update only the marketing controls, never overwrite an in-progress profile edit.
  function renderMarketingState() {
    const status = document.getElementById('apd-marketing-status');
    const message = document.getElementById('apd-marketing-message');
    const button = document.getElementById('btn-apd-marketing-optout');
    if (status) status.textContent = marketingStatusText();
    if (message) message.textContent = state.marketing.message || '';
    if (button) button.disabled = !!state.marketing.loading || state.marketing.status === 'unsubscribed';
  }

  function marketingSessionStillCurrent(token) {
    return marketingSessionToken === token && getSessionToken() === token;
  }

  function ensureMarketingPreferenceLoaded() {
    const token = getSessionToken();
    if (marketingSessionToken === token) return;
    marketingSessionToken = token;
    state.marketing = {
      status: token ? 'loading' : 'unavailable',
      message: token ? '' : 'Iniciá sesión para consultar tus preferencias comerciales.',
      loading: false,
      eligibleForCampaign: false
    };
    renderMarketingState();
    if (token) loadMarketingPreference(token).catch(() => {});
  }

  async function loadMarketingPreference(sessionToken) {
    try {
      const data = await accountApi('/api/account/marketing-preferences', { method: 'GET' });
      if (!marketingSessionStillCurrent(sessionToken)) return;
      const allowed = new Set(['not_requested', 'unsubscribed', 'pending_confirmation', 'subscribed']);
      const status = String(data?.marketing?.status || 'not_requested');
      state.marketing.status = allowed.has(status) ? status : 'unavailable';
      state.marketing.eligibleForCampaign = data?.marketing?.eligible_for_campaign === true;
      state.marketing.message = state.marketing.status === 'unavailable'
        ? 'No se pudo interpretar la preferencia comercial.' : '';
    } catch (_) {
      if (!marketingSessionStillCurrent(sessionToken)) return;
      state.marketing.status = 'unavailable';
      state.marketing.eligibleForCampaign = false;
      state.marketing.message = 'No se pudo verificar la preferencia comercial. No se habilita publicidad.';
    }
    renderMarketingState();
  }

  async function optOutMarketing() {
    if (state.marketing.loading || state.marketing.status === 'unsubscribed') return;
    const token = getSessionToken();
    if (!token || !marketingSessionStillCurrent(token)) {
      state.marketing.message = 'Iniciá sesión para solicitar la baja.';
      renderMarketingState();
      return;
    }
    state.marketing.loading = true;
    state.marketing.message = 'Guardando tu solicitud de baja...';
    renderMarketingState();
    try {
      const data = await accountApi('/api/account/marketing-preferences', {
        method: 'POST', body: JSON.stringify({action:'opt_out'})
      });
      if (!marketingSessionStillCurrent(token)) return;
      if (data?.status !== 'unsubscribed') throw new Error('No se pudo confirmar la baja');
      state.marketing.status = 'unsubscribed';
      state.marketing.eligibleForCampaign = false;
      state.marketing.message = 'Registramos tu baja en APDocente. La exclusión de listas de Brevo debe verificarse por separado; esta confirmación no acredita esa gestión.';
    } catch(err) {
      if (!marketingSessionStillCurrent(token)) return;
      state.marketing.message = err?.message || 'No se pudo registrar la baja.';
    } finally {
      if (marketingSessionStillCurrent(token)) {
        state.marketing.loading = false;
        renderMarketingState();
      }
    }
  }

  function bindEvents() {
    const marketingBtn = document.getElementById('btn-apd-marketing-optout');
    if (marketingBtn && marketingBtn.dataset.bound !== '1') {
      marketingBtn.addEventListener('click', optOutMarketing);
      marketingBtn.dataset.bound = '1';
    }
    const profileForm = document.getElementById('form-mi-cuenta');
    if (profileForm && profileForm.dataset.bound !== '1') {
      profileForm.addEventListener('submit', saveProfile);
      profileForm.dataset.bound = '1';
    }
    const editBtn = document.getElementById('btn-mi-cuenta-editar');
    if (editBtn && editBtn.dataset.bound !== '1') {
      editBtn.addEventListener('click', enterEditMode);
      editBtn.dataset.bound = '1';
    }
    const cancelBtn = document.getElementById('btn-mi-cuenta-cancelar');
    if (cancelBtn && cancelBtn.dataset.bound !== '1') {
      cancelBtn.addEventListener('click', cancelEditMode);
      cancelBtn.dataset.bound = '1';
    }
    const togglePasswordBtn = document.getElementById('btn-toggle-password');
    if (togglePasswordBtn && togglePasswordBtn.dataset.bound !== '1') {
      togglePasswordBtn.addEventListener('click', () => togglePasswordBox());
      togglePasswordBtn.dataset.bound = '1';
    }
    const passwordForm = document.getElementById('form-mi-password');
    if (passwordForm && passwordForm.dataset.bound !== '1') {
      passwordForm.addEventListener('submit', changePassword);
      passwordForm.dataset.bound = '1';
    }
    const cancelPasswordBtn = document.getElementById('btn-mi-password-cancelar');
    if (cancelPasswordBtn && cancelPasswordBtn.dataset.bound !== '1') {
      cancelPasswordBtn.addEventListener('click', () => togglePasswordBox(false));
      cancelPasswordBtn.dataset.bound = '1';
    }
  }

  function patchRenderDashboard() {
    const originalRenderDashboard = window.renderDashboard;
    if (typeof originalRenderDashboard !== 'function') return false;
    if (originalRenderDashboard.__accountProfilePatchWrappedV3) return true;

    const wrapped = function patchedRenderDashboard(data) {
      const result = originalRenderDashboard.apply(this, arguments);
      try {
        ensureMarketingPreferenceLoaded();
        updateProfileState(data?.docente || {}, false);
        renderAccountBox();
      } catch (err) {
        console.error('ACCOUNT PROFILE PATCH RENDER ERROR:', err);
      }
      return result;
    };
    wrapped.__accountProfilePatchWrappedV3 = true;
    window.renderDashboard = wrapped;
    try { renderDashboard = wrapped; } catch (_) {}
    return true;
  }

  function bootPatch(attempts = 40) {
    if (patchRenderDashboard()) {
      renderAccountBox();
      ensureMarketingPreferenceLoaded();
      getCurrentUserRow().then(user => {
        if (user) {
          updateProfileState(user, true);
          renderAccountBox();
        }
      }).catch(() => {});
      return;
    }
    if (attempts > 0) setTimeout(() => bootPatch(attempts - 1), 250);
  }

  window.apdAccountProfilePatch = { saveProfile, changePassword, optOutMarketing, version: PATCH_VERSION };
  bootPatch();
})();
