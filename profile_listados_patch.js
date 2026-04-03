(function () {
  'use strict';

  if (window.__apdProfileListadosLiteLoaded) return;
  window.__apdProfileListadosLiteLoaded = true;

  const PROFILE_CARD_ID = 'panel-perfil-docente';
  const LISTADOS_CARD_ID = 'panel-listados-docente';
  const HIST_CARD_ID = 'panel-historico-docente';
  const PROFILE_BODY_ID = 'perfil-docente-body';
  const LISTADOS_BODY_ID = 'listados-docente-body';
  const HIST_BODY_ID = 'historico-docente-body';
  const LISTADOS_MSG_ID = 'listados-msg';

  function panel() {
    return document.getElementById('panel-content');
  }

  function ensureCards() {
    const root = panel();
    if (!root) return;

    if (!document.getElementById(PROFILE_CARD_ID)) {
      root.insertAdjacentHTML(
        'beforeend',
        `<div id="${PROFILE_CARD_ID}" class="panel-card span-4"><div class="card-lbl">🪪 Perfil docente</div><div id="${PROFILE_BODY_ID}"><p class="ph">Cargando...</p></div></div>`
      );
    }

    if (!document.getElementById(LISTADOS_CARD_ID)) {
      root.insertAdjacentHTML(
        'beforeend',
        `<div id="${LISTADOS_CARD_ID}" class="panel-card span-8"><div class="card-lbl-row"><span class="card-lbl">📚 Mis listados</span><div class="mini-group"><button id="btn-recompute-eligibility" class="mini-btn" type="button">Recalcular compatibilidad</button></div></div><div id="${LISTADOS_BODY_ID}"><p class="ph">Cargando...</p></div><span id="${LISTADOS_MSG_ID}" class="msg"></span></div>`
      );
    }

    if (!document.getElementById(HIST_CARD_ID)) {
      const anchor = document.getElementById(LISTADOS_CARD_ID);
      const html = `<div id="${HIST_CARD_ID}" class="panel-card span-12"><div class="card-lbl-row"><span class="card-lbl">🧭 Mercado APD histórico</span><div class="mini-group"><button id="btn-refresh-historico-docente" class="mini-btn" type="button">Refrescar</button></div></div><div id="${HIST_BODY_ID}"><p class="ph">Preparando histórico...</p></div></div>`;
      if (anchor) anchor.insertAdjacentHTML('afterend', html);
      else root.insertAdjacentHTML('beforeend', html);
    }
  }

  function hideStuckLoading() {
    const loading = document.getElementById('panel-loading');
    if (loading) loading.classList.add('hidden');
  }

  function msg(text, type = 'info') {
    const el = document.getElementById(LISTADOS_MSG_ID);
    if (!el) return;
    el.textContent = String(text || '');
    el.className = `msg msg-${type}`;
  }

  function bindActions() {
    const recomputeBtn = document.getElementById('btn-recompute-eligibility');
    if (recomputeBtn && !recomputeBtn.dataset.bound) {
      recomputeBtn.dataset.bound = '1';
      recomputeBtn.addEventListener('click', () => {
        msg('La compatibilidad se recalcula cuando vuelven tus datos desde ABC o al recargar el panel.', 'info');
      });
    }

    const histBtn = document.getElementById('btn-refresh-historico-docente');
    if (histBtn && !histBtn.dataset.bound) {
      histBtn.dataset.bound = '1';
      histBtn.addEventListener('click', () => {
        const body = document.getElementById(HIST_BODY_ID);
        if (body) body.innerHTML = '<p class="ph">Preparando histórico...</p>';
        window.dispatchEvent(new CustomEvent('apd:historico-refresh-requested'));
      });
    }
  }

  function refreshLayoutHooks() {
    if (typeof window.APD_refreshPanelTabs === 'function') {
      setTimeout(() => window.APD_refreshPanelTabs(), 0);
    }
  }

  function boot() {
    ensureCards();
    bindActions();
    refreshLayoutHooks();
    setTimeout(hideStuckLoading, 1200);
    setTimeout(hideStuckLoading, 2800);
  }

  function observePanel() {
    const root = panel();
    if (!root || root.dataset.profileLiteObserved === '1') return;
    const obs = new MutationObserver(() => {
      ensureCards();
      bindActions();
      refreshLayoutHooks();
    });
    obs.observe(root, { childList: true });
    root.dataset.profileLiteObserved = '1';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      boot();
      observePanel();
    }, { once: true });
  } else {
    boot();
    observePanel();
  }
})();
