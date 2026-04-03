(function () {
  'use strict';

  if (window.__apdPanelTabsPatchLoaded) return;
  window.__apdPanelTabsPatchLoaded = true;

  const TAB_STORAGE_KEY = 'apd_panel_tab_v1';
  const TAB_DEFS = [
    { key: 'inicio', label: 'Inicio' },
    { key: 'alertas', label: 'Alertas' },
    { key: 'perfil', label: 'Perfil / listados' },
    { key: 'plan', label: 'Plan' },
    { key: 'mercado', label: 'Mercado' },
    { key: 'preferencias', label: 'Preferencias' },
    { key: 'admin', label: 'Admin' }
  ];

  let bootScheduled = false;
  let contentObserver = null;
  let adminObserver = null;

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
      @media (max-width: 980px){.panel-tab-grid{grid-template-columns:1fr}.panel-tab-grid>.panel-card,.panel-tab-grid>#admin-panel-card,.panel-tab-grid>.prefs-card{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function getPanelDocente() {
    return document.getElementById('panel-docente');
  }

  function getPanelContent() {
    return document.getElementById('panel-content');
  }

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
        <div id="panel-tab-pane-plan" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
        <div id="panel-tab-pane-mercado" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
        <div id="panel-tab-pane-preferencias" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
        <div id="panel-tab-pane-admin" class="panel-tab-pane"><div class="panel-tab-grid"></div></div>
      `;
      content.insertAdjacentElement('beforebegin', wrap);
    }

    const nav = wrap.querySelector('#panel-tabs-nav');
    if (nav && !nav.dataset.ready) {
      nav.innerHTML = TAB_DEFS.map(tab => `
        <button type="button" class="panel-tab-btn" data-tab-key="${tab.key}">${tab.label}</button>
      `).join('');
      nav.dataset.ready = '1';

      nav.querySelectorAll('[data-tab-key]').forEach(btn => {
        btn.addEventListener('click', () => activateTab(btn.getAttribute('data-tab-key') || 'inicio'));
      });
    }

    content.style.display = 'none';
    return wrap;
  }

  function paneGrid(key) {
    return document.querySelector(`#panel-tab-pane-${key} .panel-tab-grid`);
  }

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

  function repartitionCards() {
    ensureShell();
    moveCardByContentId('panel-datos-docente', 'inicio');
    moveCardByContentId('panel-preferencias-resumen', 'inicio');
    moveCardByContentId('panel-estadisticas', 'inicio');

    moveCardByContentId('panel-alertas', 'alertas');

    moveCardByContentId('panel-perfil-docente', 'perfil');
    moveCardByContentId('panel-listados-docente', 'perfil');

    moveCardByContentId('panel-plan', 'plan');
    moveCardByContentId('panel-canales', 'plan');
    moveCardById('panel-plan-selector-card', 'plan');

    moveCardByContentId('panel-historico-docente', 'mercado');
    moveCardByContentId('panel-radar-provincia', 'mercado');
    moveCardByContentId('panel-historico-apd', 'mercado');
    moveCardByContentId('panel-historial', 'mercado');
    moveCardByContentId('panel-backfill-provincia', 'mercado');

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
    repartitionCards();
  }

  function scheduleBootTabs() {
    if (bootScheduled) return;
    bootScheduled = true;
    requestAnimationFrame(() => {
      bootScheduled = false;
      bootTabs();
    });
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
    document.addEventListener('DOMContentLoaded', () => {
      scheduleBootTabs();
      startScopedObservers();
    }, { once: true });
  } else {
    scheduleBootTabs();
    startScopedObservers();
  }
})();
