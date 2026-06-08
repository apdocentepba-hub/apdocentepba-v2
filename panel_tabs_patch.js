(function () {
  'use strict';

  if (window.__apdPanelTabsPatchLoaded) return;
  window.__apdPanelTabsPatchLoaded = true;

  const TAB_STORAGE_KEY = 'apd_panel_tab_v1';
  const TAB_DEFS = [
    { key: 'inicio', label: 'Inicio' },
    { key: 'alertas', label: 'Alertas' },
    { key: 'perfil', label: 'Listados' },
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
      body{background:#f5f8ff!important}
      .header{background:#061a37!important;box-shadow:0 16px 40px rgba(6,26,55,.18)!important;border-bottom:0!important}
      .header-inner{max-width:1180px!important;margin:0 auto!important;padding:14px 22px!important;gap:18px!important}
      .brand-icon{background:rgba(255,255,255,.12)!important;border-radius:14px!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)!important}
      .brand-title{font-weight:900!important;letter-spacing:-.04em!important;color:#fff!important}
      .brand-sub{color:#bfd7ff!important}
      .top-nav{gap:10px!important;align-items:center!important;flex-wrap:wrap!important}
      .top-nav>a[href="./herramientas-docentes.html"],.top-nav>a[href="./licencias-docentes.html"]{display:none!important}
      .apd-top-tabs{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-right:4px}
      .apd-top-tab{position:relative;border:0;background:transparent;color:#eef5ff;padding:11px 10px;border-radius:0;font:inherit;font-size:13px;font-weight:800;cursor:pointer;opacity:.92}
      .apd-top-tab:hover{opacity:1;background:rgba(255,255,255,.07);border-radius:10px}
      .apd-top-tab.is-active{opacity:1;color:#fff}
      .apd-top-tab.is-active:after{content:'';position:absolute;left:10px;right:10px;bottom:-15px;height:3px;border-radius:999px;background:#2d61ff;box-shadow:0 0 18px rgba(45,97,255,.9)}
      #navPrivado{display:flex!important;gap:10px!important;align-items:center!important}
      #btnMiPanel{display:none!important}
      #btnCerrarSesion{border-radius:14px!important;background:#e22a2a!important;color:#fff!important;padding:11px 18px!important;border:0!important;font-weight:900!important;box-shadow:none!important}
      #panel-docente>.container{max-width:1180px!important;margin:0 auto!important;padding:26px 22px 0!important}
      .panel-header{display:none!important}
      .panel-tabs-wrap{max-width:1180px;margin:0 auto 18px;padding:0}
      .panel-tabs-nav{display:none!important}
      .panel-tab-pane{display:none}
      .panel-tab-pane.is-active{display:block}
      .panel-tab-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:18px}
      .panel-tab-grid>.panel-card,.panel-tab-grid>#admin-panel-card{margin:0}
      .panel-tab-grid>.prefs-card{grid-column:1 / -1}
      .panel-tab-grid>.panel-card:not([class*="span-"]){grid-column:span 12}
      .apd-panel-showcase{grid-column:1/-1!important;position:relative;overflow:hidden;border-radius:0!important;padding:0!important;background:#fff!important;border:1px solid #dbe7f5!important;box-shadow:0 20px 55px rgba(16,36,61,.08)!important}
      .apd-hero-main{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center;padding:50px 46px 40px;background:linear-gradient(135deg,#ffffff 0%,#f8fbff 56%,#eef5ff 100%)}
      .apd-hero-copy{position:relative;z-index:2;max-width:560px}
      .apd-panel-showcase-kicker{display:none}
      .apd-panel-showcase h2{font-size:clamp(38px,5vw,60px);line-height:1.05;letter-spacing:-.055em;margin:0 0 18px;color:#061a37!important;font-weight:900;max-width:640px}
      .apd-panel-showcase h2 span{display:block;color:#2448f2}
      .apd-panel-showcase p{font-size:17px;line-height:1.56;color:#334761;margin:0 0 24px;max-width:540px}
      .apd-panel-showcase-actions{display:flex;gap:14px;flex-wrap:wrap;margin:0}
      .apd-panel-showcase-actions a{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;padding:14px 18px;text-decoration:none;font-weight:900;border:1px solid #dbe7f5;background:#fff;color:#0d1b35;box-shadow:0 12px 24px rgba(16,36,61,.07)}
      .apd-panel-showcase-actions a.primary{background:#2454f5;color:#fff;border-color:#2454f5;box-shadow:0 16px 32px rgba(36,84,245,.25)}
      .apd-hero-art{position:relative;min-height:310px;display:grid;place-items:center}
      .apd-monitor{position:relative;width:min(420px,100%);background:#e9edf5;border:8px solid #1b2535;border-radius:18px;padding:18px;box-shadow:0 28px 50px rgba(16,36,61,.22);transform:perspective(900px) rotateY(-4deg)}
      .apd-monitor:after{content:'';position:absolute;left:50%;bottom:-58px;width:86px;height:58px;background:linear-gradient(#bcc7d8,#edf2fb);transform:translateX(-50%);border-radius:0 0 14px 14px}
      .apd-monitor:before{content:'';position:absolute;left:50%;bottom:-74px;width:170px;height:18px;background:#cfd8e8;transform:translateX(-50%);border-radius:999px}
      .apd-monitor-top{display:flex;align-items:center;gap:8px;background:#10244a;color:#fff;padding:8px 10px;border-radius:10px;font-size:11px;font-weight:900;margin-bottom:10px}
      .apd-monitor-row{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;background:#fff;border-radius:12px;margin:9px 0;padding:10px;box-shadow:0 2px 10px rgba(16,36,61,.05)}
      .apd-monitor-row i{width:34px;height:34px;border-radius:11px;background:#eef4ff;display:grid;place-items:center;font-style:normal}
      .apd-monitor-line b{display:block;width:65%;height:9px;background:#dfe8fa;border-radius:999px;margin-bottom:6px}.apd-monitor-line span{display:block;width:44%;height:7px;background:#eef3fb;border-radius:999px}.apd-monitor-badge{background:#2454f5;color:#fff;border-radius:999px;padding:3px 7px;font-size:10px;font-weight:900}
      .apd-float-bell{position:absolute;right:8px;top:18px;width:76px;height:76px;border-radius:18px;background:linear-gradient(135deg,#2454f5,#687cff);color:#fff;display:grid;place-items:center;font-size:34px;box-shadow:0 20px 44px rgba(36,84,245,.32)}
      .apd-float-bell:after{content:'1';position:absolute;right:-8px;top:-8px;width:24px;height:24px;border-radius:50%;background:#e72e36;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:900;border:3px solid #fff}
      .apd-books{position:absolute;right:30px;bottom:14px;font-size:66px;filter:drop-shadow(0 18px 14px rgba(16,36,61,.18))}.apd-plant{position:absolute;left:4px;bottom:28px;font-size:58px;filter:drop-shadow(0 14px 12px rgba(16,36,61,.12))}
      .apd-panel-quick{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px;padding:30px 46px 28px;border-top:1px solid #edf2f8;background:#fff}
      .apd-panel-quick a{background:#fff;border:1px solid #dbe7f5;border-radius:18px;padding:18px 18px 20px;text-decoration:none;color:#10243d;box-shadow:0 10px 26px rgba(16,36,61,.05);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
      .apd-panel-quick a:hover{transform:translateY(-2px);box-shadow:0 16px 32px rgba(16,36,61,.10);border-color:#bcd2f0}
      .apd-panel-quick i{width:42px;height:42px;border-radius:14px;background:#eef6ff;display:grid;place-items:center;font-style:normal;font-size:23px;margin-bottom:14px}
      .apd-panel-quick b{display:block;margin-bottom:6px;color:#061a37;font-size:16px}
      .apd-panel-quick span{display:block;color:#42526b;font-size:13px;line-height:1.38;min-height:34px}
      .apd-panel-quick em{display:inline-flex;margin-top:14px;color:#2454f5;font-style:normal;font-weight:900;font-size:18px}
      .apd-panel-benefits{grid-column:1/-1!important;background:#fff!important;border:1px solid #dbe7f5!important;border-radius:0!important;padding:28px 46px!important;box-shadow:0 18px 42px rgba(16,36,61,.05)!important}
      .apd-panel-benefits h3{margin:0 0 20px;font-size:25px;letter-spacing:-.04em;color:#061a37}.apd-benefit-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.apd-benefit{border-left:1px solid #dbe7f5;padding:0 20px}.apd-benefit:first-child{border-left:0;padding-left:0}.apd-benefit i{width:44px;height:44px;border-radius:14px;background:#eef6ff;display:grid;place-items:center;font-style:normal;font-size:24px;margin-bottom:12px}.apd-benefit b{display:block;margin-bottom:7px;color:#061a37}.apd-benefit span{font-size:13px;color:#42526b;line-height:1.45}
      .panel-card:not(.apd-panel-showcase):not(.apd-panel-benefits){border-radius:22px!important;border:1px solid #dbe7f5!important;box-shadow:0 12px 30px rgba(16,36,61,.05)!important;background:#fff!important}
      .footer{background:#061a37!important;margin-top:44px!important}.footer-inner{max-width:1180px!important;margin:0 auto!important;color:#dbeafe!important}.footer-inner a{color:#cfe0ff!important;text-decoration:none!important;font-weight:800!important}
      @media (max-width: 1040px){.apd-top-tabs{order:3;width:100%;justify-content:center}.apd-top-tab.is-active:after{bottom:-4px}.apd-hero-main{grid-template-columns:1fr}.apd-hero-art{display:none}.apd-panel-quick{grid-template-columns:repeat(2,1fr)}.apd-benefit-grid{grid-template-columns:repeat(2,1fr)}.apd-benefit:nth-child(odd){border-left:0;padding-left:0}}
      @media (max-width: 620px){#panel-docente>.container{padding:18px 14px 0!important}.apd-hero-main{padding:30px 22px}.apd-panel-showcase h2{font-size:36px}.apd-panel-quick{grid-template-columns:1fr;padding:22px}.apd-panel-benefits{padding:22px!important}.apd-benefit-grid{grid-template-columns:1fr}.apd-benefit{border-left:0;padding-left:0}.header-inner{padding:12px 14px!important}}
    `;
    document.head.appendChild(style);
  }

  function getPanelDocente() { return document.getElementById('panel-docente'); }
  function getPanelContent() { return document.getElementById('panel-content'); }

  function ensureHeaderTabs() {
    const topNav = document.querySelector('.top-nav');
    if (!topNav) return;
    let holder = document.getElementById('apd-top-tabs');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'apd-top-tabs';
      holder.className = 'apd-top-tabs';
      const privado = document.getElementById('navPrivado');
      topNav.insertBefore(holder, privado || topNav.firstChild);
    }
    if (!holder.dataset.ready) {
      holder.innerHTML = TAB_DEFS.map(tab => `<button type="button" class="apd-top-tab" data-top-tab-key="${tab.key}">${tab.label}</button>`).join('');
      holder.dataset.ready = '1';
      holder.querySelectorAll('[data-top-tab-key]').forEach(btn => btn.addEventListener('click', () => activateTab(btn.getAttribute('data-top-tab-key') || 'inicio')));
    }
  }

  function syncHeaderTabs(activeKey) {
    document.querySelectorAll('.apd-top-tab[data-top-tab-key]').forEach(btn => btn.classList.toggle('is-active', btn.getAttribute('data-top-tab-key') === activeKey));
  }

  function ensureShell() {
    const section = getPanelDocente();
    const content = getPanelContent();
    if (!section || !content) return null;
    injectStyles();
    ensureHeaderTabs();

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
      nav.querySelectorAll('[data-tab-key]').forEach(btn => btn.addEventListener('click', () => activateTab(btn.getAttribute('data-tab-key') || 'inicio')));
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
        <div class="apd-hero-main">
          <div class="apd-hero-copy">
            <div class="apd-panel-showcase-kicker">Panel docente PBA</div>
            <h2>Tu acceso rápido a la información <span>docente de PBA</span></h2>
            <p>Alertas de Actos Públicos Digitales, análisis de cargos, herramientas y mucho más.</p>
            <div class="apd-panel-showcase-actions">
              <a class="primary" href="./licencias-docentes.html">🔔 Ver mis alertas</a>
              <a href="./herramientas-docentes.html">▦ Ir al panel</a>
            </div>
          </div>
          <div class="apd-hero-art">
            <div class="apd-plant">🪴</div>
            <div class="apd-monitor">
              <div class="apd-monitor-top">🔔 APDocentePBA</div>
              <div class="apd-monitor-row"><i>🔔</i><div class="apd-monitor-line"><b></b><span></span></div><em class="apd-monitor-badge">12</em></div>
              <div class="apd-monitor-row"><i>📋</i><div class="apd-monitor-line"><b></b><span></span></div><em class="apd-monitor-badge">8</em></div>
              <div class="apd-monitor-row"><i>🧰</i><div class="apd-monitor-line"><b></b><span></span></div><em class="apd-monitor-badge">Ver más</em></div>
            </div>
            <div class="apd-float-bell">🔔</div>
            <div class="apd-books">📚</div>
          </div>
        </div>
        <div class="apd-panel-quick">
          <a href="./como-funciona.html"><i>🔔</i><b>Cómo funciona</b><span>Conocé cómo funciona el sistema.</span><em>→</em></a>
          <a href="./actos-publicos-digitales.html"><i>📋</i><b>APD</b><span>Actos Públicos Digitales.</span><em>→</em></a>
          <a href="./pid-docente.html"><i>🎓</i><b>PID docente</b><span>Planilla de Inscripción Digital.</span><em>→</em></a>
          <a href="./herramientas-docentes.html"><i>🧰</i><b>Herramientas</b><span>Recursos y utilidades para docentes.</span><em>→</em></a>
          <a href="./licencias-docentes.html"><i>🧾</i><b>Licencias</b><span>Asistente de licencias docentes PBA.</span><em>→</em></a>
        </div>
      `;
    }
    if (card.parentElement !== grid) grid.prepend(card);
    else if (grid.firstElementChild !== card) grid.prepend(card);
  }

  function ensurePanelBenefits() {
    const grid = paneGrid('inicio');
    if (!grid) return;
    let card = document.getElementById('apd-panel-benefits');
    if (!card) {
      card = document.createElement('div');
      card.id = 'apd-panel-benefits';
      card.className = 'panel-card span-12 apd-panel-benefits';
      card.innerHTML = `
        <h3>¿Qué podés hacer en APDocentePBA?</h3>
        <div class="apd-benefit-grid">
          <div class="apd-benefit"><i>🔔</i><b>Recibí alertas</b><span>Nuevos actos públicos apenas se publican.</span></div>
          <div class="apd-benefit"><i>🔎</i><b>Analizá cargos</b><span>Información clave para tomar mejores decisiones.</span></div>
          <div class="apd-benefit"><i>📋</i><b>Organizá tu PID</b><span>Cargá y gestioná tu Planilla de Inscripción Digital.</span></div>
          <div class="apd-benefit"><i>📊</i><b>Accedé a estadísticas</b><span>Datos actualizados para planificar tu carrera.</span></div>
        </div>
      `;
    }
    const showcase = document.getElementById('apd-panel-showcase');
    if (showcase && card.previousElementSibling !== showcase) showcase.insertAdjacentElement('afterend', card);
    else if (!showcase && card.parentElement !== grid) grid.prepend(card);
  }

  function repartitionCards() {
    ensureShell();
    ensurePanelShowcase();
    ensurePanelBenefits();
    moveCardByContentId('panel-datos-docente', 'inicio');
    moveCardByContentId('panel-preferencias-resumen', 'inicio');
    moveCardByContentId('panel-plan', 'inicio');
    moveCardByContentId('panel-canales', 'inicio');
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
      const topBtn = document.querySelector(`.apd-top-tab[data-top-tab-key="${tab.key}"]`);
      if (topBtn) topBtn.classList.toggle('hidden', !sectionHasVisibleCards(tab.key));
    });
    const current = localStorage.getItem(TAB_STORAGE_KEY) || 'inicio';
    const activeBtn = document.querySelector(`.panel-tab-btn[data-tab-key="${current}"]:not(.hidden)`);
    if (!activeBtn) {
      const firstVisible = document.querySelector('.panel-tab-btn[data-tab-key]:not(.hidden)') || document.querySelector('.apd-top-tab[data-top-tab-key]:not(.hidden)');
      if (firstVisible) activateTab(firstVisible.getAttribute('data-tab-key') || firstVisible.getAttribute('data-top-tab-key') || 'inicio');
      return;
    }
    activateTab(current);
  }

  function activateTab(key) {
    const visibleBtn = document.querySelector(`.panel-tab-btn[data-tab-key="${key}"]:not(.hidden)`) || document.querySelector(`.apd-top-tab[data-top-tab-key="${key}"]:not(.hidden)`);
    const fallbackBtn = visibleBtn || document.querySelector('.panel-tab-btn[data-tab-key]:not(.hidden)') || document.querySelector('.apd-top-tab[data-top-tab-key]:not(.hidden)');
    const resolved = fallbackBtn?.getAttribute('data-tab-key') || fallbackBtn?.getAttribute('data-top-tab-key') || 'inicio';
    localStorage.setItem(TAB_STORAGE_KEY, resolved);
    TAB_DEFS.forEach(tab => {
      const btn = document.querySelector(`.panel-tab-btn[data-tab-key="${tab.key}"]`);
      const pane = document.getElementById(`panel-tab-pane-${tab.key}`);
      btn?.classList.toggle('is-active', tab.key === resolved);
      pane?.classList.toggle('is-active', tab.key === resolved);
    });
    syncHeaderTabs(resolved);
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