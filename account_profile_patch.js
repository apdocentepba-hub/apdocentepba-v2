(()=>{
  'use strict';

  const PATCH_VERSION = '2026-04-12-account-profile-3';

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }

  function getTokenSafe() {
    return typeof obtenerToken === 'function' ? obtenerToken() : null;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  async function supabaseAccountFetch(path, options = {}) {
    const res = await fetch(`${APD_SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: APD_SUPABASE_KEY,
        Authorization: `Bearer ${APD_SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(options.headers || {})
      }
    });

    const text = await res.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      throw new Error(typeof data === 'string' ? data : `Supabase ${res.status}`);
    }

    return data;
  }

  async function getCurrentUserRow() {
    const userId = getTokenSafe();
    if (!userId) throw new Error('Sesión no válida');

    const rows = await supabaseAccountFetch(
      `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular&limit=1`,
      { method: 'GET' }
    );

    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function isEmailTakenByOtherUser(email, currentUserId) {
    const rows = await supabaseAccountFetch(
      `users?email=ilike.${encodeURIComponent(String(email || '').trim())}&select=id,email&limit=10`,
      { method: 'GET' }
    ).catch(() => []);

    return (Array.isArray(rows) ? rows : []).some(
      row => String(row?.id || '').trim() !== String(currentUserId || '').trim()
    );
  }

  function setMsg(id, text, type = 'info') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `msg msg-${type}`;
  }

  function btnLoad(btn, text) {
    if (!btn) return;
    if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = text;
  }

  function btnRestore(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = btn.dataset.origText || btn.textContent;
  }

  function val(id) {
    return String(document.getElementById(id)?.value || '').trim();
  }

  async function saveProfile(ev) {
    ev.preventDefault();

    const btn = ev.submitter || document.querySelector('#form-mi-cuenta button[type="submit"]');
    btnLoad(btn, 'Guardando...');
    setMsg('mi-cuenta-msg', 'Guardando datos personales...', 'info');

    try {
      const user = await getCurrentUserRow();
      if (!user?.id) throw new Error('No se pudo cargar tu cuenta');

      const nombre = val('mi-cuenta-nombre');
      const apellido = val('mi-cuenta-apellido');
      const email = val('mi-cuenta-email').toLowerCase();
      const celular = val('mi-cuenta-celular');

      if (!nombre) throw new Error('Ingresá tu nombre');
      if (!apellido) throw new Error('Ingresá tu apellido');
      if (!email || !isValidEmail(email)) throw new Error('Ingresá un email válido');

      const currentEmail = String(user.email || '').trim().toLowerCase();
      if (email !== currentEmail) {
        const taken = await isEmailTakenByOtherUser(email, user.id);
        if (taken) throw new Error('Ese email ya está registrado en otra cuenta');
      }

      await supabaseAccountFetch(`users?id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: {
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          nombre,
          apellido,
          email,
          celular
        })
      });

      setMsg('mi-cuenta-msg', 'Datos personales actualizados', 'ok');

      if (typeof cargarDashboard === 'function') {
        await cargarDashboard();
      }
    } catch (err) {
      console.error('ERROR ACTUALIZANDO MI CUENTA:', err);
      setMsg('mi-cuenta-msg', err?.message || 'No se pudieron guardar los cambios', 'error');
    } finally {
      btnRestore(btn);
    }
  }

  function buildAccountMarkup(docente) {
    const nombre = String(docente?.nombre || '').trim();
    const apellido = String(docente?.apellido || '').trim();
    const email = String(docente?.email || '').trim();
    const celular = String(docente?.celular || '').trim();

    return `
      <div class="plan-stack">
        <div class="plan-pill-row">
          <span class="plan-pill">Mi cuenta</span>
          <span class="plan-pill plan-pill-neutral">${esc(PATCH_VERSION)}</span>
        </div>
        <p class="plan-note">Acá podés actualizar nombre, apellido, email y celular sin tocar tus preferencias de alertas.</p>

        <form id="form-mi-cuenta" style="display:grid;gap:12px;margin-top:10px;">
          <div class="grid-2">
            <div class="field">
              <label for="mi-cuenta-nombre">Nombre</label>
              <input type="text" id="mi-cuenta-nombre" value="${esc(nombre)}" autocomplete="given-name" />
            </div>
            <div class="field">
              <label for="mi-cuenta-apellido">Apellido</label>
              <input type="text" id="mi-cuenta-apellido" value="${esc(apellido)}" autocomplete="family-name" />
            </div>
          </div>

          <div class="grid-2">
            <div class="field">
              <label for="mi-cuenta-email">Email</label>
              <input type="email" id="mi-cuenta-email" value="${esc(email)}" autocomplete="email" />
            </div>
            <div class="field">
              <label for="mi-cuenta-celular">Celular</label>
              <input type="text" id="mi-cuenta-celular" value="${esc(celular)}" autocomplete="tel" />
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Guardar datos personales</button>
          </div>
          <span id="mi-cuenta-msg" class="msg"></span>
        </form>
      </div>
    `;
  }

  function bindProfileForm() {
    const profileForm = document.getElementById('form-mi-cuenta');
    if (profileForm && profileForm.dataset.bound !== '1') {
      profileForm.addEventListener('submit', saveProfile);
      profileForm.dataset.bound = '1';
    }
  }

  function injectAccountEditor(docente) {
    const box = document.getElementById('panel-datos-docente');
    if (!box) return;

    box.innerHTML = buildAccountMarkup(docente || {});
    bindProfileForm();
  }

  function patchRenderDashboard() {
    const originalRenderDashboard = window.renderDashboard;
    if (typeof originalRenderDashboard !== 'function') return false;
    if (originalRenderDashboard.__accountProfilePatchWrapped) return true;

    const wrapped = function patchedRenderDashboard(data) {
      const result = originalRenderDashboard.apply(this, arguments);

      try {
        injectAccountEditor(data?.docente || {});
      } catch (err) {
        console.error('ACCOUNT PROFILE PATCH RENDER ERROR:', err);
      }

      return result;
    };

    wrapped.__accountProfilePatchWrapped = true;
    window.renderDashboard = wrapped;

    try {
      renderDashboard = wrapped;
    } catch (_) {}

    return true;
  }

  function bootPatch(attempts = 40) {
    if (patchRenderDashboard()) {
      bindProfileForm();
      return;
    }

    if (attempts > 0) {
      setTimeout(() => bootPatch(attempts - 1), 250);
    }
  }

  window.apdAccountProfilePatch = {
    saveProfile,
    injectAccountEditor,
    version: PATCH_VERSION
  };

  bootPatch();
})();
