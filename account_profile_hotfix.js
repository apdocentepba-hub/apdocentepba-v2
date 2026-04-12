(() => {
  'use strict';

  function getTokenSafe() {
    return typeof obtenerToken === 'function' ? obtenerToken() : null;
  }

  function setMsg(id, text, type = 'info') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = `msg ${type ? `msg-${type}` : ''}`;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function looksSha256Hex(value) {
    return /^[a-f0-9]{64}$/i.test(String(value || '').trim());
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(String(text || ''));
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(item => item.toString(16).padStart(2, '0'))
      .join('');
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
      `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,password_hash&limit=1`,
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

  function withSubmitButton(form, labelWhenBusy) {
    const btn = form?.querySelector('button[type="submit"]');
    const previous = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = labelWhenBusy;
    }
    return () => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = previous;
      }
    };
  }

  async function saveProfileDirect(form) {
    const nombre = String(form.querySelector('#mi-cuenta-nombre')?.value || '').trim();
    const apellido = String(form.querySelector('#mi-cuenta-apellido')?.value || '').trim();
    const email = String(form.querySelector('#mi-cuenta-email')?.value || '').trim().toLowerCase();
    const celular = String(form.querySelector('#mi-cuenta-celular')?.value || '').trim();
    const restore = withSubmitButton(form, 'Guardando...');

    try {
      setMsg('mi-cuenta-msg', 'Guardando datos personales...', 'info');

      if (!nombre) throw new Error('Ingresá tu nombre');
      if (!apellido) throw new Error('Ingresá tu apellido');
      if (!email || !isValidEmail(email)) throw new Error('Ingresá un email válido');

      const user = await getCurrentUserRow();
      if (!user?.id) throw new Error('No se pudo cargar tu cuenta');

      const currentEmail = String(user.email || '').trim().toLowerCase();
      if (email !== currentEmail) {
        const taken = await isEmailTakenByOtherUser(email, user.id);
        if (taken) throw new Error('Ese email ya está registrado en otra cuenta');
      }

      await supabaseAccountFetch(`users?id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ nombre, apellido, email, celular })
      });

      if (window.__apdAccountProfileState) {
        window.__apdAccountProfileState.profile = { nombre, apellido, email, celular };
        window.__apdAccountProfileState.editingProfile = false;
        window.__apdAccountProfileState.messages.profile = { text: 'Datos personales actualizados', type: 'ok' };
      }

      if (typeof cargarDashboard === 'function') {
        await cargarDashboard();
      } else {
        setMsg('mi-cuenta-msg', 'Datos personales actualizados', 'ok');
      }
    } catch (err) {
      console.error('ACCOUNT PROFILE HOTFIX ERROR:', err);
      setMsg('mi-cuenta-msg', err?.message || 'No se pudieron guardar los cambios', 'error');
    } finally {
      restore();
    }
  }

  async function changePasswordDirect(form) {
    const currentPassword = String(form.querySelector('#mi-password-actual')?.value || '').trim();
    const newPassword = String(form.querySelector('#mi-password-nueva')?.value || '').trim();
    const repeatPassword = String(form.querySelector('#mi-password-repetir')?.value || '').trim();
    const restore = withSubmitButton(form, 'Guardando...');

    try {
      setMsg('mi-password-msg', 'Actualizando contraseña...', 'info');

      if (newPassword.length < 6) {
        throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
      }

      if (newPassword !== repeatPassword) {
        throw new Error('La repetición no coincide con la nueva contraseña');
      }

      const user = await getCurrentUserRow();
      if (!user?.id) throw new Error('No se pudo cargar tu cuenta');

      const storedPassword = String(user.password_hash || '').trim();
      if (storedPassword) {
        if (!currentPassword) throw new Error('Ingresá tu contraseña actual');
        const currentHash = await sha256Hex(currentPassword);
        const matches = looksSha256Hex(storedPassword)
          ? currentHash === storedPassword
          : currentPassword === storedPassword;
        if (!matches) throw new Error('La contraseña actual no coincide');
      }

      const passwordToStore = await sha256Hex(newPassword);

      await supabaseAccountFetch(`users?id=eq.${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ password_hash: passwordToStore })
      });

      if (window.__apdAccountProfileState) {
        window.__apdAccountProfileState.passwordOpen = false;
        window.__apdAccountProfileState.messages.password = { text: 'Contraseña actualizada', type: 'ok' };
      }

      if (typeof cargarDashboard === 'function') {
        await cargarDashboard();
      } else {
        form.reset();
        setMsg('mi-password-msg', 'Contraseña actualizada', 'ok');
      }
    } catch (err) {
      console.error('ACCOUNT PASSWORD HOTFIX ERROR:', err);
      setMsg('mi-password-msg', err?.message || 'No se pudo actualizar la contraseña', 'error');
    } finally {
      restore();
    }
  }

  document.addEventListener('submit', (ev) => {
    const form = ev.target;
    if (!(form instanceof HTMLFormElement)) return;

    if (form.id === 'form-mi-cuenta') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      saveProfileDirect(form);
      return;
    }

    if (form.id === 'form-mi-password') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      changePasswordDirect(form);
    }
  }, true);
})();
