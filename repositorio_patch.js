(function () {
  'use strict';

  if (window.__apdRepositorioPatchLoaded) return;
  window.__apdRepositorioPatchLoaded = true;

  const API_BASE = (window.API_URL || 'https://ancient-wildflower-cd37.apdocentepba.workers.dev') + '/api/repositorio';
  const state = {
    items: [],
    isAdmin: false,
    loading: false,
    previewOpen: false,
    previewItem: null,
    lastToken: ''
  };

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function getToken() {
    try {
      if (typeof window.getAdminToken === 'function') return window.getAdminToken() || '';
      if (typeof window.obtenerToken === 'function') return window.obtenerToken() || '';
      return localStorage.getItem('apd_token_v2') || '';
    } catch (_) { return ''; }
  }
  function fmtDate(value) {
    const d = new Date(String(value || ''));
    if (Number.isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(d);
  }
  function fmtSize(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return '-';
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KB`;
    return `${n} B`;
  }

  function injectStyles() {
    if (byId('apd-repositorio-style')) return;
    const style = document.createElement('style');
    style.id = 'apd-repositorio-style';
    style.textContent = `
      #panel-repositorio-card{display:grid;gap:16px}
      .repo-topnote{margin:0;color:#475569;font-size:14px;line-height:1.5}
      .repo-msg{min-height:22px;font-size:14px;font-weight:700}
      .repo-msg-ok{color:#0b7a44}.repo-msg-error{color:#b42318}.repo-msg-info{color:#0f3460}
      .repo-admin-box{border:1px solid #dbe3f0;border-radius:16px;background:#f8fafc;padding:16px;display:grid;gap:12px}
      .repo-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .repo-admin-box label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#475569}
      .repo-admin-box input,.repo-admin-box textarea,.repo-admin-box select{width:100%;min-height:44px;padding:10px 12px;border:1px solid #dbe3f0;border-radius:12px;background:#fff;font:inherit}
      .repo-admin-box textarea{min-height:100px;resize:vertical}
      .repo-admin-actions{display:flex;gap:10px;flex-wrap:wrap}
      .repo-list{display:grid;gap:12px}.repo-empty{padding:18px;border:1px dashed #dbe3f0;border-radius:14px;background:#f8fafc;color:#607086;text-align:center}
      .repo-item{border:1px solid #dbe3f0;border-radius:16px;background:#fff;padding:16px;box-shadow:0 6px 18px rgba(15,52,96,.06);display:grid;gap:10px}
      .repo-item-head{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;justify-content:space-between}
      .repo-item-title{margin:0;font-size:18px;font-weight:800;color:#10243d}.repo-badges{display:flex;gap:8px;flex-wrap:wrap}
      .repo-badge{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700;background:#eef4ff;color:#0f3460}
      .repo-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .repo-meta-box{background:#f8fafc;border:1px solid rgba(15,52,96,.10);border-radius:12px;padding:10px}
      .repo-meta-k{display:block;font-size:12px;font-weight:700;color:#64748b;margin-bottom:4px}.repo-meta-v{display:block;font-size:14px;font-weight:700;color:#10243d}
      .repo-desc{margin:0;color:#334155;line-height:1.55}.repo-actions{display:flex;gap:10px;flex-wrap:wrap}
      .repo-preview{border:1px solid #dbe3f0;border-radius:16px;background:#fff;padding:14px;display:grid;gap:10px}.repo-preview.hidden{display:none!important}
      .repo-preview-head{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
      .repo-preview-frame{width:100%;min-height:520px;border:1px solid #dbe3f0;border-radius:12px;background:#f8fafc}
      .repo-preview-image{max-width:100%;max-height:520px;margin:0 auto;display:block;border-radius:12px;border:1px solid #dbe3f0;background:#fff}
      .repo-preview-text{margin:0;padding:14px;max-height:520px;overflow:auto;border:1px solid #dbe3f0;border-radius:12px;background:#0f172a;color:#cbd5e1;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.5}
      @media (max-width: 900px){.repo-admin-grid,.repo-meta{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function cardHtml() {
    return `
      <div id="panel-repositorio-card" class="panel-card span-12">
        <div class="card-lbl-row">
          <span class="card-lbl">📚 Repositorio</span>
          <button id="repo-refresh-btn" class="mini-btn" type="button">Actualizar</button>
        </div>
        <p class="repo-topnote">Documentación, planificaciones y archivos útiles para docentes, directivos y secretarios. Si sos admin, acá mismo podés subir material nuevo.</p>
        <div id="repo-msg" class="repo-msg"></div>
        <div id="repo-admin-box"></div>
        <div id="repo-preview" class="repo-preview hidden"></div>
        <div id="repo-list" class="repo-list"></div>
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
      if (typeof window.APD_refreshPanelTabs === 'function') window.APD_refreshPanelTabs();
    }
    return card;
  }

  function setMsg(text, type) {
    const box = byId('repo-msg');
    if (!box) return;
    box.textContent = text || '';
    box.className = `repo-msg ${type ? `repo-msg-${type}` : ''}`;
  }
  function authHeaders(extra) {
    const token = getToken();
    return { ...(extra || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  }
  async function fetchList() {
    const res = await fetch(`${API_BASE}/list`, { method:'GET', headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    return data;
  }
  async function uploadDoc(form) {
    const fd = new FormData(form);
    const res = await fetch(`${API_BASE}/upload`, { method:'POST', headers: authHeaders(), body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    return data;
  }

  function renderAdminBox() {
    const box = byId('repo-admin-box'); if (!box) return;
    if (!state.isAdmin) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <form id="repo-upload-form" class="repo-admin-box">
        <div class="repo-admin-grid">
          <label>Título<input type="text" name="title" placeholder="Ej: Planificación anual 5° año" required></label>
          <label>Categoría<select name="category"><option>Planificación</option><option>Documentación</option><option>Normativa</option><option>Modelos</option><option>Material didáctico</option><option>General</option></select></label>
          <label>Destinatarios<input type="text" name="audience" placeholder="Ej: Docentes / Directivos / Secretarios"></label>
          <label>Archivo<input type="file" name="file" required></label>
        </div>
        <label>Descripción<textarea name="description" placeholder="Resumen breve para que la gente entienda qué contiene el archivo"></textarea></label>
        <div class="repo-admin-actions"><button type="submit" class="btn btn-primary">Subir al repositorio</button></div>
      </form>`;
    const form = byId('repo-upload-form');
    if (form) form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      if (submit) { submit.disabled = true; submit.textContent = 'Subiendo...'; }
      setMsg('Subiendo archivo al repositorio...', 'info');
      try {
        await uploadDoc(form);
        setMsg('Archivo subido correctamente', 'ok');
        form.reset();
        await reload();
      } catch (err) {
        setMsg(err?.message || 'No se pudo subir el archivo', 'error');
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = 'Subir al repositorio'; }
      }
    });
  }

  function previewMarkup(item, textContent) {
    if (!item) return '';
    if (item.preview_kind === 'image') return `<img class="repo-preview-image" src="${esc(item.public_url)}" alt="${esc(item.title)}">`;
    if (item.preview_kind === 'pdf') return `<iframe class="repo-preview-frame" src="${esc(item.public_url)}"></iframe>`;
    if (item.preview_kind === 'text') return `<pre class="repo-preview-text">${esc(textContent || '')}</pre>`;
    return `<div class="repo-empty">Este archivo no tiene vista previa embebida. Usá Descargar.</div>`;
  }

  async function openPreview(item) {
    state.previewOpen = true; state.previewItem = item;
    const box = byId('repo-preview'); if (!box) return;
    box.classList.remove('hidden');
    box.innerHTML = `<div class="repo-preview-head"><div><strong>${esc(item.title || item.filename || 'Vista previa')}</strong><div class="repo-topnote">${esc(item.filename || '')}</div></div><button id="repo-preview-close" class="mini-btn" type="button">Cerrar vista previa</button></div><div class="repo-empty">Cargando vista previa...</div>`;
    let textContent = '';
    if (item.preview_kind === 'text') textContent = await fetch(item.public_url).then(r => r.text()).catch(() => 'No se pudo cargar el texto.');
    box.innerHTML = `<div class="repo-preview-head"><div><strong>${esc(item.title || item.filename || 'Vista previa')}</strong><div class="repo-topnote">${esc(item.filename || '')}</div></div><button id="repo-preview-close" class="mini-btn" type="button">Cerrar vista previa</button></div>${previewMarkup(item, textContent)}`;
    byId('repo-preview-close')?.addEventListener('click', closePreview);
  }
  function closePreview() {
    state.previewOpen = false; state.previewItem = null;
    const box = byId('repo-preview'); if (!box) return;
    box.classList.add('hidden'); box.innerHTML = '';
  }

  function itemHtml(item) {
    const previewBtn = item.preview_kind && item.preview_kind !== 'none' ? `<button type="button" class="btn btn-secondary repo-preview-btn" data-id="${esc(item.id)}">Vista previa</button>` : '';
    return `<article class="repo-item"><div class="repo-item-head"><div><h3 class="repo-item-title">${esc(item.title || item.filename || 'Documento')}</h3><div class="repo-badges"><span class="repo-badge">${esc(item.category || 'General')}</span><span class="repo-badge">${esc(item.audience || 'Todos')}</span></div></div><div class="repo-actions">${previewBtn}<a class="btn btn-primary" href="${esc(item.public_url || '#')}" target="_blank" rel="noopener noreferrer">Descargar</a></div></div>${item.description ? `<p class="repo-desc">${esc(item.description)}</p>` : ''}<div class="repo-meta"><div class="repo-meta-box"><span class="repo-meta-k">Archivo</span><span class="repo-meta-v">${esc(item.filename || '-')}</span></div><div class="repo-meta-box"><span class="repo-meta-k">Tamaño</span><span class="repo-meta-v">${esc(fmtSize(item.size_bytes))}</span></div><div class="repo-meta-box"><span class="repo-meta-k">Subido</span><span class="repo-meta-v">${esc(fmtDate(item.created_at))}</span></div><div class="repo-meta-box"><span class="repo-meta-k">Por</span><span class="repo-meta-v">${esc(item.uploaded_by_name || '-')}</span></div></div></article>`;
  }
  function bindListEvents() {
    document.querySelectorAll('.repo-preview-btn').forEach(btn => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const item = state.items.find(x => String(x.id) === String(btn.dataset.id));
        if (item) openPreview(item).catch(err => setMsg(err?.message || 'No se pudo abrir la vista previa', 'error'));
      });
    });
  }
  function renderList() {
    const box = byId('repo-list'); if (!box) return;
    if (!state.items.length) { box.innerHTML = `<div class="repo-empty">Todavía no hay archivos publicados en el repositorio.</div>`; return; }
    box.innerHTML = state.items.map(itemHtml).join(''); bindListEvents();
  }

  async function reload() {
    ensureCard();
    try {
      const data = await fetchList();
      state.items = Array.isArray(data.items) ? data.items : [];
      state.isAdmin = !!data.is_admin;
      renderAdminBox(); renderList(); if (!state.previewOpen) closePreview();
      setMsg('', '');
      if (typeof window.APD_refreshPanelTabs === 'function') window.APD_refreshPanelTabs();
    } catch (err) {
      renderAdminBox();
      const box = byId('repo-list'); if (box) box.innerHTML = `<div class="repo-empty">No se pudo cargar el repositorio.</div>`;
      setMsg(err?.message || 'No se pudo cargar el repositorio', 'error');
    }
  }

  function bindBaseEvents() {
    byId('repo-refresh-btn')?.addEventListener('click', () => { reload(); });
  }

  function boot() {
    ensureCard(); bindBaseEvents(); reload(); setTimeout(reload, 1500); setTimeout(reload, 3500);
    state.lastToken = getToken();
    setInterval(() => { const current = getToken(); if (current !== state.lastToken) { state.lastToken = current; reload(); } }, 2000);
  }

  window.APD_refreshRepositorio = reload;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
