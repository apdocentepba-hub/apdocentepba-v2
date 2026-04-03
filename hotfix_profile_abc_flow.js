(function () {
  'use strict';

  if (window.__apdProfileAbcUiHotfixLoaded) return;
  window.__apdProfileAbcUiHotfixLoaded = true;

  const WORKER_BASE = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
  const ABC_IMPORT_TYPE = 'APD_ABC_LISTADOS';
  const ABC_POPUP_NAME = 'apd_abc_import';
  const ABC_POPUP_FEATURES = 'popup=yes,width=1180,height=820,left=80,top=60,resizable=yes,scrollbars=yes';
  const PROFILE_MSG_ID = 'perfil-docente-msg';
  const PROFILE_BODY_ID = 'perfil-docente-body';
  const LISTADOS_BODY_ID = 'listados-docente-body';

  function esc(v) {
    return String(v || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function profileBody() {
    return document.getElementById(PROFILE_BODY_ID);
  }

  function listadosBody() {
    return document.getElementById(LISTADOS_BODY_ID);
  }

  function profileMsgEl() {
    return document.getElementById(PROFILE_MSG_ID);
  }

  function setProfileMsg(text, type = 'info') {
    const el = profileMsgEl();
    if (!el) return;
    el.textContent = String(text || '');
    el.className = `msg msg-${type}`;
  }

  function currentSavedDni() {
    return String(document.getElementById('perfil-dni')?.value || '').replace(/\D/g, '');
  }

  function currentConsent() {
    return !!document.getElementById('perfil-consentimiento')?.checked;
  }

  function token() {
    return localStorage.getItem('apd_token_v2') || '';
  }

  function buildAbcPopupUrl() {
    const dni = currentSavedDni();
    const u = new URL('https://abc.gob.ar/listado-oficial');
    if (dni) u.searchParams.set('apd_dni', dni);
    return u.toString();
  }

  function openAbcPopupNow() {
    const ref = window.open(buildAbcPopupUrl(), ABC_POPUP_NAME, ABC_POPUP_FEATURES);
    if (ref) ref.focus();
    return ref;
  }

  async function saveDniInBackground() {
    const dni = currentSavedDni();
    const consentimiento = currentConsent();
    if (!dni || !consentimiento) return false;

    const authToken = token();
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    const res = await fetch(`${WORKER_BASE}/api/profile/save-dni`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dni, consentimiento_datos: consentimiento })
    });

    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text || `HTTP ${res.status}` }; }
    if (!res.ok || data?.ok === false) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    return true;
  }

  function buildAbcBookmarkletHref() {
    const source = `(async()=>{const TYPE='${ABC_IMPORT_TYPE}';const TARGET='*';const sleep=ms=>new Promise(r=>setTimeout(r,ms));const norm=s=>String(s||'').replace(/\\u00a0/g,' ').replace(/\\s+/g,' ').trim();const post=(status,payload,message)=>{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:TYPE,status,payload,message,source:'abc-bookmarklet'},TARGET);}};const visible=el=>!!el&&el.offsetParent!==null;const allVisible=sel=>[...document.querySelectorAll(sel)].filter(visible);const textOf=el=>norm(el&&(el.innerText||el.textContent||''));function pageRangeText(){const hit=allVisible('body *').find(el=>/Mostrando\\s+\\d+\\s+a\\s+\\d+\\s+de\\s+\\d+\\s+resultados/i.test(textOf(el)));return hit?textOf(hit):'';}function cardCount(){return findCardCandidates().length;}function searchButton(){const buttons=allVisible('button,a,div,span');return buttons.find(el=>/^buscar$/i.test(textOf(el)))||null;}function fieldScore(el){const meta=[el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ');if(/dni|apellido|nombre|buscar/i.test(meta))return 10;return 0;}function searchInput(){const btn=searchButton();if(btn){let root=btn.parentElement;for(let depth=0;depth<5&&root;depth++,root=root.parentElement){const inputs=[...root.querySelectorAll('input')].filter(visible);if(inputs.length){inputs.sort((a,b)=>fieldScore(b)-fieldScore(a));return inputs[0];}}}const inputs=allVisible('input');inputs.sort((a,b)=>fieldScore(b)-fieldScore(a));return inputs[0]||null;}function fireInput(el,value){try{el.focus();el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter',code:'Enter'}));}catch(e){}}function launchSearch(dni){const input=searchInput();const btn=searchButton();if(input){fireInput(input,dni);}if(btn){btn.click();return true;}if(input){fireInput(input,dni);return true;}return false;}function findCardCandidates(){const els=allVisible('div,article,section,li');const hits=els.filter(el=>{const t=textOf(el);if(!t)return false;if(!/\\b\\d{7,9}\\b/.test(t))return false;if(!/Puntaje:/i.test(t))return false;if(!/Distrito:/i.test(t))return false;if(!/Cargo\\s*Area:/i.test(t))return false;if(t.length<80||t.length>1400)return false;return true;});return hits.filter(el=>!hits.some(other=>other!==el&&el.contains(other)));}function parseCardText(t){const text=String(t||'').replace(/\\u00a0/g,' ');const dni=/\\b(\\d{7,9})\\b/.exec(text)?.[1]||'';const puntaje=/Puntaje:\\s*([0-9.,]+)/i.exec(text)?.[1]||'';const orden=/Orden:\\s*([0-9]+)/i.exec(text)?.[1]||'';const cargo=(/Cargo\\s*Area:\\s*([\\s\\S]*?)(?=\\bApto\\s*F[ií]sico:|\\bDistrito:|\\bRama:|\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const distrito=(/Distrito:\\s*([\\s\\S]*?)(?=\\bRama:|\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const rama=(/Rama:\\s*([\\s\\S]*?)(?=\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();return{dni:norm(dni),puntaje:norm(puntaje),orden:norm(orden),cargo:norm(cargo),distrito:norm(distrito),rama:norm(rama)};}function scrapeCurrentPage(){const items=[];for(const card of findCardCandidates()){const item=parseCardText(card.innerText);const key=[item.dni,item.cargo,item.puntaje,item.distrito,item.rama,item.orden].join('|');if(item.dni&&item.cargo)items.push({...item,key});}return items;}function nextButton(){const candidates=allVisible('button,a,span,div').filter(el=>textOf(el)==='>');return candidates[candidates.length-1]||null;}async function waitForResults(dni){for(let step=0;step<40;step++){if(pageRangeText()||cardCount())return true;if(step===0||step===6||step===14){launchSearch(dni);}await sleep(500);}return pageRangeText()||cardCount();}async function scrapeRows(){const collected=new Map();for(let turn=0;turn<120;turn++){await sleep(900);const rangeBefore=pageRangeText();const items=scrapeCurrentPage();for(const item of items)collected.set(item.key,item);const next=nextButton();if(!next)break;next.click();let changed=false;for(let i=0;i<16;i++){await sleep(450);const rangeAfter=pageRangeText();if((rangeAfter&&rangeAfter!==rangeBefore)||cardCount()){changed=true;break;}}if(!changed)break;}return[...collected.values()].map(item=>({anio:new Date().getFullYear(),tipo_listado:'OFICIAL',distrito:item.distrito,cargo:item.cargo,materia:item.rama,puntaje:item.puntaje,fuente:'abc_favorito',raw_text:JSON.stringify({source:'abc_favorito',dni:item.dni,orden:item.orden,distrito:item.distrito,rama:item.rama,cargo_area:item.cargo,puntaje:item.puntaje})}));}try{const url=new URL(location.href);const dni=String(url.searchParams.get('apd_dni')||prompt('Ingresá DNI para traer la información')||'').replace(/\\D/g,'');if(!dni)throw new Error('Necesitás indicar el DNI.');post('progress',null,'Preparando búsqueda en ABC...');launchSearch(dni);const ok=await waitForResults(dni);if(!ok)throw new Error('Todavía no aparecieron resultados en ABC. Esperá unos segundos y tocá de nuevo el favorito.');post('progress',null,'Leyendo resultados visibles en ABC...');const rows=await scrapeRows();if(!rows.length)throw new Error('No pude leer resultados visibles en ABC.');post('ok',{dni,rows,facets:null,mode:'scrape-dom'},'Listados capturados desde ABC');setTimeout(()=>{try{window.close();}catch(e){}},400);}catch(err){post('error',null,String(err?.message||err));alert(String(err?.message||err));}})();`;
    return `javascript:${encodeURIComponent(source)}`;
  }

  function renderFallbackProfileUi() {
    const box = profileBody();
    if (!box) return;
    if (document.getElementById('perfil-dni')) return;
    box.innerHTML = `
      <div class="field">
        <label for="perfil-dni">DNI</label>
        <input id="perfil-dni" type="text" placeholder="Solo números" value="" />
      </div>
      <label class="chk-card chk-notif" style="margin-top:10px;">
        <input id="perfil-consentimiento" type="checkbox" />
        <div>
          <span class="chk-lbl">Autorizo usar mis datos de listados</span>
          <span class="chk-sub">Solo para mejorar alertas, compatibilidad e histórico personal.</span>
        </div>
      </label>
      <div class="form-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button id="btn-save-dni" class="btn btn-secondary" type="button">Guardar DNI y abrir ABC</button>
        <button id="btn-open-abc" class="btn btn-outline" type="button">Abrir ABC otra vez</button>
        <a id="btn-bookmarklet-abc" class="btn btn-outline" href="${buildAbcBookmarkletHref()}" draggable="true" title="Arrastralo a tu barra de favoritos">Guardar favorito “Traer a APDocentePBA”</a>
      </div>
      <span id="${PROFILE_MSG_ID}" class="msg"></span>
    `;
  }

  function renderFallbackListadosUi() {
    const box = listadosBody();
    if (!box) return;
    if (!/cargando/i.test(box.textContent || '')) return;
    box.innerHTML = `
      <div style="padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
        <div class="card-lbl" style="margin-bottom:6px;">📚 Mis listados</div>
        <div class="soft-meta">Cuando el favorito termine de leer ABC y vuelva a APDocentePBA, tus listados se actualizan acá.</div>
      </div>
    `;
  }

  function hideMainLoadingIfNeeded() {
    const loading = document.getElementById('panel-loading');
    if (loading) loading.classList.add('hidden');
  }

  function enhanceProfileUi() {
    const box = profileBody();
    if (!box) return;

    const saveBtn = document.getElementById('btn-save-dni');
    const openBtn = document.getElementById('btn-open-abc');
    const bookmarkletBtn = document.getElementById('btn-bookmarklet-abc');

    if (saveBtn) {
      saveBtn.textContent = 'Guardar DNI y abrir ABC';
      saveBtn.dataset.abcPrimary = '1';
      saveBtn.classList.remove('btn-primary');
      saveBtn.classList.add('btn-secondary');
    }

    if (openBtn) {
      openBtn.textContent = 'Abrir ABC otra vez';
      openBtn.title = 'Reabrí ABC si cerraste la pestaña o querés relanzar la lectura.';
    }

    if (bookmarkletBtn) {
      bookmarkletBtn.textContent = 'Guardar favorito “Traer a APDocentePBA”';
      bookmarkletBtn.title = 'Guardalo una sola vez. Después entrás a ABC, tocás el favorito y vuelve a APDocentePBA.';
      if (!bookmarkletBtn.getAttribute('href')) bookmarkletBtn.setAttribute('href', buildAbcBookmarkletHref());
    }

    if (!document.getElementById('apd-abc-sync-note')) {
      const target = bookmarkletBtn?.parentElement || openBtn?.parentElement || box;
      target?.insertAdjacentHTML('afterend', `
        <div id="apd-abc-sync-note" style="margin-top:12px;padding:10px 12px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;">
          <div class="card-lbl" style="margin-bottom:6px;">🔁 Flujo más corto desde ABC</div>
          <div class="soft-meta">
            1. Cargás tu DNI y tocás <strong>Guardar DNI y abrir ABC</strong>.<br>
            2. En ABC tocás el favorito <strong>Traer a APDocentePBA</strong>.<br>
            3. La ventana se cierra sola y APDocentePBA refresca tus listados.
          </div>
        </div>
      `);
    }
  }

  function validateBeforeOpen() {
    const dni = currentSavedDni();
    if (!dni) {
      setProfileMsg('Primero cargá tu DNI.', 'error');
      return false;
    }
    if (!currentConsent()) {
      setProfileMsg('Para importar desde ABC tenés que aceptar el consentimiento.', 'error');
      return false;
    }
    return true;
  }

  function launchAbcFlow(reason) {
    if (!validateBeforeOpen()) return;

    const popup = openAbcPopupNow();
    if (!popup) {
      setProfileMsg('El navegador bloqueó la ventana de ABC. Habilitá popups para este sitio.', 'error');
      return;
    }

    setProfileMsg('ABC abierto. Guardando DNI en segundo plano...', 'info');

    saveDniInBackground()
      .then(() => {
        setProfileMsg(
          reason === 'save'
            ? 'ABC abierto. Ahora tocá tu favorito “Traer a APDocentePBA”.'
            : 'ABC reabierto. Tocá tu favorito “Traer a APDocentePBA”.',
          'ok'
        );
      })
      .catch(err => {
        setProfileMsg(`ABC se abrió, pero no pude guardar el DNI automáticamente: ${err?.message || 'error'}`, 'error');
      });
  }

  document.addEventListener('click', function captureAbcButtons(ev) {
    const saveBtn = ev.target.closest('#btn-save-dni');
    if (saveBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      launchAbcFlow('save');
      return;
    }

    const openBtn = ev.target.closest('#btn-open-abc');
    if (openBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      launchAbcFlow('open');
    }
  }, true);

  window.addEventListener('message', function onAbcImportHotfix(event) {
    if (!event?.data || event.data.type !== ABC_IMPORT_TYPE) return;
    if (!String(event.origin || '').includes('abc.gob.ar')) return;

    if (event.data.status === 'progress') {
      setProfileMsg(event.data.message || 'Leyendo resultados en ABC...', 'info');
      return;
    }

    if (event.data.status === 'error') {
      setProfileMsg(event.data.message || 'No se pudo importar desde ABC.', 'error');
      return;
    }

    if (event.data.status === 'ok') {
      setProfileMsg('ABC devolvió datos. Actualizando tus listados y compatibilidad...', 'ok');
      if (typeof window.APD_activatePanelTab === 'function') window.APD_activatePanelTab('perfil');
      setTimeout(() => { document.getElementById('btn-recargar-panel')?.click(); }, 900);
    }
  });

  function installFallbackIfStillLoading() {
    const p = profileBody();
    const l = listadosBody();
    if (p && /cargando/i.test(p.textContent || '') && !document.getElementById('perfil-dni')) {
      renderFallbackProfileUi();
      enhanceProfileUi();
      hideMainLoadingIfNeeded();
    }
    if (l) renderFallbackListadosUi();
  }

  function boot() {
    enhanceProfileUi();
    setTimeout(installFallbackIfStillLoading, 2500);
    const box = profileBody();
    if (box && !box.dataset.abcUiObserved) {
      const obs = new MutationObserver(() => {
        enhanceProfileUi();
      });
      obs.observe(box, { childList: true, subtree: true });
      box.dataset.abcUiObserved = '1';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
