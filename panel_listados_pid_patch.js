(function () {
  'use strict';

  if (window.__apdStableListadosRepairLoaded) return;
  window.__apdStableListadosRepairLoaded = true;

  function byId(id) {
    return document.getElementById(id);
  }

  function panelContent() {
    return byId('panel-content');
  }

  function removeLegacyPidUi() {
    byId('panel-listados-pid-card')?.remove();
    byId('pidlist-card-inner')?.remove();
    document.querySelectorAll('.pidlist-card').forEach(function (el) {
      el.remove();
    });
  }

  function removeLegacyAbcImportUi() {
    const body = byId('panel-perfil-docente');
    const card = body?.closest('.panel-card');
    if (card) card.remove();
  }

  function ensureListadosCard() {
    const root = panelContent();
    if (!root) return;

    let card = byId('panel-listados-stable-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'panel-listados-stable-card';
      card.className = 'panel-card span-12';
      card.innerHTML = `
        <div class="card-lbl">📚 Listados</div>
        <div id="panel-listados-docente"></div>
      `;
      root.appendChild(card);
    }

    const body = byId('panel-listados-docente');
    if (!body) return;

    body.innerHTML = `
      <p class="prefs-hint">La consulta por DNI ya no se muestra mezclada en Estadísticas. Ahora quedó separada acá.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a class="btn btn-primary" href="./pid.html">Abrir consulta PID</a>
        <a class="btn btn-secondary" href="https://docs.google.com/spreadsheets/d/1YKJgKvIlNInD_NbkuDc8xvrlDr6qKgAsJUQE1le4e8o/edit" target="_blank" rel="noopener noreferrer">Abrir planilla PID</a>
      </div>
    `;
  }

  function sanitizeStatsCard() {
    const box = byId('panel-estadisticas');
    if (!box) return;

    const txt = String(box.textContent || '').toLowerCase();
    const looksLikeOldPid =
      txt.includes('dni') && (
        txt.includes('consult') ||
        txt.includes('ingres') ||
        txt.includes('resultado del pid') ||
        txt.includes('acá vas a ver')
      );

    if (!looksLikeOldPid) return;

    box.innerHTML = `
      <div class="empty-state">
        <p>La consulta por DNI ya no se muestra en Estadísticas.</p>
        <p class="empty-hint">Usá la pestaña Listados para abrir PID en una pantalla separada.</p>
      </div>
    `;
  }

  function renamePerfilTab() {
    const btn = document.querySelector('.panel-tab-btn[data-tab-key="perfil"]');
    if (btn) btn.textContent = 'Listados';
  }

  function pass() {
    removeLegacyPidUi();
    removeLegacyAbcImportUi();
    ensureListadosCard();
    sanitizeStatsCard();

    if (typeof window.APD_refreshPanelTabs === 'function') {
      window.APD_refreshPanelTabs();
    }

    setTimeout(renamePerfilTab, 0);
    setTimeout(renamePerfilTab, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      pass();
      setTimeout(pass, 300);
      setTimeout(pass, 1200);
      setTimeout(pass, 2500);
    }, { once: true });
  } else {
    pass();
    setTimeout(pass, 300);
    setTimeout(pass, 1200);
    setTimeout(pass, 2500);
  }

  const observer = new MutationObserver(function () {
    pass();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
