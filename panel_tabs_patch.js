(function () {
  'use strict';

  if (window.__apdPanelTabsPatchLoaded) return;
  window.__apdPanelTabsPatchLoaded = true;

  const TAB_STORAGE_KEY = 'apd_panel_tab_v1';
  const TAB_DEFS = [
    { key: 'inicio', label: 'Inicio' },
    { key: 'alertas', label: 'Alertas' },
    { key: 'perfil', label: 'Perfil / listados' },
    { key: 'repo', label: 'Repositorio' },
    { key: 'plan', label: 'Plan' },
    { key: 'mercado', label: 'Estadísticas' },
    { key: 'preferencias', label: 'Preferencias' },
    { key: 'admin', label: 'Admin' }
  ];

  let bootScheduled = false;
  let contentObserver = null;
  let adminObserver = null;
  let firstBoot = true;

  function injectStyles() {
    if (document.getElementById('panel-tabs-patch-style')) return;
    const style = document.createElement('style');
    style.id = 'panel-tabs-patch-style';
    style.textContent = `
      .panel-tabs-wrap{margin:18px 0 16px 0}
      .panel-tabs-nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      .panel-tab-btn{border:1px solid #dbe3f0;background:#fff;color:#0f3460;padding:10px 14px;border-radius:999px;font:inherit;font-weight:700;cursor:pointer}
      .panel-tab-btn.is-active{background:#0f3460;color:#fff;border-color:#0f3460}
      .panel-tab-btn.hidden{display:none!important}
      .panel-tab-pane{display:none}
      .panel-tab-pane.is-active{display:block}
      .panel-tab-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}
      .panel-tab-grid>.panel-card,.panel-tab-grid>#admin-panel-card{margin:0}
      .panel-tab-grid>.prefs-card{grid-column:1 / -1}
      .panel-tab-grid>.panel-card:not([class*="span-"]){grid-column:span 12}
      .apd-panel-showcase{grid-column:1/-1!important;position:relative;overflow:hidden;border-radius:30px!important;padding:32px!important;background:linear-gradient(135deg,#ffffff 0%,#f7fbff 50%,#eaf3ff 100%)!important;border:1px solid #dbe7f5!important;box-shadow:0 22px 60px rgba(36,72,242,.10)!important}
      .apd-panel-showcase:after{content:'🔔';position:absolute;right:76px;top:44px;width:72px;height:72px;border-radius:22px;background:linear-gradient(135deg,#2448f2,#6678ff);display:grid;place-items:center;color:#fff;font-size:34px;box-shadow:0 18px 42px rgba(36,72,242,.28)}
      .apd-panel-showcase:before{content:'💻  📚';position:absolute;right:72px;bottom:38px;font-size:80px;filter:drop-shadow(0 18px 22px rgba(16,36,61,.16));opacity:.95}
      .apd-panel-showcase-inner{position:relative;z-index:1;max-width:660px}
      .apd-panel-showcase-kicker{display:inline-flex;background:#edf4ff;color:#0f4fb8;border:1px solid #cfe1fa;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
      .apd-panel-showcase h2{font-size:clamp(34px,5vw,58px);line-height:.96;letter-spacing:-.06em;margin:0 0 12px;color:#0d1b35!important;font-weight:900}
      .apd-panel-showcase h2 span{color:#2448f2}
      .apd-panel-showcase p{font-size:17px;line-height:1.55;color:#40536b;margin:0 0 18px;max-width:620px}
      .apd-panel-showcase-actions{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px}
      .apd-panel-showcase-actions a{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;padding:12px 16px;text-decoration:none;font-weight:900;border:1px solid #dbe7f5;background:#fff;color:#0d1b35;box-shadow:0 10px 24px rgba(16,36,61,.06)}
      .apd-panel-showcase-actions a.primary{background:#2448f2;color:#fff;border-color:#2448f2;box-shadow:0 14px 30px rgba(36,72,242,.22)}
      .apd-panel-quick{position:relative;z-index:1;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:18px}
      .apd-panel-quick a{background:#fff;border:1px solid #dbe7f5;border-radius:18px;padding:16px;text-decoration:none;color:#10243d;box-shadow:0 10px 26px rgba(16,36,61,.05)}
      .apd-panel-quick i{width:42px;height:42px;border-radius:14px;background:#eef6ff;display:grid;place-items:center;font-style:normal;font-size:23px;margin-bottom:10px}
      .apd-panel-quick b{display:block;margin-bottom:4px;color:#0d1b35}
      .apd-panel-quick span{display:block;color:#64748b;font-size:13px;line-height:1.35}
      @media (max-width: 980px){.panel-tab-grid{grid-template-columns:1fr}.panel-tab-grid>.panel-card,.panel-tab-grid>#admin-panel-card,.panel-tab-grid>.prefs-card{grid-column:auto}.apd-panel-showcase:before,.apd-panel-showcase:after{display:none}.apd-panel-quick{grid-template-columns:repeat(2,1fr)}}
      @media (max-width: 560px){.apd-panel-showcase{padding:22px!important}.apd-panel-showcase h2{font-size:34px}.apd-panel-quick{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function getPanelDocente() { return document.getElementById('panel-docente'); }
  function getPanelContent() { return document.getElementById('panel-content'); }

  function ensureShell() {
    const section = getPanelDocente();
    const content = getPanelContent();
    if (!section || !content) return null;

    injectStyles();

    let wrap = document.getElementById('panel-tabs-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'panel-tabs-wrap';
      wrap.className = 'panel-tabs-wrap';
      wrap.innerHTML = `
        <div id="panel-tabs-nav" class="panel-tabs-nav"></div>
        <div id="panel-tab-pane-inicio" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
        <div id="panel-tab-pane-alertas" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
        <div id="panel-tab-pane-perfil" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
        <div id="panel-tab-pane-repo" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
        <div id="panel-tab-pane-plan" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
        <div id="panel-tab-pane-mercado" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
        <div id="panel-tab-pane-preferencias" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
        <div id="panel-tab-pane-admin" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
      `;
      content.insertAdjacentElement('beforebegin', wrap);
    }

    const nav = wrap.querySelector('#panel-tabs-nav');
    if (nav && !nav.dataset.ready) {
      nav.innerHTML = TAB_DEFS.map(tab => `<button type="button" class="panel-tab-btn" data-tab-key="${tab.key}">${tab.label}</button>`).join('');
      nav.dataset.ready = '1';
      nav.querySelectorAll('[data-tab-key]').forEach(btn => {
        btn.addEventListener('click', () => activateTab(btn.getAttribute('data-tab-key') || 'inicio'));
      });
    }

    content.style.display = 'none';
    return wrap;
  }

  function paneGrid(key) { return document.querySelector(`#panel-tab-pane-${key} .panel-tab-grid`); }
  function moveCardByContentId(contentId, tabKey) {
    const content = document.getElementById(contentId);
    const card = content?.closest('.panel-card');
    const grid = paneGrid(tabKey);
    if (card && grid && card.parentElement !== grid) grid.appendChild(card);
  }
  function moveCardById(cardId, tabKey) {
    const card = document.getElementById(cardId);
    const grid = paneGrid(tabKey);
    if (card && grid && card.parentElement !== grid) grid.appendChild(card);
  }
  function movePrefsCard() {
    const card = document.querySelector('.prefs-card');
    const grid = paneGrid('preferencias');
    if (card && grid && card.parentElement !== grid) grid.appendChild(card);
  }

  function ensurePanelShowcase() {
    const grid = paneGrid('inicio');
    if (!grid) return;
    let card = document.getElementById('apd-panel-showcase');
    if (!card) {
      card = document.createElement('div');
      card.id = 'apd-panel-showcase';
      card.className = 'panel-card span-12 apd-panel-showcase';
      card.innerHTML = `
        <div class="apd-panel-showcase-inner">
          <div class="apd-panel-showcase-kicker">Panel docente PBA</div>
          <h2>Tu acceso rápido a la información <span>docente de PBA</span></h2>
          <p>Alertas, cargos, PID, herramientas, licencias y recursos en un solo lugar para organizar mejor tu trabajo docente.</p>
          <div class="apd-panel-showcase-actions">
            <a class="primary" href="./licencias-docentes.html">🧾 Asistente de licencias</a>
            <a href="./herramientas-docentes.html">🧰 Herramientas docentes</a>
          </div>
        </div>
        <div class="apd-panel-quick">
          <a href="./como-funciona.html"><i>🔔</i><b>Cómo funciona</b><span>Conocé el sistema</span></a>
          <a href="./actos-publicos-digitales.html"><i>📋</i><b>APD</b><span>Actos Públicos Digitales</span></a>
          <a href="./pid-docente.html"><i>🎓</i><b>PID docente</b><span>Planilla de inscripción</span></a>
          <a href="./herramientas-docentes.html"><i>🧰</i><b>Herramientas</b><span>Recursos útiles</span></a>
          <a href="./licencias-docentes.html"><i>🧾</i><b>Licencias</b><span>Asistente docente</span></a>
        </div>
      `;
    }
    if (card.parentElement !== grid) grid.prepend(card);
    else if (grid.firstElementChild !== card) grid.prepend(card);
  }

  function repartitionCards() {
    ensureShell();
    ensurePanelShowcase();
    moveCardByContentId('panel-datos-docente', 'inicio');
    moveCardByContentId('panel-preferencias-resumen', 'inicio');
    moveCardByContentId('panel-plan', 'inicio');
    moveCardByContentId('panel-canales', 'inicio');
    moveCardById('apd-tools-panel-card', 'inicio');
    moveCardByContentId('panel-alertas', 'alertas');
    moveCardByContentId('panel-estadisticas', 'alertas');
    moveCardByContentId('panel-perfil-docente', 'perfil');
    moveCardByContentId('panel-listados-docente', 'perfil');
    moveCardById('panel-repositorio-card', 'repo');
    moveCardById('panel-plan-selector-card', 'plan');
    moveCardByContentId('panel-historico-apd', 'mercado');
    moveCardById('panel-radar-combinado-card', 'mercado');
    movePrefsCard();
    moveCardById('admin-panel-card', 'admin');
    refreshTabVisibility();
  }

  function sectionHasVisibleCards(key) {
    const grid = paneGrid(key);
    if (!grid) return false;
    const cards = [...grid.children].filter(el => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.classList.contains('hidden')) return false;
      if (el.id === 'admin-panel-card' && el.classList.contains('hidden')) return false;
      return true;
    });
    return cards.length > 0;
  }

  function refreshTabVisibility() {
    TAB_DEFS.forEach(tab => {
      const btn = document.querySelector(`.panel-tab-btn[data-tab-key="${tab.key}"]`);
      if (!btn) return;
      btn.classList.toggle('hidden', !sectionHasVisibleCards(tab.key));
    });
    const current = localStorage.getItem(TAB_STORAGE_KEY) || 'inicio';
    const activeBtn = document.querySelector(`.panel-tab-btn[data-tab-key="${current}"]:not(.hidden)`);
    if (!activeBtn) {
      const firstVisible = document.querySelector('.panel-tab-btn[data-tab-key]:not(.hidden)');
      if (firstVisible) activateTab(firstVisible.getAttribute('data-tab-key') || 'inicio');
      return;
    }
    activateTab(current);
  }

  function activateTab(key) {
    const visibleBtn = document.querySelector(`.panel-tab-btn[data-tab-key="${key}"]:not(.hidden)`);
    const fallbackBtn = visibleBtn || document.querySelector('.panel-tab-btn[data-tab-key]:not(.hidden)');
    const resolved = fallbackBtn?.getAttribute('data-tab-key') || 'inicio';
    localStorage.setItem(TAB_STORAGE_KEY, resolved);
    TAB_DEFS.forEach(tab => {
      const btn = document.querySelector(`.panel-tab-btn[data-tab-key="${tab.key}"]`);
      const pane = document.getElementById(`panel-tab-pane-${tab.key}`);
      btn?.classList.toggle('is-active', tab.key === resolved);
      pane?.classList.toggle('is-active', tab.key === resolved);
    });
  }

  function bootTabs() {
    if (!getPanelDocente() || !getPanelContent()) return;
    if (firstBoot) {
      localStorage.setItem(TAB_STORAGE_KEY, 'inicio');
      firstBoot = false;
    }
    repartitionCards();
  }
  function scheduleBootTabs() {
    if (bootScheduled) return;
    bootScheduled = true;
    requestAnimationFrame(() => { bootScheduled = false; bootTabs(); });
  }

  function startScopedObservers() {
    const content = getPanelContent();
    if (content && !contentObserver) {
      contentObserver = new MutationObserver(() => scheduleBootTabs());
      contentObserver.observe(content, { childList: true });
    }
    const admin = document.getElementById('admin-panel-card');
    if (admin && !adminObserver) {
      adminObserver = new MutationObserver(() => refreshTabVisibility());
      adminObserver.observe(admin, { attributes: true, attributeFilter: ['class'] });
    }
  }

  window.APD_refreshPanelTabs = scheduleBootTabs;
  window.APD_activatePanelTab = activateTab;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { scheduleBootTabs(); startScopedObservers(); }, { once: true });
  } else {
    scheduleBootTabs(); startScopedObservers();
  }
})();

(function () {
  'use strict';
  if (window.__apdAuthSessionPatchLoaderLoaded) return;
  window.__apdAuthSessionPatchLoaderLoaded = true;
  function loadAuthSessionPatch() {
    if (document.querySelector('script[data-apd-auth-session-patch="1"]')) return;
    const script = document.createElement('script');
    script.src = 'auth_session_patch.js?v=1';
    script.async = false;
    script.dataset.apdAuthSessionPatch = '1';
    document.head.appendChild(script);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAuthSessionPatch, { once: true }); else loadAuthSessionPatch();
})();