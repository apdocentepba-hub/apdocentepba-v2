(function () {
  'use strict';

  if (window.__apdAuthSessionPatchLoaded) return;
  window.__apdAuthSessionPatchLoaded = true;

  const USER_TOKEN_KEY = 'apd_token_v2';
  const SESSION_TOKEN_KEY = 'apd_session_token_v1';
  const WORKER_URL = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';

  function getUserToken() {
    if (typeof window.obtenerToken === 'function') {
      return String(window.obtenerToken() || '').trim();
    }
    return String(localStorage.getItem(USER_TOKEN_KEY) || '').trim();
  }

  function getSessionToken() {
    return String(localStorage.getItem(SESSION_TOKEN_KEY) || '').trim();
  }

  function getAuthBearer() {
    return getSessionToken();
  }

  function saveAuthSession(data) {
    const userId = String(data?.user?.id || '').trim();
    const sessionToken = String(data?.session_token || '').trim();
    if (!userId || !sessionToken) return false;

    if (typeof window.guardarToken === 'function') {
      if (!window.guardarToken(userId)) return false;
    } else {
      localStorage.setItem(USER_TOKEN_KEY, userId);
    }
    localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    return getUserToken() === userId && getSessionToken() === sessionToken;
  }

  function clearAuthSession() {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  }

  function clearLegacyAuthIfNeeded() {
    const userId = getUserToken();
    const session = getSessionToken();
    if (!userId || session) return false;

    clearAuthSession();
    if (typeof window.borrarToken === 'function') window.borrarToken();
    else localStorage.removeItem(USER_TOKEN_KEY);
    return true;
  }

  window.obtenerSessionToken = getSessionToken;
  window.obtenerAuthBearer = getAuthBearer;
  window.guardarSesionAPD = saveAuthSession;
  window.getAdminToken = getAuthBearer;

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
    const res = await fetch(`${WORKER_URL}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': bearer ? `Bearer ${bearer}` : ''
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
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
      const res = await fetch(`${WORKER_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(document.getElementById('login-email')?.value || '').trim(),
          password: String(document.getElementById('login-password')?.value || '')
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.user?.id || !data?.session_token) {
        throw new Error(data?.message || 'Login incorrecto');
      }
      if (!saveAuthSession(data)) throw new Error('No se pudo guardar la sesión segura en el navegador');

      if (typeof window.actualizarNav === 'function') window.actualizarNav();
      if (typeof window.showMsg === 'function') window.showMsg('login-msg', 'Ingresando...', 'ok');
      if (typeof window.cargarDashboard === 'function') await window.cargarDashboard();
    } catch (err) {
      console.error('LOGIN SESSION ERROR:', err);
      if (typeof window.showMsg === 'function') {
        window.showMsg('login-msg', err?.message || 'Error de conexión. Intentá de nuevo.', 'error');
      }
    } finally {
      if (typeof window.btnRestore === 'function') window.btnRestore(btn);
    }
  }

  async function handleGoogleCredentialPatched(response) {
    const loginVisible = !document.getElementById('login')?.classList.contains('hidden');
    const target = loginVisible ? 'login-msg' : 'registro-msg';
    if (typeof window.showMsg === 'function') window.showMsg(target, 'Validando Google...', 'info');

    try {
      const res = await fetch(`${WORKER_URL}/api/google-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response?.credential || '' })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.user?.id || !data?.session_token) {
        throw new Error(data?.message || 'No se pudo ingresar con Google');
      }
      if (!saveAuthSession(data)) throw new Error('No se pudo guardar la sesión segura de Google');

      if (typeof window.actualizarNav === 'function') window.actualizarNav();
      if (typeof window.showMsg === 'function') window.showMsg(target, 'Ingresando...', 'ok');
      if (typeof window.cargarDashboard === 'function') await window.cargarDashboard();
    } catch (err) {
      console.error('GOOGLE SESSION ERROR:', err);
      if (typeof window.showMsg === 'function') {
        window.showMsg(target, err?.message || 'No se pudo ingresar con Google', 'error');
      }
    }
  }

  // app_v2.js is a classic script. Replacing the global property updates the callback
  // used by Google Identity when initGoogleButtons runs on DOMContentLoaded.
  window.handleGoogleCredential = handleGoogleCredentialPatched;

  function bindPatchedLogin() {
    const form = document.getElementById('form-login');
    if (!form || form.dataset.authSessionPatched === '1') return;
    form.dataset.authSessionPatched = '1';
    form.addEventListener('submit', handlePasswordLoginPatched, true);
  }

  const clearedLegacy = clearLegacyAuthIfNeeded();
  if (clearedLegacy && typeof window.actualizarNav === 'function') window.actualizarNav();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPatchedLogin, { once: true });
  } else {
    bindPatchedLogin();
  }
})();
