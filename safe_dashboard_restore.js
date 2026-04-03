(function () {
  'use strict';

  if (window.__apdSafeDashboardRestoreLoaded) return;
  window.__apdSafeDashboardRestoreLoaded = true;

  function panelContent() {
    return document.getElementById('panel-content');
  }

  function makeCard(id, span, label, bodyId, html) {
    const card = document.createElement('div');
    card.id = id;
    card.className = `panel-card ${span}`;
    card.innerHTML = `
      <div class="card-lbl">${label}</div>
      <div id="${bodyId}">${html}</div>
    `;
    return card;
  }

  function recargarPanel() {
    document.getElementById('btn-recargar-panel')?.click();
  }

  function ensureProfileCard(root) {
    if (document.getElementById('panel-perfil-docente')) return;
    const html = `
      <div style="padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="soft-meta">Módulo en restauración controlada.</div>
        <div class="soft-meta" style="margin-top:6px;">Volvió la base estable del panel. Perfil/Listados se está reconstruyendo aparte para no colgar toda la web.</div>
        <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btn-safe-profile-reload" class="btn btn-secondary" type="button">Recargar panel</button>
        </div>
      </div>
    `;
    const card = makeCard('panel-perfil-docente', 'span-4', '🪪 Perfil docente', 'perfil-docente-body', html);
    root.appendChild(card);
    document.getElementById('btn-safe-profile-reload')?.addEventListener('click', recargarPanel);
  }

  function ensureListadosCard(root) {
    if (document.getElementById('panel-listados-docente')) return;
    const html = `
      <div style="padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="soft-meta">Mis listados vuelve en el próximo paso, pero ya separado del arranque para que no rompa el panel entero.</div>
        <div class="soft-meta" style="margin-top:6px;">La prioridad ahora es mantener la web estable y bajar el uso de CPU.</div>
        <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btn-safe-listados-reload" class="btn btn-secondary" type="button">Recargar panel</button>
        </div>
      </div>
    `;
    const card = makeCard('panel-listados-docente', 'span-8', '📚 Mis listados', 'listados-docente-body', html);
    root.appendChild(card);
    document.getElementById('btn-safe-listados-reload')?.addEventListener('click', recargarPanel);
  }

  function ensureMercadoCard(root) {
    if (document.getElementById('panel-historico-docente')) return;
    const html = `
      <div style="padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="soft-meta">Mercado APD histórico quedó pausado para evitar bloqueos.</div>
        <div class="soft-meta" style="margin-top:6px;">El radar provincial principal sigue siendo la referencia estable por ahora.</div>
        <div class="form-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btn-safe-mercado-radar" class="btn btn-secondary" type="button">Ir al radar provincial</button>
        </div>
      </div>
    `;
    const card = makeCard('panel-historico-docente', 'span-12', '🧭 Mercado APD histórico', 'historico-docente-body', html);
    root.appendChild(card);
    document.getElementById('btn-safe-mercado-radar')?.addEventListener('click', () => {
      document.getElementById('panel-radar-provincia')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function restoreSections() {
    const root = panelContent();
    const panel = document.getElementById('panel-docente');
    if (!root || !panel || panel.classList.contains('hidden')) return;
    ensureProfileCard(root);
    ensureListadosCard(root);
    ensureMercadoCard(root);
  }

  function boot() {
    let tries = 0;
    const tick = () => {
      tries += 1;
      restoreSections();
      if (tries < 12 && (!document.getElementById('panel-perfil-docente') || !document.getElementById('panel-listados-docente') || !document.getElementById('panel-historico-docente'))) {
        setTimeout(tick, 800);
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
