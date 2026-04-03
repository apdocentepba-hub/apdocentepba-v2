(function () {
  'use strict';

  if (window.__apdEnterpriseSpeedPlansLoaded) return;
  window.__apdEnterpriseSpeedPlansLoaded = true;

  const TAB_KEY = 'apd_panel_tab_v1';
  const HIST_URL_KEY = 'apd_hist_webapp_url';
  const HIST_CACHE_PREFIX = 'apd_hist_overview_cache_v1:';
  const HIST_TTL_MS = 15 * 60 * 1000;

  function injectEnterpriseStyles() {
    if (document.getElementById('enterprise-speed-plans-style')) return;
    const style = document.createElement('style');
    style.id = 'enterprise-speed-plans-style';
    style.textContent = `
      .enterprise-plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:14px}
      .enterprise-plan-card{border:1px solid rgba(15,52,96,.12)!important;border-radius:18px!important;background:#fff!important;box-shadow:0 10px 30px rgba(15,52,96,.06)}
      .enterprise-plan-card.is-current{border-color:#0f3460!important;background:rgba(15,52,96,.03)!important}
      .enterprise-plan-card .plan-pill-row{justify-content:space-between}
      .enterprise-plan-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:10px}
      .enterprise-plan-title{font-size:18px;font-weight:800;color:#0f3460;line-height:1.2}
      .enterprise-plan-price{font-size:18px;font-weight:800;color:#111827;white-space:nowrap}
      .enterprise-plan-meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
      .enterprise-plan-badge{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:12px;font-weight:700}
      .enterprise-plan-copy{font-size:13px;line-height:1.45;color:#4b5563;margin:8px 0 0}
      .enterprise-plan-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
      .enterprise-plan-note{font-size:12px;color:#6b7280;margin:0 0 10px}
      .enterprise-stat-fast{font-size:12px;color:#6b7280;margin-top:8px}
      @media (max-width: 1024px){.enterprise-plan-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function getHistUrl() {
    return String(localStorage.getItem(HIST_URL_KEY) || '').trim();
  }

  function histCacheKey(url) {
    return `${HIST_CACHE_PREFIX}${encodeURIComponent(String(url || '').trim())}`;
  }

  function readHistCache(url) {
    try {
      const raw = localStorage.getItem(histCacheKey(url));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.ts || !parsed.data) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeHistCache(url, data) {
    try {
      localStorage.setItem(histCacheKey(url), JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }

  function isHistOverviewRequest(input) {
    const base = getHistUrl();
    if (!base) return false;
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (!url || !url.startsWith(base)) return false;
    try {
      const u = new URL(url);
      return String(u.searchParams.get('action') || '').toLowerCase() === 'overview';
    } catch {
      return false;
    }
  }

  async function updateHistCacheInBackground(nativeFetch, input, init) {
    try {
      const res = await nativeFetch(input, init);
      const clone = res.clone();
      const text = await clone.text();
      const data = text ? JSON.parse(text) : null;
      if (res.ok && data?.ok) {
        const url = typeof input === 'string' ? input : input.url;
        writeHistCache(url, data);
      }
    } catch {}
  }

  function installFastHistFetch() {
    if (window.__apdHistFetchWrapped) return;
    window.__apdHistFetchWrapped = true;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async function patchedFetch(input, init) {
      if (!isHistOverviewRequest(input)) {
        return nativeFetch(input, init);
      }

      const url = typeof input === 'string' ? input : input.url;
      const cached = readHistCache(url);
      const fresh = cached && Date.now() - Number(cached.ts || 0) < HIST_TTL_MS;

      if (fresh) {
        updateHistCacheInBackground(nativeFetch, input, init);
        return new Response(JSON.stringify(cached.data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const res = await nativeFetch(input, init);
      try {
        const clone = res.clone();
        const text = await clone.text();
        const data = text ? JSON.parse(text) : null;
        if (res.ok && data?.ok) writeHistCache(url, data);
      } catch {}
      return res;
    };
  }

  function ensurePlansTab() {
    const wrap = document.getElementById('panel-tabs-wrap');
    const nav = document.getElementById('panel-tabs-nav');
    if (!wrap || !nav) return;

    let pane = document.getElementById('panel-tab-pane-planes');
    if (!pane) {
      pane = document.createElement('div');
      pane.id = 'panel-tab-pane-planes';
      pane.className = 'panel-tab-pane';
      pane.innerHTML = '<div class="panel-tab-grid"></div>';
      const prefPane = document.getElementById('panel-tab-pane-preferencias');
      if (prefPane) prefPane.insertAdjacentElement('beforebegin', pane);
      else wrap.appendChild(pane);
    }

    let btn = nav.querySelector('[data-tab-key="planes"]');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'panel-tab-btn';
      btn.dataset.tabKey = 'planes';
      btn.textContent = 'Planes';
      const statsBtn = nav.querySelector('[data-tab-key="mercado"]');
      if (statsBtn?.nextSibling) statsBtn.insertAdjacentElement('afterend', btn);
      else nav.appendChild(btn);
    }

    const planCard = document.getElementById('panel-plan')?.closest('.panel-card');
    const grid = pane.querySelector('.panel-tab-grid');
    if (planCard && grid && planCard.parentElement !== grid) {
      grid.appendChild(planCard);
    }

    if (!btn.dataset.enterpriseBound) {
      btn.dataset.enterpriseBound = '1';
      btn.addEventListener('click', () => {
        localStorage.setItem(TAB_KEY, 'planes');
        activateEnterpriseTab('planes');
      });
    }

    nav.querySelectorAll('.panel-tab-btn').forEach(button => {
      if (button.dataset.enterpriseSyncBound === '1') return;
      button.dataset.enterpriseSyncBound = '1';
      button.addEventListener('click', () => {
        setTimeout(() => activateEnterpriseTab(localStorage.getItem(TAB_KEY) || 'alertas'), 0);
      });
    });

    activateEnterpriseTab(localStorage.getItem(TAB_KEY) || 'alertas');
  }

  function activateEnterpriseTab(key) {
    const nav = document.getElementById('panel-tabs-nav');
    if (!nav) return;
    const panes = document.querySelectorAll('.panel-tab-pane');
    const buttons = nav.querySelectorAll('.panel-tab-btn');
    const safeKey = key === 'planes' ? 'planes' : (key || 'alertas');
    panes.forEach(p => p.classList.toggle('is-active', p.id === `panel-tab-pane-${safeKey}`));
    buttons.forEach(b => b.classList.toggle('is-active', b.dataset.tabKey === safeKey));
  }

  function prettifyPlansBox() {
    const selector = document.getElementById('panel-plan-selector');
    if (!selector) return;
    injectEnterpriseStyles();

    const root = selector.firstElementChild || selector;
    if (!root) return;

    const cards = [...root.querySelectorAll(':scope > div')].filter(div => div.querySelector('button'));
    if (!cards.length) return;

    let grid = selector.querySelector('.enterprise-plan-grid');
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'enterprise-plan-grid';
      root.appendChild(grid);
    }

    cards.forEach(card => {
      const text = card.textContent || '';
      if (/\bgratis\b|\bfree\b|\$\s*0\b/i.test(text)) {
        card.remove();
        return;
      }
      if (card.parentElement !== grid) grid.appendChild(card);
      card.classList.add('enterprise-plan-card');
      if (/plan actual/i.test(text)) card.classList.add('is-current');

      if (!card.dataset.enterpriseEnhanced) {
        card.dataset.enterpriseEnhanced = '1';
        const pills = [...card.querySelectorAll('.plan-pill')].map(el => el.textContent.trim()).filter(Boolean);
        const price = pills.find(t => /\$/.test(t)) || '';
        const title = pills.find(t => !/\$/.test(t)) || 'Plan';
        const titleEl = document.createElement('div');
        titleEl.className = 'enterprise-plan-head';
        titleEl.innerHTML = `<div class="enterprise-plan-title">${title}</div><div class="enterprise-plan-price">${price}</div>`;
        card.prepend(titleEl);
      }
    });

    if (!selector.querySelector('[data-enterprise-plan-copy]')) {
      const note = document.createElement('p');
      note.dataset.enterprisePlanCopy = '1';
      note.className = 'enterprise-plan-note';
      note.textContent = 'Compará los planes profesionales y cambiá desde acá. El plan free no se muestra en esta vista comercial.';
      selector.prepend(note);
    }
  }

  function markStatsCacheHint() {
    const body = document.getElementById('historico-docente-body');
    if (!body || body.querySelector('.enterprise-stat-fast')) return;
    const hint = document.createElement('div');
    hint.className = 'enterprise-stat-fast';
    hint.textContent = 'Estadísticas optimizadas con cache local para abrir más rápido esta solapa.';
    body.appendChild(hint);
  }

  function boot() {
    installFastHistFetch();
    ensurePlansTab();
    prettifyPlansBox();
    markStatsCacheHint();
  }

  const observer = new MutationObserver(() => boot());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      boot();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    boot();
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
