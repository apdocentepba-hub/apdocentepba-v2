(function () {
  'use strict';

  if (window.__apdSafeDashboardRestoreLoaded) return;
  window.__apdSafeDashboardRestoreLoaded = true;

  const PROFILE_KEY = 'apd_safe_profile_v1';
  const LISTADOS_KEY = 'apd_safe_listados_v1';
  const ABC_IMPORT_TYPE = 'APD_ABC_LISTADOS';
  const ABC_POPUP_NAME = 'apd_abc_import';
  const ABC_POPUP_FEATURES = 'popup=yes,width=1180,height=820,left=80,top=60,resizable=yes,scrollbars=yes';

  function panelContent() {
    return document.getElementById('panel-content');
  }

  function panelSection() {
    return document.getElementById('panel-docente');
  }

  function makeCard(id, span, label, bodyId, extraClass = '') {
    const card = document.createElement('div');
    card.id = id;
    card.className = `panel-card ${span} ${extraClass}`.trim();
    card.innerHTML = `
      <div class="card-lbl">${label}</div>
      <div id="${bodyId}"></div>
    `;
    return card;
  }

  function recargarPanel() {
    document.getElementById('btn-recargar-panel')?.click();
  }

  function scrollToId(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function esc(v) {
    return String(v || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function normalizeText(v) {
    return String(v || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokens(v) {
    return normalizeText(v).split(' ').filter(t => t && t.length > 2);
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getStoredProfile() {
    return readJSON(PROFILE_KEY, { dni: '', consentimiento: false, updatedAt: null });
  }

  function saveProfile(profile) {
    writeJSON(PROFILE_KEY, {
      dni: String(profile?.dni || '').replace(/\D/g, ''),
      consentimiento: !!profile?.consentimiento,
      updatedAt: new Date().toISOString()
    });
  }

  function getStoredListados() {
    return readJSON(LISTADOS_KEY, { dni: '', importedAt: null, rows: [] });
  }

  function saveListados(payload) {
    writeJSON(LISTADOS_KEY, {
      dni: String(payload?.dni || '').replace(/\D/g, ''),
      importedAt: new Date().toISOString(),
      rows: Array.isArray(payload?.rows) ? payload.rows : []
    });
  }

  function clearListados() {
    writeJSON(LISTADOS_KEY, { dni: '', importedAt: null, rows: [] });
  }

  function fmtFecha(v) {
    const raw = String(v || '').trim();
    if (!raw) return '-';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(d);
  }

  function fmtNum(v, digits = 0) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return n.toLocaleString('es-AR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function puntajeNum(v) {
    const raw = String(v || '').replace(',', '.').replace(/[^0-9.\-]/g, '');
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function openAbcPopup(dni) {
    const u = new URL('https://abc.gob.ar/listado-oficial');
    if (dni) u.searchParams.set('apd_dni', String(dni).replace(/\D/g, ''));
    const ref = window.open(u.toString(), ABC_POPUP_NAME, ABC_POPUP_FEATURES);
    if (ref) ref.focus();
    return ref;
  }

  function buildBookmarkletHref() {
    const source = `(async()=>{const TYPE='${ABC_IMPORT_TYPE}';const TARGET='*';const sleep=ms=>new Promise(r=>setTimeout(r,ms));const norm=s=>String(s||'').replace(/\\u00a0/g,' ').replace(/\\s+/g,' ').trim();const post=(status,payload,message)=>{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:TYPE,status,payload,message,source:'abc-bookmarklet'},TARGET);}};const visible=el=>!!el&&el.offsetParent!==null;const allVisible=sel=>[...document.querySelectorAll(sel)].filter(visible);const textOf=el=>norm(el&&(el.innerText||el.textContent||''));function searchButton(){const buttons=allVisible('button,a,div,span');return buttons.find(el=>/^buscar$/i.test(textOf(el)))||null;}function fieldScore(el){const meta=[el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ');if(/dni|apellido|nombre|buscar/i.test(meta))return 10;return 0;}function searchInput(){const btn=searchButton();if(btn){let root=btn.parentElement;for(let depth=0;depth<5&&root;depth++,root=root.parentElement){const inputs=[...root.querySelectorAll('input')].filter(visible);if(inputs.length){inputs.sort((a,b)=>fieldScore(b)-fieldScore(a));return inputs[0];}}}const inputs=allVisible('input');inputs.sort((a,b)=>fieldScore(b)-fieldScore(a));return inputs[0]||null;}function fireInput(el,value){try{el.focus();el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter',code:'Enter'}));}catch(e){}}function launchSearch(dni){const input=searchInput();const btn=searchButton();if(input)fireInput(input,dni);if(btn){btn.click();return true;}if(input){fireInput(input,dni);return true;}return false;}function findCardCandidates(){const els=allVisible('div,article,section,li');const hits=els.filter(el=>{const t=textOf(el);if(!t)return false;if(!/\\b\\d{7,9}\\b/.test(t))return false;if(!/Puntaje:/i.test(t))return false;if(!/Distrito:/i.test(t))return false;if(!/Cargo\\s*Area:/i.test(t))return false;if(t.length<80||t.length>1400)return false;return true;});return hits.filter(el=>!hits.some(other=>other!==el&&el.contains(other)));}function parseCardText(t){const text=String(t||'').replace(/\\u00a0/g,' ');const dni=/\\b(\\d{7,9})\\b/.exec(text)?.[1]||'';const puntaje=/Puntaje:\\s*([0-9.,]+)/i.exec(text)?.[1]||'';const orden=/Orden:\\s*([0-9]+)/i.exec(text)?.[1]||'';const cargo=(/Cargo\\s*Area:\\s*([\\s\\S]*?)(?=\\bApto\\s*F[ií]sico:|\\bDistrito:|\\bRama:|\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const distrito=(/Distrito:\\s*([\\s\\S]*?)(?=\\bRama:|\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const rama=(/Rama:\\s*([\\s\\S]*?)(?=\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const tipo=(/Tipo de Listado:\\s*([\\s\\S]*?)(?=\\bPuntaje:|\\bOrden:|$)/i.exec(text)?.[1]||'OFICIAL').replace(/\\s+/g,' ').trim();return{dni:norm(dni),puntaje:norm(puntaje),orden:norm(orden),cargo:norm(cargo),distrito:norm(distrito),rama:norm(rama),tipo_listado:norm(tipo)}}async function scrapeRows(){const items=[];for(let i=0;i<50;i++){await sleep(500);const cards=findCardCandidates();if(cards.length){cards.forEach(card=>{const item=parseCardText(card.innerText);const key=[item.dni,item.cargo,item.puntaje,item.distrito,item.rama,item.orden].join('|');if(item.dni&&item.cargo&&!items.some(x=>x.key===key)){items.push({key,...item});}});break;}if(i===5||i===12)launchSearch(window.__dniABC);}return items.map(item=>({anio:new Date().getFullYear(),tipo_listado:item.tipo_listado||'OFICIAL',distrito:item.distrito,cargo:item.cargo,materia:item.rama,puntaje:item.puntaje,fuente:'abc_favorito',raw_text:JSON.stringify(item)}));}try{const url=new URL(location.href);const dni=String(url.searchParams.get('apd_dni')||prompt('Ingresá DNI para traer la información')||'').replace(/\\D/g,'');if(!dni)throw new Error('Necesitás indicar el DNI.');window.__dniABC=dni;post('progress',null,'Preparando búsqueda en ABC...');launchSearch(dni);const rows=await scrapeRows();if(!rows.length)throw new Error('No pude leer resultados visibles en ABC.');post('ok',{dni,rows,mode:'scrape-dom'},'Listados capturados desde ABC');setTimeout(()=>{try{window.close();}catch(e){}},400);}catch(err){post('error',null,String(err?.message||err));alert(String(err?.message||err));}})();`;
    return `javascript:${encodeURIComponent(source)}`;
  }

  function getPreferenceSummary() {
    const box = document.getElementById('panel-preferencias-resumen');
    const out = { distritos: [], cargos: [] };
    if (!box) return out;
    const ps = Array.from(box.querySelectorAll('p')).map(p => p.textContent || '');
    const distLine = ps.find(x => x.toLowerCase().includes('distritos:')) || '';
    const cargosLine = ps.find(x => x.toLowerCase().includes('cargos/materias:')) || '';
    out.distritos = distLine.split(':').slice(1).join(':').split('/').map(x => x.trim()).filter(Boolean).filter(x => !x.startsWith('('));
    out.cargos = cargosLine.split(':').slice(1).join(':').split(',').map(x => x.trim()).filter(Boolean).filter(x => !x.startsWith('('));
    return out;
  }

  function rowMatches(row, prefs) {
    const rowDistrict = normalizeText(row?.distrito || '');
    const rowCargo = normalizeText(`${row?.cargo || ''} ${row?.materia || ''}`);
    const districtOk = !prefs.distritos.length || prefs.distritos.some(d => {
      const nd = normalizeText(d);
      return nd && (rowDistrict.includes(nd) || nd.includes(rowDistrict));
    });
    const cargoOk = !prefs.cargos.length || prefs.cargos.some(c => {
      const nc = normalizeText(c);
      if (!nc) return false;
      if (rowCargo.includes(nc) || nc.includes(rowCargo)) return true;
      const rowT = tokens(rowCargo);
      const prefT = tokens(nc);
      return prefT.some(t => rowT.includes(t));
    });
    return districtOk && cargoOk;
  }

  function getComputedData() {
    const stored = getStoredListados();
    const prefs = getPreferenceSummary();
    const rows = Array.isArray(stored.rows) ? stored.rows.slice() : [];
    const compatibles = rows.filter(r => rowMatches(r, prefs));
    const topRows = rows.slice().sort((a, b) => (puntajeNum(b.puntaje) || -1) - (puntajeNum(a.puntaje) || -1)).slice(0, 8);
    const byDistrict = new Map();
    const byCargo = new Map();
    rows.forEach(r => {
      const d = String(r.distrito || 'Sin distrito').trim() || 'Sin distrito';
      const c = String(r.cargo || r.materia || 'Sin cargo').trim() || 'Sin cargo';
      byDistrict.set(d, (byDistrict.get(d) || 0) + 1);
      byCargo.set(c, (byCargo.get(c) || 0) + 1);
    });
    const topDistricts = [...byDistrict.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
    const topCargos = [...byCargo.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
    const avgPuntaje = compatibles.length
      ? compatibles.map(r => puntajeNum(r.puntaje)).filter(v => v != null).reduce((a,b)=>a+b,0) / (compatibles.map(r => puntajeNum(r.puntaje)).filter(v => v != null).length || 1)
      : null;
    return { stored, prefs, rows, compatibles, topRows, topDistricts, topCargos, avgPuntaje };
  }

  function ensureStyles() {
    if (document.getElementById('safe-dashboard-restore-style')) return;
    const style = document.createElement('style');
    style.id = 'safe-dashboard-restore-style';
    style.textContent = `
      .safe-kicker{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;opacity:.78;margin-bottom:6px}
      .safe-title{font-size:18px;font-weight:800;line-height:1.25;margin:0 0 8px 0;color:#0f3460}
      .safe-text{font-size:14px;line-height:1.5;color:#334155}
      .safe-chip-row,.safe-actions,.safe-badge-row{display:flex;gap:8px;flex-wrap:wrap}
      .safe-chip{border:1px solid rgba(15,52,96,.12);background:#fff;color:#0f3460;padding:8px 12px;border-radius:999px;font:inherit;font-weight:700;cursor:pointer}
      .safe-stack{display:grid;gap:12px}
      .safe-box{padding:12px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:#fff}
      .safe-box h4{margin:0 0 6px 0;font-size:15px;color:#0f3460}
      .safe-box p{margin:0;font-size:14px;line-height:1.5;color:#334155}
      .safe-note{margin-top:8px;font-size:12px;color:#64748b}
      .safe-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(15,52,96,.06);color:#0f3460;font-size:12px;font-weight:700}
      .safe-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .safe-input{width:100%;padding:10px 12px;border:1px solid rgba(15,52,96,.15);border-radius:12px;font:inherit}
      .safe-check{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff}
      .safe-msg{font-size:13px;color:#334155}
      .safe-msg.ok{color:#166534}.safe-msg.error{color:#991b1b}.safe-msg.info{color:#0f3460}
      .safe-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .safe-stat{padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;text-align:center}
      .safe-stat strong{display:block;font-size:22px;color:#0f3460}
      .safe-list{display:grid;gap:8px}
      .safe-item{padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff}
      .safe-item-title{font-weight:800;color:#0f3460;font-size:14px}
      .safe-item-sub{font-size:13px;color:#334155;margin-top:4px}
      .safe-mini-list{margin:0;padding-left:18px;color:#334155;font-size:13px;line-height:1.55}
      .safe-empty{padding:12px;border:1px dashed rgba(15,52,96,.2);border-radius:12px;background:#fff;color:#475569;font-size:14px}
      @media (max-width: 900px){.safe-grid-2,.safe-stat-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureCard(id, span, label, bodyId) {
    let card = document.getElementById(id);
    if (!card) {
      const root = panelContent();
      if (!root) return null;
      card = makeCard(id, span, label, bodyId);
      root.appendChild(card);
    }
    return document.getElementById(bodyId);
  }

  function ensureQuickNav(root) {
    if (document.getElementById('panel-safe-quicknav')) return;
    const card = makeCard('panel-safe-quicknav', 'span-12', '🧩 Recuperación del panel', 'safe-quicknav-body');
    root.insertBefore(card, root.firstChild);
  }

  function renderQuickNav() {
    const body = document.getElementById('safe-quicknav-body');
    if (!body) return;
    body.innerHTML = `
      <div class="safe-kicker">Reconstrucción segura</div>
      <h3 class="safe-title">Volvió la base estable del panel</h3>
      <div class="safe-text">Ahora estamos reponiendo módulos reales, pero en capas seguras y desacopladas.</div>
      <div class="safe-badge-row" style="margin-top:8px">
        <span class="safe-badge">✅ Login estable</span>
        <span class="safe-badge">✅ Alertas vivas</span>
        <span class="safe-badge">✅ CPU más baja</span>
        <span class="safe-badge">✅ ABC/Listados local</span>
      </div>
      <div class="safe-chip-row" style="margin-top:12px">
        <button id="safe-nav-alertas" class="safe-chip" type="button">Ir a alertas</button>
        <button id="safe-nav-radar" class="safe-chip" type="button">Ir al radar</button>
        <button id="safe-nav-perfil" class="safe-chip" type="button">Ir a perfil</button>
        <button id="safe-nav-listados" class="safe-chip" type="button">Ir a listados</button>
        <button id="safe-nav-mercado" class="safe-chip" type="button">Ir a mercado</button>
      </div>
    `;
    document.getElementById('safe-nav-alertas')?.addEventListener('click', () => scrollToId('panel-alertas'));
    document.getElementById('safe-nav-radar')?.addEventListener('click', () => scrollToId('panel-radar-provincia'));
    document.getElementById('safe-nav-perfil')?.addEventListener('click', () => scrollToId('panel-perfil-docente'));
    document.getElementById('safe-nav-listados')?.addEventListener('click', () => scrollToId('panel-listados-docente'));
    document.getElementById('safe-nav-mercado')?.addEventListener('click', () => scrollToId('panel-historico-docente'));
  }

  function renderProfileCard() {
    const body = ensureCard('panel-perfil-docente', 'span-4', '🪪 Perfil docente', 'perfil-docente-body');
    if (!body) return;
    const profile = getStoredProfile();
    const stored = getStoredListados();
    body.innerHTML = `
      <div class="safe-stack">
        <div class="safe-box">
          <h4>Importación desde ABC</h4>
          <p>Cargá tu DNI, abrí ABC y usá el favorito <strong>Traer a APDocentePBA</strong>. Los resultados quedan guardados localmente en este navegador sin depender todavía del backend roto.</p>
          <div class="safe-note">Última importación: ${esc(stored.importedAt ? fmtFecha(stored.importedAt) : 'todavía no hay datos')}</div>
        </div>
        <div class="safe-grid-2">
          <div>
            <div class="safe-kicker">DNI</div>
            <input id="safe-profile-dni" class="safe-input" type="text" inputmode="numeric" placeholder="Solo números" value="${esc(profile.dni || '')}">
          </div>
          <div>
            <div class="safe-kicker">Estado</div>
            <div class="safe-msg info">${stored.rows?.length ? `Hay ${stored.rows.length} fila(s) guardadas localmente.` : 'Todavía no hay filas importadas.'}</div>
          </div>
        </div>
        <label class="safe-check">
          <input id="safe-profile-consent" type="checkbox" ${profile.consentimiento ? 'checked' : ''}>
          <div>
            <strong>Autorizo usar mis datos de listados</strong>
            <div class="safe-note">Solo para mostrar compatibilidad, listados y mercado dentro de este navegador.</div>
          </div>
        </label>
        <div id="safe-profile-msg" class="safe-msg info"></div>
        <div class="safe-actions">
          <button id="safe-profile-open-abc" class="btn btn-secondary" type="button">Abrir ABC</button>
          <a id="safe-profile-bookmarklet" class="btn btn-outline" href="${buildBookmarkletHref()}" draggable="true">Guardar favorito “Traer a APDocentePBA”</a>
          <button id="safe-profile-save" class="btn btn-outline" type="button">Guardar datos locales</button>
          <button id="safe-profile-clear" class="btn btn-outline" type="button">Limpiar perfil local</button>
        </div>
      </div>
    `;
    document.getElementById('safe-profile-open-abc')?.addEventListener('click', () => {
      const dni = String(document.getElementById('safe-profile-dni')?.value || '').replace(/\D/g, '');
      const consentimiento = !!document.getElementById('safe-profile-consent')?.checked;
      if (!dni) return renderProfileMsg('Primero cargá tu DNI.', 'error');
      if (!consentimiento) return renderProfileMsg('Necesitás aceptar el consentimiento para continuar.', 'error');
      saveProfile({ dni, consentimiento });
      const popup = openAbcPopup(dni);
      if (!popup) return renderProfileMsg('El navegador bloqueó la ventana de ABC.', 'error');
      renderProfileMsg('ABC abierto. Después tocá tu favorito “Traer a APDocentePBA”.', 'ok');
    });
    document.getElementById('safe-profile-save')?.addEventListener('click', () => {
      const dni = String(document.getElementById('safe-profile-dni')?.value || '').replace(/\D/g, '');
      const consentimiento = !!document.getElementById('safe-profile-consent')?.checked;
      saveProfile({ dni, consentimiento });
      renderProfileMsg('Perfil local guardado.', 'ok');
    });
    document.getElementById('safe-profile-clear')?.addEventListener('click', () => {
      saveProfile({ dni: '', consentimiento: false });
      renderProfileCard();
    });
  }

  function renderProfileMsg(text, type) {
    const el = document.getElementById('safe-profile-msg');
    if (!el) return;
    el.textContent = String(text || '');
    el.className = `safe-msg ${type || 'info'}`;
  }

  function renderListadosCard() {
    const body = ensureCard('panel-listados-docente', 'span-8', '📚 Mis listados', 'listados-docente-body');
    if (!body) return;
    const data = getComputedData();
    if (!data.rows.length) {
      body.innerHTML = `
        <div class="safe-stack">
          <div class="safe-empty">Todavía no hay listados guardados localmente. Abrí ABC desde Perfil docente y usá el favorito “Traer a APDocentePBA”.</div>
          <div class="safe-actions">
            <button id="safe-listados-radar" class="btn btn-secondary" type="button">Mirar radar provincial</button>
            <button id="safe-listados-reload" class="btn btn-outline" type="button">Recargar panel</button>
          </div>
        </div>
      `;
      document.getElementById('safe-listados-radar')?.addEventListener('click', () => scrollToId('panel-radar-provincia'));
      document.getElementById('safe-listados-reload')?.addEventListener('click', recargarPanel);
      return;
    }
    body.innerHTML = `
      <div class="safe-stack">
        <div class="safe-stat-grid">
          <div class="safe-stat"><strong>${fmtNum(data.rows.length)}</strong><span>Filas</span></div>
          <div class="safe-stat"><strong>${fmtNum(data.compatibles.length)}</strong><span>Compatibles</span></div>
          <div class="safe-stat"><strong>${data.avgPuntaje != null ? fmtNum(data.avgPuntaje, 2) : '-'}</strong><span>Puntaje prom.</span></div>
        </div>
        <div class="safe-box">
          <h4>Última importación</h4>
          <p>DNI: ${esc(data.stored.dni || '-')} · ${esc(data.stored.importedAt ? fmtFecha(data.stored.importedAt) : '-')}</p>
          <div class="safe-note">La compatibilidad se calcula contra tus distritos y cargos visibles en el panel actual.</div>
        </div>
        <div class="safe-box">
          <h4>Top resultados guardados</h4>
          <div class="safe-list">
            ${data.topRows.map(row => `
              <div class="safe-item">
                <div class="safe-item-title">${esc(row.cargo || row.materia || 'Sin cargo')}</div>
                <div class="safe-item-sub">${esc(row.distrito || 'Sin distrito')} · Puntaje ${esc(row.puntaje || '-')} · ${rowMatches(row, data.prefs) ? 'Compatible' : 'Fuera de filtro'}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="safe-actions">
          <button id="safe-listados-recalc" class="btn btn-secondary" type="button">Recalcular compatibilidad</button>
          <button id="safe-listados-clear" class="btn btn-outline" type="button">Limpiar listados</button>
        </div>
      </div>
    `;
    document.getElementById('safe-listados-recalc')?.addEventListener('click', renderAll);
    document.getElementById('safe-listados-clear')?.addEventListener('click', () => {
      clearListados();
      renderAll();
    });
  }

  function renderMercadoCard() {
    const body = ensureCard('panel-historico-docente', 'span-12', '🧭 Mercado APD histórico', 'historico-docente-body');
    if (!body) return;
    const data = getComputedData();
    if (!data.rows.length) {
      body.innerHTML = `
        <div class="safe-stack">
          <div class="safe-empty">Mercado APD histórico necesita al menos una importación local desde ABC para mostrar tendencias simples.</div>
          <div class="safe-actions">
            <button id="safe-mercado-radar" class="btn btn-secondary" type="button">Ir al radar provincial</button>
          </div>
        </div>
      `;
      document.getElementById('safe-mercado-radar')?.addEventListener('click', () => scrollToId('panel-radar-provincia'));
      return;
    }
    body.innerHTML = `
      <div class="safe-stack">
        <div class="safe-grid-2">
          <div class="safe-box">
            <h4>Distritos más repetidos</h4>
            <ul class="safe-mini-list">
              ${data.topDistricts.map(([k,v]) => `<li>${esc(k)} — ${fmtNum(v)}</li>`).join('')}
            </ul>
          </div>
          <div class="safe-box">
            <h4>Cargos / áreas más repetidos</h4>
            <ul class="safe-mini-list">
              ${data.topCargos.map(([k,v]) => `<li>${esc(k)} — ${fmtNum(v)}</li>`).join('')}
            </ul>
          </div>
        </div>
        <div class="safe-box">
          <h4>Lectura rápida</h4>
          <p>Esto todavía es un mercado local simple armado desde tus importaciones guardadas. Después lo conectamos a histórico real sin tocar la base estable.</p>
          <div class="safe-note">Filas locales: ${fmtNum(data.rows.length)} · Compatibles: ${fmtNum(data.compatibles.length)}</div>
        </div>
        <div class="safe-actions">
          <button id="safe-mercado-radar" class="btn btn-secondary" type="button">Ir al radar provincial</button>
          <button id="safe-mercado-refresh" class="btn btn-outline" type="button">Refrescar mercado local</button>
        </div>
      </div>
    `;
    document.getElementById('safe-mercado-radar')?.addEventListener('click', () => scrollToId('panel-radar-provincia'));
    document.getElementById('safe-mercado-refresh')?.addEventListener('click', renderMercadoCard);
  }

  function renderAll() {
    const root = panelContent();
    const panel = panelSection();
    if (!root || !panel || panel.classList.contains('hidden')) return;
    ensureStyles();
    ensureQuickNav(root);
    renderQuickNav();
    renderProfileCard();
    renderListadosCard();
    renderMercadoCard();
  }

  window.addEventListener('message', event => {
    if (!event?.data || event.data.type !== ABC_IMPORT_TYPE) return;
    if (!String(event.origin || '').includes('abc.gob.ar')) return;
    if (event.data.status === 'progress') {
      renderProfileMsg(event.data.message || 'Leyendo resultados en ABC...', 'info');
      return;
    }
    if (event.data.status === 'error') {
      renderProfileMsg(event.data.message || 'No se pudo importar desde ABC.', 'error');
      return;
    }
    if (event.data.status === 'ok') {
      saveListados({ dni: event.data.payload?.dni || '', rows: event.data.payload?.rows || [] });
      renderProfileMsg(`Importación lista: ${fmtNum((event.data.payload?.rows || []).length)} fila(s) guardadas localmente.`, 'ok');
      renderAll();
    }
  });

  function boot() {
    let tries = 0;
    const tick = () => {
      tries += 1;
      renderAll();
      if (tries < 12 && (!document.getElementById('panel-safe-quicknav') || !document.getElementById('panel-perfil-docente') || !document.getElementById('panel-listados-docente') || !document.getElementById('panel-historico-docente'))) {
        setTimeout(tick, 800);
      }
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
