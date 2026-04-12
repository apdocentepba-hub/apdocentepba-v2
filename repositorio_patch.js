(function () {
  'use strict';

  if (window.__apdRepositorioPatchLoaded) return;
  window.__apdRepositorioPatchLoaded = true;

  const DRIVE_FOLDER_ID = '1SHbvqrXKdhmVLVHCkqPisjs_K34KKxtS';
  const DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1SHbvqrXKdhmVLVHCkqPisjs_K34KKxtS';
  const DRIVE_EMBED_URL = `https://drive.google.com/embeddedfolderview?id=${DRIVE_FOLDER_ID}#list`;

  function byId(id) {
    return document.getElementById(id);
  }

  function injectStyles() {
    if (byId('apd-repositorio-style')) return;
    const style = document.createElement('style');
    style.id = 'apd-repositorio-style';
    style.textContent = `
      #panel-repositorio-card{display:grid;gap:16px}
      .repo-topnote{margin:0;color:#475569;font-size:14px;line-height:1.55}
      .repo-drive-box{border:1px solid #dbe3f0;border-radius:16px;background:#f8fafc;padding:16px;display:grid;gap:12px}
      .repo-drive-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .repo-drive-stat{background:#fff;border:1px solid rgba(15,52,96,.10);border-radius:12px;padding:12px}
      .repo-drive-k{display:block;font-size:12px;font-weight:700;color:#64748b;margin-bottom:4px}
      .repo-drive-v{display:block;font-size:14px;font-weight:800;color:#10243d;line-height:1.45}
      .repo-actions{display:flex;gap:10px;flex-wrap:wrap}
      .repo-embed-wrap{border:1px solid #dbe3f0;border-radius:16px;background:#fff;padding:10px}
      .repo-embed-frame{width:100%;min-height:760px;border:0;border-radius:12px;background:#fff}
      .repo-help{margin:0;color:#334155;line-height:1.55}
      .repo-empty-note{padding:16px;border:1px dashed #dbe3f0;border-radius:14px;background:#fff;color:#607086}
      @media (max-width: 900px){.repo-drive-grid{grid-template-columns:1fr}.repo-embed-frame{min-height:620px}}
    `;
    document.head.appendChild(style);
  }

  function cardHtml() {
    return `
      <div id="panel-repositorio-card" class="panel-card span-12">
        <div class="card-lbl-row">
          <span class="card-lbl">📚 Repositorio</span>
          <button id="repo-refresh-btn" class="mini-btn" type="button">Actualizar vista</button>
        </div>

        <p class="repo-topnote">El Repositorio ahora toma los archivos directamente desde tu carpeta de Google Drive. Todo lo que subas dentro de <strong>Repositorio</strong> va a quedar disponible acá sin tocar Cloudflare.</p>

        <div class="repo-drive-box">
          <div class="repo-drive-grid">
            <div class="repo-drive-stat">
              <span class="repo-drive-k">Carpeta madre</span>
              <span class="repo-drive-v">Repositorio</span>
            </div>
            <div class="repo-drive-stat">
              <span class="repo-drive-k">Fuente</span>
              <span class="repo-drive-v">Google Drive</span>
            </div>
            <div class="repo-drive-stat">
              <span class="repo-drive-k">Gestión</span>
              <span class="repo-drive-v">Subís desde tu Drive</span>
            </div>
          </div>

          <p class="repo-help">Podés crear subcarpetas adentro de <strong>Repositorio</strong> para ordenar por docentes, directivos, secretarios, planificaciones, normativa o lo que quieras. La vista embebida va a reflejar ese contenido.</p>

          <div class="repo-actions">
            <a class="btn btn-primary" href="${DRIVE_FOLDER_URL}" target="_blank" rel="noopener noreferrer">Abrir carpeta Repositorio</a>
            <a class="btn btn-secondary" href="${DRIVE_FOLDER_URL}" target="_blank" rel="noopener noreferrer">Subir / organizar en Drive</a>
          </div>

          <div class="repo-empty-note">
            Importante: para que otras personas vean los archivos desde acá, la carpeta <strong>Repositorio</strong> tiene que estar compartida en modo visualización para quienes quieras alcanzar desde la web.
          </div>
        </div>

        <div class="repo-embed-wrap">
          <iframe id="repo-embed-frame" class="repo-embed-frame" src="${DRIVE_EMBED_URL}" loading="lazy" referrerpolicy="no-referrer"></iframe>
        </div>
      </div>`;
  }

  function ensureCard() {
    injectStyles();
    const panel = byId('panel-content');
    if (!panel) return null;

    let card = byId('panel-repositorio-card');
    if (!card) {
      panel.insertAdjacentHTML('beforeend', cardHtml());
      card = byId('panel-repositorio-card');
      if (typeof window.APD_refreshPanelTabs === 'function') {
        window.APD_refreshPanelTabs();
      }
    }

    return card;
  }

  function refreshEmbed() {
    const frame = byId('repo-embed-frame');
    if (!frame) return;
    frame.src = `${DRIVE_EMBED_URL}&ts=${Date.now()}`;
  }

  function bindEvents() {
    const refreshBtn = byId('repo-refresh-btn');
    if (refreshBtn && refreshBtn.dataset.bound !== '1') {
      refreshBtn.dataset.bound = '1';
      refreshBtn.addEventListener('click', refreshEmbed);
    }
  }

  function boot() {
    ensureCard();
    bindEvents();
  }

  window.APD_refreshRepositorio = boot;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
