(function () {
  'use strict';

  if (window.__apdAdminPreviewPatchLoaded) return;
  window.__apdAdminPreviewPatchLoaded = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function getPanelContent() {
    return byId('panel-content');
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
    const res = await fetch(`${window.API_URL || 'https://ancient-wildflower-cd37.apdocentepba.workers.dev'}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }
    return data;
  }

  function injectStyles() {
    if (byId('apd-admin-preview-style')) return;
    const style = document.createElement('style');
    style.id = 'apd-admin-preview-style';
    style.textContent = `
      #admin-panel-card.hidden{display:none!important}
      .admin-preview-note{margin:0 0 14px 0;color:#475569;font-size:14px;line-height:1.5}
      .admin-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 14px 0}
      .admin-divider{height:1px;background:#e5e7eb;margin:12px 0 14px 0}
      .admin-cards-grid,.admin-health-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 16px 0}
      .admin-card,.admin-health-card{border:1px solid #dbe3f0;border-radius:14px;background:#fff;padding:14px;display:flex;flex-direction:column;gap:8px;box-shadow:0 6px 18px rgba(15,52,96,.06)}
      .admin-card strong,.admin-health-card strong{font-size:13px;color:#475569;font-weight:700}
      .admin-card span{font-size:28px;line-height:1;font-weight:800;color:#0f3460}
      .admin-health-card{gap:6px}
      .admin-health-value{font-size:16px;line-height:1.3;font-weight:800;color:#0f3460}
      .admin-health-sub{font-size:12px;line-height:1.45;color:#64748b}
      .admin-output-wrap{border:1px solid #dbe3f0;border-radius:14px;background:#0f172a;overflow:hidden}
      .admin-output-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#111827;color:#e5e7eb;font-size:13px;font-weight:700}
      #admin-output{margin:0;padding:14px;min-height:240px;max-height:520px;overflow:auto;font-size:12px;line-height:1.45;color:#cbd5e1;white-space:pre-wrap;word-break:break-word}
      @media (max-width: 900px){.admin-cards-grid,.admin-health-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function cardHtml() {
    return `
      <div id="admin-panel-card" class="panel-card span-12 hidden">
        <div class="card-lbl-row">
          <span class="card-lbl">🛡️ Admin preview</span>
          <span class="plan-pill plan-pill-neutral">Solo visible para admins</span>
        </div>
        <p class="admin-preview-note">Vista interna de pruebas. Si algo falla acá, no debería afectar el flujo normal del docente.</p>

        <div id="admin-cards" class="admin-cards-grid"></div>
        <div id="admin-health-strip" class="admin-health-grid"></div>

        <div class="admin-toolbar">
          <button id="admin-cargar-resumen" class="mini-btn" type="button">Resumen</button>
          <button id="admin-cargar-usuarios" class="mini-btn" type="button">Usuarios</button>
          <button id="admin-cargar-sesiones" class="mini-btn" type="button">Sesiones</button>
          <button id="admin-cargar-alertas" class="mini-btn" type="button">Alertas</button>
        </div>

        <div class="admin-divider"></div>

        <div class="admin-toolbar">
          <button id="admin-cargar-sistema" class="mini-btn" type="button">Sistema</button>
          <button id="admin-cargar-whatsapp" class="mini-btn" type="button">WhatsApp</button>
          <button id="admin-cargar-backfill" class="mini-btn" type="button">Backfill</button>
          <button id="admin-cargar-radar" class="mini-btn" type="button">Radar prov.</button>
          <button id="admin-cargar-planes" class="mini-btn" type="button">Planes</button>
        </div>

        <div class="admin-output-wrap">
          <div class="admin-output-head">
            <span>Salida admin</span>
            <span>JSON</span>
          </div>
          <pre id="admin-output">Esperando acción…</pre>
        </div>
      </div>
    `;
  }

  function ensureCard() {
    injectStyles();
    const panel = getPanelContent();
    if (!panel) return null;

    let card = byId('admin-panel-card');
    if (!card) {
      panel.insertAdjacentHTML('beforeend', cardHtml());
      card = byId('admin-panel-card');
    }

    return card;
  }

  function ensureHelpers() {
    if (typeof window.adminSetOutput !== 'function') {
      window.adminSetOutput = function adminSetOutput(data) {
        const pre = byId('admin-output');
        if (!pre) return;
        pre.textContent = JSON.stringify(data, null, 2);
      };
    }

    if (typeof window.adminSetCards !== 'function') {
      window.adminSetCards = function adminSetCards(resumen) {
        const box = byId('admin-cards');
        if (!box) return;
        if (!resumen) {
          box.innerHTML = '';
          return;
        }
        box.innerHTML = `
          <div class="admin-card"><strong>Usuarios</strong><span>${resumen.usuarios_total ?? 0}</span></div>
          <div class="admin-card"><strong>Activos</strong><span>${resumen.usuarios_activos ?? 0}</span></div>
          <div class="admin-card"><strong>Admins</strong><span>${resumen.admins_total ?? 0}</span></div>
          <div class="admin-card"><strong>Sesiones</strong><span>${resumen.sesiones_activas ?? 0}</span></div>
          <div class="admin-card"><strong>Alertas hoy</strong><span>${resumen.alertas_hoy ?? 0}</span></div>
          <div class="admin-card"><strong>Errores</strong><span>${resumen.errores_hoy ?? 0}</span></div>
        `;
      };
    }
  }

  function setHealthCards(items) {
    const box = byId('admin-health-strip');
    if (!box) return;
    if (!Array.isArray(items) || !items.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = items.map((item) => `
      <div class="admin-health-card">
        <strong>${String(item.label || '')}</strong>
        <div class="admin-health-value">${String(item.value || '-')}</div>
        <div class="admin-health-sub">${String(item.sub || '')}</div>
      </div>
    `).join('');
  }

  function fmtDate(value) {
    const d = new Date(value || '');
    if (Number.isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(d);
  }

  async function loadSystemSnapshot() {
    const [resumenResult, whatsappResult, backfillResult] = await Promise.allSettled([
      (typeof window.adminApiGet === 'function' ? window.adminApiGet('/api/admin/resumen') : fetchJson('/api/admin/resumen')),
      fetchJson('/api/whatsapp/health'),
      fetchJson('/api/provincia/backfill-status')
    ]);

    const resumen = resumenResult.status === 'fulfilled' ? resumenResult.value : null;
    const whatsapp = whatsappResult.status === 'fulfilled' ? whatsappResult.value : null;
    const backfill = backfillResult.status === 'fulfilled' ? backfillResult.value : null;

    if (resumen && typeof window.adminSetCards === 'function') {
      window.adminSetCards(resumen.resumen || null);
    }

    const ultima = resumen?.resumen?.ultima_ejecucion || null;
    setHealthCards([
      {
        label: 'Worker',
        value: ultima ? 'Activo' : 'Sin dato',
        sub: ultima?.created_at ? `Última ejecución: ${fmtDate(ultima.created_at)}` : 'Todavía no tenemos una corrida visible.'
      },
      {
        label: 'WhatsApp',
        value: whatsapp?.configured ? 'Configurado' : 'Pendiente',
        sub: whatsapp?.note || 'Sin datos de salud.'
      },
      {
        label: 'Backfill prov.',
        value: backfill?.status || 'sin_dato',
        sub: backfill?.district_name ? `Distrito actual: ${backfill.district_name}` : (backfill?.last_error || 'Sin proceso en curso.')
      }
    ]);

    return { ok: true, resumen, whatsapp, backfill };
  }

  async function loadWhatsAppHealth() {
    return await fetchJson('/api/whatsapp/health');
  }

  async function loadBackfillStatus() {
    return await fetchJson('/api/provincia/backfill-status');
  }

  async function loadProvinciaResumen() {
    return await fetchJson('/api/provincia/resumen?days=30');
  }

  async function loadPlanes() {
    return await fetchJson('/api/planes');
  }

  function bindExistingAdminEventsOnce() {
    if (window.__apdAdminEventsBound) return;
    if (typeof window.bindAdminEvents !== 'function') return;
    window.__apdAdminEventsBound = true;
    window.bindAdminEvents();
  }

  function bindButton(id, handler) {
    const el = byId(id);
    if (!el || el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener('click', () => {
      handler().then((data) => {
        if (typeof window.adminSetOutput === 'function') window.adminSetOutput(data);
      }).catch((err) => {
        if (typeof window.adminSetOutput === 'function') window.adminSetOutput({ ok: false, error: err.message || 'Error' });
      });
    });
  }

  function bindButtons() {
    bindExistingAdminEventsOnce();
    bindButton('admin-cargar-sistema', loadSystemSnapshot);
    bindButton('admin-cargar-whatsapp', loadWhatsAppHealth);
    bindButton('admin-cargar-backfill', loadBackfillStatus);
    bindButton('admin-cargar-radar', loadProvinciaResumen);
    bindButton('admin-cargar-planes', loadPlanes);
  }

  async function syncAdminState() {
    ensureCard();
    ensureHelpers();
    bindButtons();

    let isAdmin = false;
    if (typeof window.adminCheckAccess === 'function') {
      try {
        isAdmin = await window.adminCheckAccess();
      } catch (_) {
        isAdmin = false;
      }
    }

    const card = byId('admin-panel-card');
    if (card) card.classList.toggle('hidden', !isAdmin);

    if (isAdmin) {
      loadSystemSnapshot().then((data) => {
        if (typeof window.adminSetOutput === 'function') {
          window.adminSetOutput({ ok: true, message: 'Snapshot inicial cargado', data });
        }
      }).catch(() => {});
    }

    if (typeof window.APD_refreshPanelTabs === 'function') {
      window.APD_refreshPanelTabs();
    }
  }

  function boot() {
    syncAdminState();

    const panel = getPanelContent();
    if (panel && !panel.dataset.adminPreviewObserved) {
      panel.dataset.adminPreviewObserved = '1';
      const observer = new MutationObserver(function () {
        syncAdminState();
      });
      observer.observe(panel, { childList: true, subtree: false });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
