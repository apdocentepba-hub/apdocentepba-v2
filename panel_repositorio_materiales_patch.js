(function () {
  'use strict';

  if (window.__apdRepositorioMaterialesPatchLoaded) return;
  window.__apdRepositorioMaterialesPatchLoaded = true;

  const REPO_TREE_BASE = 'https://github.com/apdocentepba-hub/apdocentepba-v2/tree/main/repositorio_materiales';
  const REPO_BLOB_BASE = 'https://github.com/apdocentepba-hub/apdocentepba-v2/blob/main/repositorio_materiales';

  const SECTIONS = [
    {
      key: 'equipo-directivo',
      label: 'Equipo Directivo',
      icon: '🏫',
      badge: 'Conducción institucional',
      folder: '01-equipo-directivo',
      description: 'Espacio para documentos de conducción, actas, líneas institucionales, acuerdos, proyectos y materiales de referencia del equipo directivo.',
      uploadHint: 'Abrí la carpeta y usá “Add file” en GitHub para subir circulares, actas, cronogramas o documentación institucional.',
      subitems: [
        'Actas y acuerdos institucionales',
        'Proyectos y líneas de trabajo',
        'Comunicaciones internas y cronogramas'
      ]
    },
    {
      key: 'secretaria',
      label: 'Secretaría',
      icon: '🗂️',
      badge: 'Gestión administrativa',
      folder: '02-secretaria',
      description: 'Repositorio para planillas, constancias, formularios, circuitos administrativos y materiales que usa la secretaría escolar.',
      uploadHint: 'Ideal para dejar modelos de notas, planillas de seguimiento, archivos administrativos y documentación de uso recurrente.',
      subitems: [
        'Planillas y formularios',
        'Constancias y modelos administrativos',
        'Circuitos y recordatorios de gestión'
      ]
    },
    {
      key: 'preceptoria',
      label: 'Preceptoría',
      icon: '🧭',
      badge: 'Seguimiento institucional',
      folder: '04-preceptoria',
      description: 'Lugar para materiales de convivencia, seguimiento, comunicación con familias, registros y recursos de preceptoría.',
      uploadHint: 'Usalo para partes, seguimientos, acuerdos de convivencia y material operativo de preceptores.',
      subitems: [
        'Registros y seguimientos',
        'Convivencia y acuerdos',
        'Comunicaciones y material operativo'
      ]
    },
    {
      key: 'profesores',
      label: 'Profesores',
      icon: '📚',
      badge: 'Planificaciones y aula',
      folder: '03-profesores',
      description: 'Espacio central para planificaciones docentes, plantillas listas para reutilizar y trabajos o recursos hechos en Canva.',
      uploadHint: 'Para cargar archivos: abrí la carpeta general o una subcarpeta específica y subí ahí tus materiales.',
      subitems: [
        {
          label: 'Planificaciones docentes',
          treeUrl: REPO_TREE_BASE + '/03-profesores/planificaciones',
          blobUrl: REPO_BLOB_BASE + '/03-profesores/planificaciones/README.md'
        },
        {
          label: 'Plantillas',
          treeUrl: REPO_TREE_BASE + '/03-profesores/plantillas',
          blobUrl: REPO_BLOB_BASE + '/03-profesores/plantillas/README.md'
        },
        {
          label: 'Trabajos en Canva',
          treeUrl: REPO_TREE_BASE + '/03-profesores/trabajos-canva',
          blobUrl: REPO_BLOB_BASE + '/03-profesores/trabajos-canva/README.md'
        }
      ]
    },
    {
      key: 'eoe-orientacion',
      label: 'EOE / Orientación',
      icon: '🤝',
      badge: 'Acompañamiento',
      folder: '05-eoe-orientacion',
      description: 'Sección para orientaciones, dispositivos de acompañamiento, materiales de intervención, seguimientos y documentos de trabajo del EOE.',
      uploadHint: 'Pensado para guías, protocolos, orientaciones y materiales de apoyo institucional.',
      subitems: [
        'Protocolos y orientaciones',
        'Materiales de intervención',
        'Seguimientos y recursos de acompañamiento'
      ]
    },
    {
      key: 'ematp-tecnicos',
      label: 'EMATP / Técnicos',
      icon: '🛠️',
      badge: 'Soporte técnico pedagógico',
      folder: '06-ematp-tecnicos',
      description: 'Repositorio para manuales, instructivos, material técnico, recursos digitales y soporte pedagógico vinculado al trabajo técnico.',
      uploadHint: 'Acá podés dejar manuales, instructivos, archivos de laboratorio/taller y recursos digitales de soporte.',
      subitems: [
        'Manuales e instructivos',
        'Recursos digitales',
        'Material técnico para talleres y laboratorios'
      ]
    }
  ].map(function (section) {
    return Object.assign({}, section, {
      treeUrl: REPO_TREE_BASE + '/' + section.folder,
      blobUrl: REPO_BLOB_BASE + '/' + section.folder + '/README.md'
    });
  });

  const state = {
    selectedKey: SECTIONS[0] ? SECTIONS[0].key : ''
  };

  function byId(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (byId('panel-repositorio-materiales-style')) return;
    const style = document.createElement('style');
    style.id = 'panel-repositorio-materiales-style';
    style.textContent = `
      .repo-mat-card{display:grid;gap:16px}
      .repo-mat-top{display:grid;gap:6px}
      .repo-mat-layout{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:16px;align-items:start}
      .repo-mat-sidebar{background:#f8fafc;border:1px solid #dbe3f0;border-radius:18px;padding:12px;display:grid;gap:8px}
      .repo-mat-navbtn{width:100%;text-align:left;border:1px solid #dbe3f0;background:#fff;border-radius:14px;padding:12px 14px;cursor:pointer;display:grid;gap:4px}
      .repo-mat-navbtn:hover{border-color:#b9c8dd}
      .repo-mat-navbtn.is-active{border-color:#0f3460;background:#eef4ff}
      .repo-mat-navttl{font-size:14px;font-weight:800;color:#10243d;display:flex;gap:8px;align-items:center}
      .repo-mat-navmeta{font-size:12px;color:#64748b;font-weight:700}
      .repo-mat-main{background:#fff;border:1px solid #dbe3f0;border-radius:18px;padding:18px;display:grid;gap:14px}
      .repo-mat-head{display:grid;gap:6px}
      .repo-mat-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#eef4ff;color:#0f3460;border:1px solid #d6e4ff;font-size:12px;font-weight:800;width:max-content}
      .repo-mat-title{font-size:20px;font-weight:800;color:#10243d;line-height:1.25}
      .repo-mat-desc{font-size:14px;line-height:1.6;color:#334155}
      .repo-mat-actions{display:flex;gap:10px;flex-wrap:wrap}
      .repo-mat-note{font-size:13px;line-height:1.55;color:#64748b;background:#f8fafc;border:1px solid #dbe3f0;border-radius:14px;padding:12px 14px}
      .repo-mat-list{display:grid;gap:10px}
      .repo-mat-item{border:1px solid #dbe3f0;border-radius:14px;padding:12px 14px;background:#fff}
      .repo-mat-itemttl{font-size:14px;font-weight:800;color:#10243d;margin-bottom:6px}
      .repo-mat-itemactions{display:flex;gap:8px;flex-wrap:wrap}
      .repo-mat-mini{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 12px;border-radius:10px;text-decoration:none;border:1px solid #dbe3f0;background:#fff;color:#0f3460;font-weight:700;font-size:13px}
      .repo-mat-mini:hover{border-color:#0f3460}
      @media (max-width:980px){.repo-mat-layout{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureCard() {
    const panelContent = byId('panel-content');
    if (!panelContent) return null;

    let card = byId('panel-repositorio-materiales-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'panel-repositorio-materiales-card';
      card.className = 'panel-card span-12';
      card.innerHTML = `
        <div class="repo-mat-card">
          <div class="repo-mat-top">
            <div class="card-lbl-row">
              <span class="card-lbl">🗃️ Repositorio de materiales</span>
              <a class="mini-btn" href="${REPO_TREE_BASE}" target="_blank" rel="noopener noreferrer">Abrir raíz</a>
            </div>
            <p class="prefs-hint">Repositorio jerárquico por roles para ordenar planificaciones, plantillas, materiales administrativos y trabajos en Canva.</p>
          </div>
          <div class="repo-mat-layout">
            <div id="repo-mat-sidebar" class="repo-mat-sidebar"></div>
            <div id="repo-mat-main" class="repo-mat-main"></div>
          </div>
        </div>
      `;
      panelContent.appendChild(card);
    }

    return card;
  }

  function getSelectedSection() {
    return SECTIONS.find(function (section) { return section.key === state.selectedKey; }) || SECTIONS[0] || null;
  }

  function renderSidebar() {
    const sidebar = byId('repo-mat-sidebar');
    if (!sidebar) return;

    sidebar.innerHTML = SECTIONS.map(function (section) {
      return `
        <button type="button" class="repo-mat-navbtn ${section.key === state.selectedKey ? 'is-active' : ''}" data-repo-section="${section.key}">
          <span class="repo-mat-navttl">${esc(section.icon)} ${esc(section.label)}</span>
          <span class="repo-mat-navmeta">${esc(section.badge)}</span>
        </button>
      `;
    }).join('');

    sidebar.querySelectorAll('[data-repo-section]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.selectedKey = btn.getAttribute('data-repo-section') || state.selectedKey;
        renderAll();
      });
    });
  }

  function renderSubitems(section) {
    const subitems = Array.isArray(section && section.subitems) ? section.subitems : [];
    if (!subitems.length) return '';

    return subitems.map(function (item) {
      if (typeof item === 'string') {
        return `
          <div class="repo-mat-item">
            <div class="repo-mat-itemttl">${esc(item)}</div>
          </div>
        `;
      }

      return `
        <div class="repo-mat-item">
          <div class="repo-mat-itemttl">${esc(item.label)}</div>
          <div class="repo-mat-itemactions">
            <a class="repo-mat-mini" href="${esc(item.treeUrl)}" target="_blank" rel="noopener noreferrer">Abrir carpeta</a>
            <a class="repo-mat-mini" href="${esc(item.blobUrl)}" target="_blank" rel="noopener noreferrer">Ver README</a>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderMain() {
    const main = byId('repo-mat-main');
    const section = getSelectedSection();
    if (!main || !section) return;

    main.innerHTML = `
      <div class="repo-mat-head">
        <span class="repo-mat-badge">${esc(section.badge)}</span>
        <div class="repo-mat-title">${esc(section.icon)} ${esc(section.label)}</div>
        <div class="repo-mat-desc">${esc(section.description)}</div>
      </div>

      <div class="repo-mat-actions">
        <a class="btn btn-primary" href="${esc(section.treeUrl)}" target="_blank" rel="noopener noreferrer">Abrir carpeta</a>
        <a class="btn btn-secondary" href="${esc(section.blobUrl)}" target="_blank" rel="noopener noreferrer">Ver README</a>
        <a class="btn btn-secondary" href="${esc(REPO_TREE_BASE)}" target="_blank" rel="noopener noreferrer">Abrir repositorio raíz</a>
      </div>

      <div class="repo-mat-note">
        ${esc(section.uploadHint)}<br><br>
        Subida real dentro de APDocentePBA todavía no quedó activada en esta versión. Para no romper el sistema, el alta de archivos queda resuelta abriendo la carpeta correspondiente del repo y cargando allí los materiales.
      </div>

      <div class="repo-mat-list">
        ${renderSubitems(section)}
      </div>
    `;
  }

  function renderAll() {
    renderSidebar();
    renderMain();
    if (typeof window.APD_refreshPanelTabs === 'function') {
      window.APD_refreshPanelTabs();
    }
  }

  function boot() {
    injectStyles();
    ensureCard();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();