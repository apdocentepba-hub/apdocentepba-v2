(function () {
  'use strict';

  if (window.__apdRescuePanelPatchLoaded) return;
  window.__apdRescuePanelPatchLoaded = true;

  const PROFILE_BODY_ID = 'perfil-docente-body';
  const LISTADOS_BODY_ID = 'listados-docente-body';
  const HIST_BODY_ID = 'historico-docente-body';
  const ABC_IMPORT_TYPE = 'APD_ABC_LISTADOS';
  const ABC_POPUP_NAME = 'apd_abc_import';
  const ABC_POPUP_FEATURES = 'popup=yes,width=1180,height=820,left=80,top=60,resizable=yes,scrollbars=yes';

  function token() {
    return localStorage.getItem('apd_token_v2') || '';
  }

  function hideGlobalLoading() {
    document.getElementById('panel-loading')?.classList.add('hidden');
    const sub = document.getElementById('panel-subtitulo');
    if (sub && /cargando/i.test(sub.textContent || '')) {
      const raw = token();
      sub.textContent = raw ? `Sesión: ${raw}` : 'Panel listo';
    }
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function currentDni() {
    return String(byId('perfil-dni')?.value || '').replace(/\D/g, '');
  }

  function currentConsent() {
    return !!byId('perfil-consentimiento')?.checked;
  }

  function setProfileMsg(text, type) {
    let el = byId('perfil-docente-msg');
    if (!el && byId(PROFILE_BODY_ID)) {
      byId(PROFILE_BODY_ID).insertAdjacentHTML('beforeend', '<span id="perfil-docente-msg" class="msg"></span>');
      el = byId('perfil-docente-msg');
    }
    if (!el) return;
    el.textContent = String(text || '');
    el.className = `msg msg-${type || 'info'}`;
  }

  function buildAbcPopupUrl() {
    const dni = currentDni();
    const u = new URL('https://abc.gob.ar/listado-oficial');
    if (dni) u.searchParams.set('apd_dni', dni);
    return u.toString();
  }

  function openAbcNow() {
    const ref = window.open(buildAbcPopupUrl(), ABC_POPUP_NAME, ABC_POPUP_FEATURES);
    if (ref) ref.focus();
    return ref;
  }

  async function saveDniInBackground() {
    const dni = currentDni();
    const consentimiento = currentConsent();
    if (!dni || !consentimiento) return false;

    const headers = { 'Content-Type': 'application/json' };
    const t = token();
    if (t) headers.Authorization = `Bearer ${t}`;

    const res = await fetch('https://ancient-wildflower-cd37.apdocentepba.workers.dev/api/profile/save-dni', {
      method: 'POST',
      headers,
      body: JSON.stringify({ dni, consentimiento_datos: consentimiento })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  }

  function buildBookmarkletHref() {
    const js = `(async()=>{const TYPE='${ABC_IMPORT_TYPE}';const TARGET='*';const sleep=ms=>new Promise(r=>setTimeout(r,ms));const norm=s=>String(s||'').replace(/\\u00a0/g,' ').replace(/\\s+/g,' ').trim();const post=(status,payload,message)=>{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:TYPE,status,payload,message,source:'abc-bookmarklet'},TARGET);}};const visible=el=>!!el&&el.offsetParent!==null;const allVisible=sel=>[...document.querySelectorAll(sel)].filter(visible);const textOf=el=>norm(el&&(el.innerText||el.textContent||''));function pageRangeText(){const hit=allVisible('body *').find(el=>/Mostrando\\s+\\d+\\s+a\\s+\\d+\\s+de\\s+\\d+\\s+resultados/i.test(textOf(el)));return hit?textOf(hit):'';}function searchButton(){const buttons=allVisible('button,a,div,span');return buttons.find(el=>/^buscar$/i.test(textOf(el)))||null;}function fieldScore(el){const meta=[el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ');if(/dni|apellido|nombre|buscar/i.test(meta))return 10;return 0;}function searchInput(){const btn=searchButton();if(btn){let root=btn.parentElement;for(let depth=0;depth<5&&root;depth++,root=root.parentElement){const inputs=[...root.querySelectorAll('input')].filter(visible);if(inputs.length){inputs.sort((a,b)=>fieldScore(b)-fieldScore(a));return inputs[0];}}}const inputs=allVisible('input');inputs.sort((a,b)=>fieldScore(b)-fieldScore(a));return inputs[0]||null;}function fireInput(el,value){try{el.focus();el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter',code:'Enter'}));}catch(e){}}function launchSearch(dni){const input=searchInput();const btn=searchButton();if(input)fireInput(input,dni);if(btn){btn.click();return true;}if(input){fireInput(input,dni);return true;}return false;}function findCardCandidates(){const els=allVisible('div,article,section,li');const hits=els.filter(el=>{const t=textOf(el);if(!t)return false;if(!/\\b\\d{7,9}\\b/.test(t))return false;if(!/Puntaje:/i.test(t))return false;if(!/Distrito:/i.test(t))return false;if(!/Cargo\\s*Area:/i.test(t))return false;if(t.length<80||t.length>1400)return false;return true;});return hits.filter(el=>!hits.some(other=>other!==el&&el.contains(other)));}function parseCardText(t){const text=String(t||'').replace(/\\u00a0/g,' ');const dni=/\\b(\\d{7,9})\\b/.exec(text)?.[1]||'';const puntaje=/Puntaje:\\s*([0-9.,]+)/i.exec(text)?.[1]||'';const orden=/Orden:\\s*([0-9]+)/i.exec(text)?.[1]||'';const cargo=(/Cargo\\s*Area:\\s*([\\s\\S]*?)(?=\\bApto\\s*F[ií]sico:|\\bDistrito:|\\bRama:|\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const distrito=(/Distrito:\\s*([\\s\\S]*?)(?=\\bRama:|\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const rama=(/Rama:\\s*([\\s\\S]*?)(?=\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();return{dni:norm(dni),puntaje:norm(puntaje),orden:norm(orden),cargo:norm(cargo),distrito:norm(distrito),rama:norm(rama)};}async function scrapeRows(){const collected=new Map();for(let turn=0;turn<120;turn++){await sleep(900);for(const card of findCardCandidates()){const item=parseCardText(card.innerText);const key=[item.dni,item.cargo,item.puntaje,item.distrito,item.rama,item.orden].join('|');if(item.dni&&item.cargo)collected.set(key,item);}const next=[...allVisible('button,a,span,div')].filter(el=>textOf(el)==='>').pop();if(!next)break;const before=pageRangeText();next.click();let changed=false;for(let i=0;i<16;i++){await sleep(450);const after=pageRangeText();if((after&&after!==before)||findCardCandidates().length){changed=true;break;}}if(!changed)break;}return[...collected.values()].map(item=>({anio:new Date().getFullYear(),tipo_listado:'OFICIAL',distrito:item.distrito,cargo:item.cargo,materia:item.rama,puntaje:item.puntaje,fuente:'abc_favorito',raw_text:JSON.stringify({source:'abc_favorito',dni:item.dni,orden:item.orden,distrito:item.distrito,rama:item.rama,cargo_area:item.cargo,puntaje:item.puntaje})}));}try{const url=new URL(location.href);const dni=String(url.searchParams.get('apd_dni')||prompt('Ingresá DNI para traer la información')||'').replace(/\\D/g,'');if(!dni)throw new Error('Necesitás indicar el DNI.');post('progress',null,'Preparando búsqueda en ABC...');launchSearch(dni);for(let i=0;i<40;i++){if(pageRangeText()||findCardCandidates().length)break;if(i===6||i===14)launchSearch(dni);await sleep(500);}if(!pageRangeText()&&!findCardCandidates().length)throw new Error('Todavía no aparecieron resultados en ABC.');post('progress',null,'Leyendo resultados visibles en ABC...');const rows=await scrapeRows();if(!rows.length)throw new Error('No pude leer resultados visibles en ABC.');post('ok',{dni,rows,facets:null,mode:'scrape-dom'},'Listados capturados desde ABC');setTimeout(()=>{try{window.close();}catch(e){}},400);}catch(err){post('error',null,String(err?.message||err));alert(String(err?.message||err));}})();`;
    return `javascript:${encodeURIComponent(js)}`;
  }

  function ensureProfileFallback() {
    const box = byId(PROFILE_BODY_ID);
    if (!box) return;
    const t = (box.textContent || '').trim();
    if (!/cargando/i.test(t) && byId('perfil-dni')) return;
    box.innerHTML = `
      <div class="field">
        <label for="perfil-dni">DNI</label>
        <input id="perfil-dni" type="text" placeholder="Solo números" />
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
        <a id="btn-bookmarklet-abc" class="btn btn-outline" href="${buildBookmarkletHref()}" draggable="true">Guardar favorito “Traer a APDocentePBA”</a>
      </div>
      <span id="perfil-docente-msg" class="msg"></span>
    `;
  }

  function ensureListadosFallback() {
    const box = byId(LISTADOS_BODY_ID);
    if (!box) return;
    if (!/cargando/i.test(box.textContent || '')) return;
    box.innerHTML = '<div style="padding:10px;border:1px solid rgba(15,52,96,.12);border-radius:12px;background:#fff;"><div class="card-lbl" style="margin-bottom:6px;">📚 Mis listados</div><div class="soft-meta">Cuando termine la lectura desde ABC, esta sección se actualiza al recargar el panel.</div></div>';
  }

  function ensureHistoricoFallback() {
    const box = byId(HIST_BODY_ID);
    if (!box) return;
    if (!/preparando|cargando/i.test(box.textContent || '')) return;
    box.innerHTML = '<p class="ph">Mercado listo para refrescar.</p>';
  }

  function validate() {
    if (!currentDni()) {
      setProfileMsg('Primero cargá tu DNI.', 'error');
      return false;
    }
    if (!currentConsent()) {
      setProfileMsg('Para importar desde ABC tenés que aceptar el consentimiento.', 'error');
      return false;
    }
    return true;
  }

  function launch(reason) {
    if (!validate()) return;
    const popup = openAbcNow();
    if (!popup) {
      setProfileMsg('El navegador bloqueó la ventana de ABC. Habilitá popups para este sitio.', 'error');
      return;
    }
    setProfileMsg('ABC abierto. Guardando DNI en segundo plano...', 'info');
    saveDniInBackground().then(() => {
      setProfileMsg(reason === 'save' ? 'ABC abierto. Ahora tocá tu favorito “Traer a APDocentePBA”.' : 'ABC reabierto. Tocá tu favorito “Traer a APDocentePBA”.', 'ok');
    }).catch(err => {
      setProfileMsg(`ABC se abrió, pero no pude guardar el DNI automáticamente: ${err?.message || 'error'}`, 'error');
    });
  }

  document.addEventListener('click', ev => {
    const save = ev.target.closest('#btn-save-dni');
    if (save) {
      ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      launch('save');
      return;
    }
    const open = ev.target.closest('#btn-open-abc');
    if (open) {
      ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      launch('open');
    }
  }, true);

  window.addEventListener('message', event => {
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
      setProfileMsg('ABC devolvió datos. Actualizando panel...', 'ok');
      setTimeout(() => byId('btn-recargar-panel')?.click(), 900);
    }
  });

  function rescue() {
    hideGlobalLoading();
    ensureProfileFallback();
    ensureListadosFallback();
    ensureHistoricoFallback();
  }

  function boot() {
    rescue();
    setTimeout(rescue, 1200);
    setTimeout(rescue, 2500);
    setTimeout(rescue, 5000);
    const panel = byId('panel-content');
    if (panel && !panel.dataset.rescueObserved) {
      const obs = new MutationObserver(() => rescue());
      obs.observe(panel, { childList: true, subtree: true });
      panel.dataset.rescueObserved = '1';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
