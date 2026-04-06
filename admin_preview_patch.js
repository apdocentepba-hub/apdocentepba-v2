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

  function injectStyles() {
    if (byId('apd-admin-preview-style')) return;
    const style = document.createElement('style');
    style.id = 'apd-admin-preview-style';
    style.textContent = `
      #admin-panel-card.hidden{display:none!important}
      .admin-preview-note{margin:0 0 14px 0;color:#475569;font-size:14px;line-height:1.5}
      .admin-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 14px 0}
      .admin-cards-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 16px 0}
      .admin-card{border:1px solid #dbe3f0;border-radius:14px;background:#fff;padding:14px;display:flex;flex-direction:column;gap:8px;box-shadow:0 6px 18px rgba(15,52,96,.06)}
      .admin-card strong{font-size:13px;color:#475569;font-weight:700}
      .admin-card span{font-size:28px;line-height:1;font-weight:800;color:#0f3460}
      .admin-output-wrap{border:1px solid #dbe3f0;border-radius:14px;background:#0f172a;overflow:hidden}
      .admin-output-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#111827;color:#e5e7eb;font-size:13px;font-weight:700}
      #admin-output{margin:0;padding:14px;min-height:240px;max-height:520px;overflow:auto;font-size:12px;line-height:1.45;color:#cbd5e1;white-space:pre-wrap;word-break:break-word}
      @media (max-width: 900px){.admin-cards-grid{grid-template-columns:1fr}}
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

        <div class="admin-toolbar">
          <button id="admin-cargar-resumen" class="mini-btn" type="button">Resumen</button>
          <button id="admin-cargar-usuarios" class="mini-btn" type="button">Usuarios</button>
          <button id="admin-cargar-sesiones" class="mini-btn" type="button">Sesiones</button>
          <button id="admin-cargar-alertas" class="mini-btn" type="button">Alertas</button>
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

  function bindButtons() {
    const ids = [
      'admin-cargar-resumen',
      'admin-cargar-usuarios',
      'admin-cargar-sesiones',
      'admin-cargar-alertas'
    ];

    ids.forEach(function (id) {
      const el = byId(id);
      if (!el || el.dataset.bound === '1') return;
      el.dataset.bound = '1';
    });

    if (typeof window.bindAdminEvents === 'function') {
      window.bindAdminEvents();
    }
  }

  async function syncAdminState() {
    ensureCard();
    ensureHelpers();
    bindButtons();

    if (typeof window.adminCheckAccess === 'function') {
      try {
        await window.adminCheckAccess();
      } catch (_) {}
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
