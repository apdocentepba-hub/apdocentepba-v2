(function () {
  'use strict';

  if (window.__apdSafeDashboardRestoreLoaded) return;
  window.__apdSafeDashboardRestoreLoaded = true;

  function panelContent() {
    return document.getElementById('panel-content');
  }

  function panelSection() {
    return document.getElementById('panel-docente');
  }

  function makeCard(id, span, label, bodyId, html, extraClass = '') {
    const card = document.createElement('div');
    card.id = id;
    card.className = `panel-card ${span} ${extraClass}`.trim();
    card.innerHTML = `
      <div class="card-lbl">${label}</div>
      <div id="${bodyId}">${html}</div>
    `;
    return card;
  }

  function recargarPanel() {
    document.getElementById('btn-recargar-panel')?.click();
  }

  function scrollToId(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function ensureStyles() {
    if (document.getElementById('safe-dashboard-restore-style')) return;
    const style = document.createElement('style');
    style.id = 'safe-dashboard-restore-style';
    style.textContent = `
      .safe-kicker{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.78;margin-bottom:6px}
      .safe-title{font-size:18px;font-weight:800;line-height:1.25;margin:0 0 8px 0;color:#0f3460}
      .safe-text{font-size:14px;line-height:1.5;color:#334155}
      .safe-chip-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .safe-chip{border:1px solid rgba(15,52,96,.12);background:#fff;color:#0f3460;padding:8px 12px;border-radius:999px;font:inherit;font-weight:700;cursor:pointer}
      .safe-stack{display:grid;gap:12px}
      .safe-box{padding:12px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:#fff}
      .safe-box h4{margin:0 0 6px 0;font-size:15px;color:#0f3460}
      .safe-box p{margin:0;font-size:14px;line-height:1.5;color:#334155}
      .safe-note{margin-top:8px;font-size:12px;color:#64748b}
      .safe-actions{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
      .safe-badge-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      .safe-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(15,52,96,.06);color:#0f3460;font-size:12px;font-weight:700}
    `;
    document.head.appendChild(style);
  }

  function ensureQuickNav(root) {
    if (document.getElementById('panel-safe-quicknav')) return;
    const html = `
      <div class="safe-kicker">Reconstrucción segura</div>
      <h3 class="safe-title">Volvió la base estable del panel</h3>
      <div class="safe-text">Ahora estamos reponiendo módulos sin volver a cargar el frontend pesado que estaba bloqueando todo.</div>
      <div class="safe-badge-row">
        <span class="safe-badge">✅ Login estable</span>
        <span class="safe-badge">✅ Alertas vivas</span>
        <span class="safe-badge">✅ CPU más baja</span>
      </div>
      <div class="safe-chip-row">
        <button id="safe-nav-alertas" class="safe-chip" type="button">Ir a alertas</button>
        <button id="safe-nav-radar" class="safe-chip" type="button">Ir al radar</button>
        <button id="safe-nav-perfil" class="safe-chip" type="button">Ir a perfil</button>
        <button id="safe-nav-listados" class="safe-chip" type="button">Ir a listados</button>
        <button id="safe-nav-mercado" class="safe-chip" type="button">Ir a mercado</button>
      </div>
    `;
    const card = makeCard('panel-safe-quicknav', 'span-12', '🧩 Recuperación del panel', 'safe-quicknav-body', html);
    root.insertBefore(card, root.firstChild);
    document.getElementById('safe-nav-alertas')?.addEventListener('click', () => scrollToId('panel-alertas'));
    document.getElementById('safe-nav-radar')?.addEventListener('click', () => scrollToId('panel-radar-provincia'));
    document.getElementById('safe-nav-perfil')?.addEventListener('click', () => scrollToId('panel-perfil-docente'));
    document.getElementById('safe-nav-listados')?.addEventListener('click', () => scrollToId('panel-listados-docente'));
    document.getElementById('safe-nav-mercado')?.addEventListener('click', () => scrollToId('panel-historico-docente'));
  }

  function ensureProfileCard(root) {
    if (document.getElementById('panel-perfil-docente')) return;
    const html = `
      <div class="safe-stack">
        <div class="safe-box">
          <h4>Estado del módulo</h4>
          <p>Perfil docente vuelve como módulo separado, para que un error acá no rompa nunca más todo el panel.</p>
          <div class="safe-note">Paso siguiente: volver a mostrar datos de perfil reales sin reconectar todavía ABC.</div>
        </div>
        <div class="safe-actions">
          <button id="btn-safe-profile-reload" class="btn btn-secondary" type="button">Recargar panel</button>
          <button id="btn-safe-profile-alertas" class="btn btn-outline" type="button">Ver alertas ahora</button>
        </div>
      </div>
    `;
    const card = makeCard('panel-perfil-docente', 'span-4', '🪪 Perfil docente', 'perfil-docente-body', html);
    root.appendChild(card);
    document.getElementById('btn-safe-profile-reload')?.addEventListener('click', recargarPanel);
    document.getElementById('btn-safe-profile-alertas')?.addEventListener('click', () => scrollToId('panel-alertas'));
  }

  function ensureListadosCard(root) {
    if (document.getElementById('panel-listados-docente')) return;
    const html = `
      <div class="safe-stack">
        <div class="safe-box">
          <h4>Mis listados</h4>
          <p>Esta sección vuelve primero como cascarón seguro. Después reponemos importación y compatibilidad sin tocar la base estable.</p>
          <div class="safe-note">Paso siguiente: restaurar lectura y guardado de listados en una capa aislada.</div>
        </div>
        <div class="safe-actions">
          <button id="btn-safe-listados-reload" class="btn btn-secondary" type="button">Recargar panel</button>
          <button id="btn-safe-listados-radar" class="btn btn-outline" type="button">Mirar radar provincial</button>
        </div>
      </div>
    `;
    const card = makeCard('panel-listados-docente', 'span-8', '📚 Mis listados', 'listados-docente-body', html);
    root.appendChild(card);
    document.getElementById('btn-safe-listados-reload')?.addEventListener('click', recargarPanel);
    document.getElementById('btn-safe-listados-radar')?.addEventListener('click', () => scrollToId('panel-radar-provincia'));
  }

  function ensureMercadoCard(root) {
    if (document.getElementById('panel-historico-docente')) return;
    const html = `
      <div class="safe-stack">
        <div class="safe-box">
          <h4>Mercado APD histórico</h4>
          <p>Mercado vuelve como módulo liviano. El radar provincial principal sigue siendo la referencia estable mientras reconstruimos histórico.</p>
          <div class="safe-note">Paso siguiente: reponer banners e insights sin volver a colgar la web.</div>
        </div>
        <div class="safe-actions">
          <button id="btn-safe-mercado-radar" class="btn btn-secondary" type="button">Ir al radar provincial</button>
          <button id="btn-safe-mercado-reload" class="btn btn-outline" type="button">Recargar panel</button>
        </div>
      </div>
    `;
    const card = makeCard('panel-historico-docente', 'span-12', '🧭 Mercado APD histórico', 'historico-docente-body', html);
    root.appendChild(card);
    document.getElementById('btn-safe-mercado-radar')?.addEventListener('click', () => scrollToId('panel-radar-provincia'));
    document.getElementById('btn-safe-mercado-reload')?.addEventListener('click', recargarPanel);
  }

  function restoreSections() {
    const root = panelContent();
    const panel = panelSection();
    if (!root || !panel || panel.classList.contains('hidden')) return;
    ensureStyles();
    ensureQuickNav(root);
    ensureProfileCard(root);
    ensureListadosCard(root);
    ensureMercadoCard(root);
  }

  function boot() {
    let tries = 0;
    const tick = () => {
      tries += 1;
      restoreSections();
      if (tries < 12 && (!document.getElementById('panel-safe-quicknav') || !document.getElementById('panel-perfil-docente') || !document.getElementById('panel-listados-docente') || !document.getElementById('panel-historico-docente'))) {
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
