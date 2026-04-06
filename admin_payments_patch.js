(function () {
  'use strict';

  if (window.__apdAdminPaymentsPatchLoaded) return;
  window.__apdAdminPaymentsPatchLoaded = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function getToken() {
    try {
      if (typeof window.getAdminToken === 'function') return window.getAdminToken();
      if (typeof window.obtenerToken === 'function') return window.obtenerToken();
      return localStorage.getItem('apd_token_v2') || '';
    } catch (_) {
      return '';
    }
  }

  async function fetchJson(path) {
    const token = getToken();
    const base = window.API_URL || 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
    const res = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  }

  function ensureButton() {
    const card = byId('admin-panel-card');
    if (!card) return null;
    if (byId('admin-cargar-pagos')) return byId('admin-cargar-pagos');

    const toolbars = card.querySelectorAll('.admin-toolbar');
    const toolbar = toolbars[1] || toolbars[0] || null;
    if (!toolbar) return null;

    const btn = document.createElement('button');
    btn.id = 'admin-cargar-pagos';
    btn.type = 'button';
    btn.className = 'mini-btn';
    btn.textContent = 'Pagos';
    toolbar.appendChild(btn);
    return btn;
  }

  function bindButton() {
    const btn = ensureButton();
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async function () {
      try {
        const data = await fetchJson('/api/admin/pagos');
        if (typeof window.adminSetOutput === 'function') window.adminSetOutput(data);
      } catch (err) {
        if (typeof window.adminSetOutput === 'function') {
          window.adminSetOutput({ ok: false, error: err.message || 'No se pudieron leer los pagos.' });
        }
      }
    });
  }

  async function sync() {
    let isAdmin = false;
    if (typeof window.adminCheckAccess === 'function') {
      try {
        isAdmin = await window.adminCheckAccess();
      } catch (_) {
        isAdmin = false;
      }
    }
    if (!isAdmin) return;
    bindButton();
  }

  function boot() {
    sync();
    const panel = byId('panel-content');
    if (panel && !panel.dataset.adminPaymentsObserved) {
      panel.dataset.adminPaymentsObserved = '1';
      const observer = new MutationObserver(function () { sync(); });
      observer.observe(panel, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
