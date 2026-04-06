(function () {
  'use strict';

  if (window.__apdAuthSessionPatchLoaded) return;
  window.__apdAuthSessionPatchLoaded = true;

  const USER_TOKEN_KEY = 'apd_token_v2';
  const SESSION_TOKEN_KEY = 'apd_session_token_v1';

  function getUserToken() {
    return String(localStorage.getItem(USER_TOKEN_KEY) || '').trim();
  }

  function getSessionToken() {
    return String(localStorage.getItem(SESSION_TOKEN_KEY) || '').trim();
  }

  function getAuthBearer() {
    return getSessionToken() || getUserToken();
  }

  function saveAuthSession(data) {
    const userId = String(data?.user?.id || data?.token || '').trim();
    const sessionToken = String(data?.session_token || '').trim();

    if (userId) {
      localStorage.setItem(USER_TOKEN_KEY, userId);
    }

    if (sessionToken) {
      localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }

    return !!String(localStorage.getItem(USER_TOKEN_KEY) || '').trim();
  }

  function clearAuthSession() {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  }

  window.obtenerSessionToken = getSessionToken;

  const originalLogout = window.logout;
  if (typeof originalLogout === 'function') {
    window.logout = function patchedLogout(...args) {
      clearAuthSession();
      return originalLogout.apply(this, args);
    };
  }

  const originalWorkerFetchJson = window.workerFetchJson;
  if (typeof originalWorkerFetchJson === 'function') {
    window.workerFetchJson = function patchedWorkerFetchJson(path, options = {}) {
      const headers = { ...(options.headers || {}) };
      const bearer = getAuthBearer();

      if (bearer && !headers.Authorization) {
        headers.Authorization = `Bearer ${bearer}`;
      }

      if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      return originalWorkerFetchJson(path, {
        ...options,
        headers
      });
    };
  }

  window.adminApiGet = async function patchedAdminApiGet(path) {
    const bearer = getAuthBearer();
    const res = await fetch(`${window.API_URL || 'https://ancient-wildflower-cd37.apdocentepba.workers.dev'}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': bearer ? `Bearer ${bearer}` : ''
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }
    return data;
  };

  async function handlePasswordLoginPatched(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const form = event.currentTarget;
    const btn = event.submitter || form.querySelector("button[type='submit']");

    if (typeof window.btnLoad === 'function') window.btnLoad(btn, 'Ingresando...');
    if (typeof window.showMsg === 'function') window.showMsg('login-msg', 'Verificando credenciales...', 'info');

    try {
      const res = await fetch(`${window.API_URL || 'https://ancient-wildflower-cd37.apdocentepba.workers.dev'}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(document.getElementById('login-email')?.value || '').trim(),
          password: String(document.getElementById('login-password')?.value || '')
        })
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !(data?.user?.id || data?.token)) {
        throw new Error(data?.message || 'Login incorrecto');
      }

      if (!saveAuthSession(data)) {
        throw new Error('No se pudo guardar la sesión en el navegador');
      }

      if (typeof window.actualizarNav === 'function') window.actualizarNav();
      if (typeof window.showMsg === 'function') window.showMsg('login-msg', 'Ingresando...', 'ok');
      if (typeof window.cargarDashboard === 'function') {
        await window.cargarDashboard();
      }
    } catch (err) {
      console.error('LOGIN PATCH ERROR:', err);
      if (typeof window.showMsg === 'function') {
        window.showMsg('login-msg', err?.message || 'Error de conexión. Intentá de nuevo.', 'error');
      }
    } finally {
      if (typeof window.btnRestore === 'function') window.btnRestore(btn);
    }
  }

  function bindPatchedLogin() {
    const form = document.getElementById('form-login');
    if (!form || form.dataset.authSessionPatched === '1') return;
    form.dataset.authSessionPatched = '1';
    form.addEventListener('submit', handlePasswordLoginPatched, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPatchedLogin, { once: true });
  } else {
    bindPatchedLogin();
  }
})();
