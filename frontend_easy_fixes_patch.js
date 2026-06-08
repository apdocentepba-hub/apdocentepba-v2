(function () {
  'use strict';

  if (window.__apdFrontendEasyFixesPatchLoaded) return;
  window.__apdFrontendEasyFixesPatchLoaded = true;

  const LINKS = [
    { href: './herramientas-docentes.html', label: 'Herramientas docentes', icon: '🧰' },
    { href: './licencias-docentes.html', label: 'Licencias docentes', icon: '🧾' }
  ];

  function byId(id) {
    return document.getElementById(id);
  }

  function injectStyles() {
    if (byId('apd-tools-links-style')) return;
    const style = document.createElement('style');
    style.id = 'apd-tools-links-style';
    style.textContent = `
      .apd-tools-quicklinks{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;justify-content:center;font-size:14px}
      .apd-tools-quicklinks a{display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid rgba(15,79,184,.18);border-radius:999px;background:#fff;text-decoration:none;font-weight:800;color:#0f4fb8;box-shadow:0 8px 20px rgba(15,79,184,.06)}
      .apd-tools-quicklinks a:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(15,79,184,.12)}
      #panel-herramientas-card .tools-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
      #panel-herramientas-card .tools-mini{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      #panel-herramientas-card .tools-mini-box{border:1px solid #dbe7f5;background:#f8fbff;border-radius:14px;padding:12px;color:#475569;line-height:1.45}
      #panel-herramientas-card .tools-mini-box b{display:block;color:#10243d;margin-bottom:3px}
      @media(max-width:760px){#panel-herramientas-card .tools-mini{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function addHeroLinks() {
    const hero = document.querySelector('.hero-card');
    if (!hero || byId('apd-tools-hero-links')) return;

    const existingLinkRow = Array.from(hero.querySelectorAll('div')).find(function (el) {
      return el.querySelector && el.querySelector('a[href="./pid-docente.html"]');
    });

    const row = existingLinkRow || document.createElement('div');
    if (!existingLinkRow) {
      row.className = 'apd-tools-quicklinks';
      hero.appendChild(row);
    }

    row.id = 'apd-tools-hero-links';
    LINKS.forEach(function (item) {
      if (row.querySelector('a[href="' + item.href + '"]')) return;
      const a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.icon + ' ' + item.label;
      row.appendChild(a);
    });
  }

  function addFooterLinks() {
    const footer = document.querySelector('.footer-inner');
    if (!footer) return;
    LINKS.forEach(function (item) {
      if (footer.querySelector('a[href="' + item.href + '"]')) return;
      footer.appendChild(document.createTextNode(' · '));
      const a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      footer.appendChild(a);
    });
  }

  function addPanelCard() {
    const panel = byId('panel-content');
    if (!panel || byId('panel-herramientas-card')) return;

    const card = document.createElement('div');
    card.className = 'panel-card span-12';
    card.id = 'panel-herramientas-card';
    card.innerHTML = `
      <div class="card-lbl-row">
        <span class="card-lbl">🧰 Herramientas docentes</span>
      </div>
      <p class="prefs-hint">Accesos rápidos a funciones complementarias para facilitar tareas docentes y de secretaría, sin depender de que haya APD publicados.</p>
      <div class="tools-actions">
        <a class="btn btn-primary" href="./licencias-docentes.html">Abrir Asistente de Licencias</a>
        <a class="btn btn-secondary" href="./herramientas-docentes.html">Ver herramientas docentes</a>
      </div>
      <div class="tools-mini">
        <div class="tools-mini-box"><b>Licencias docentes</b>Días, artículo, notificación, documentación y validación.</div>
        <div class="tools-mini-box"><b>Próximas funciones</b>Notas, biblioteca docente, haberes y recursos útiles.</div>
      </div>
    `;

    const pidCard = byId('panel-listados-pid-card');
    if (pidCard && pidCard.parentNode) {
      pidCard.insertAdjacentElement('afterend', card);
    } else {
      panel.appendChild(card);
    }

    if (typeof window.APD_refreshPanelTabs === 'function') {
      window.APD_refreshPanelTabs();
    }
  }

  function boot() {
    injectStyles();
    addHeroLinks();
    addFooterLinks();
    addPanelCard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.APD_refreshHerramientasLinks = boot;
})();