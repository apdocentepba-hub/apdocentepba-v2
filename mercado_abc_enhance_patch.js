(function () {
  'use strict';

  if (window.__apdMercadoAbcEnhanceLoaded) return;
  window.__apdMercadoAbcEnhanceLoaded = true;

  const WORKER_BASE = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
  const HIST_URL_KEY = 'apd_hist_webapp_url';
  const ABC_POPUP_NAME = 'apd_abc_import';
  const ABC_POPUP_FEATURES = 'popup=yes,width=1180,height=820,left=80,top=60,resizable=yes,scrollbars=yes';
  const BANNER_HOST_ID = 'mercado-banner-rotator';
  const BANNER_ROTATION_MS = 8000;

  let bannerTimer = null;
  let bannerCache = null;
  let bannerCacheAt = 0;

  function escHtml(v) {
    return String(v || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function getMsgEl() {
    return document.getElementById('perfil-docente-msg');
  }

  function setMsg(text, type) {
    const el = getMsgEl();
    if (!el) return;
    el.textContent = String(text || '');
    el.className = `msg msg-${type || 'info'}`;
  }

  function getToken() {
    return localStorage.getItem('apd_token_v2') || '';
  }

  async function saveDniFromPatch(dni, consentimiento) {
    const token = getToken();
    if (!token) throw new Error('Sesión no válida.');
    const res = await fetch(`${WORKER_BASE}/api/profile/save-dni`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        dni: String(dni || '').replace(/\D/g, ''),
        consentimiento_datos: !!consentimiento
      })
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.message || data?.error || 'No se pudo guardar el DNI.');
    }
    return data;
  }

  function buildPopupUrl(dni) {
    const clean = String(dni || '').replace(/\D/g, '');
    const u = new URL('https://abc.gob.ar/listado-oficial');
    if (clean) u.hash = `apd_dni=${encodeURIComponent(clean)}`;
    return u.toString();
  }

  function buildBookmarkletHref() {
    const source = `(async()=>{const TYPE='APD_ABC_LISTADOS';const TARGET='*';const sleep=ms=>new Promise(r=>setTimeout(r,ms));const norm=s=>String(s||'').replace(/\\u00a0/g,' ').replace(/\\s+/g,' ').trim();const post=(status,payload,message)=>{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:TYPE,status,payload,message,source:'abc-bookmarklet'},TARGET);}};const visible=el=>!!el&&el.offsetParent!==null;const allVisible=sel=>[...document.querySelectorAll(sel)].filter(visible);const textOf=el=>norm(el&&(el.innerText||el.textContent||''));function pageRangeText(){const hit=allVisible('body *').find(el=>/Mostrando\\s+\\d+\\s+a\\s+\\d+\\s+de\\s+\\d+\\s+resultados/i.test(textOf(el)));return hit?textOf(hit):'';}function cardCount(){return findCardCandidates().length;}function searchButton(){const buttons=allVisible('button,a,div,span');return buttons.find(el=>/^buscar$/i.test(textOf(el)))||null;}function fieldScore(el){const meta=[el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ');if(/dni/i.test(meta))return 20;if(/apellido|nombre|buscar/i.test(meta))return 10;return 0;}function searchInput(){const btn=searchButton();if(btn){let root=btn.parentElement;for(let depth=0;depth<6&&root;depth++,root=root.parentElement){const inputs=[...root.querySelectorAll('input')].filter(visible);if(inputs.length){inputs.sort((a,b)=>fieldScore(b)-fieldScore(a));return inputs[0];}}}const inputs=allVisible('input');inputs.sort((a,b)=>fieldScore(b)-fieldScore(a));return inputs[0]||null;}function fireInput(el,value){try{el.focus();el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter',code:'Enter'}));}catch(e){}}function launchSearch(dni){const input=searchInput();const btn=searchButton();if(input){fireInput(input,dni);}if(btn){btn.click();return true;}if(input){fireInput(input,dni);return true;}return false;}function findCardCandidates(){const els=allVisible('div,article,section,li');const hits=els.filter(el=>{const t=textOf(el);if(!t)return false;if(!/\\b\\d{7,9}\\b/.test(t))return false;if(!/Puntaje:/i.test(t))return false;if(!/Distrito:/i.test(t))return false;if(!/Cargo\\s*Area:/i.test(t))return false;if(t.length<80||t.length>1400)return false;return true;});return hits.filter(el=>!hits.some(other=>other!==el&&el.contains(other)));}function parseCardText(t){const text=String(t||'').replace(/\\u00a0/g,' ');const dni=/\\b(\\d{7,9})\\b/.exec(text)?.[1]||'';const puntaje=/Puntaje:\\s*([0-9.,]+)/i.exec(text)?.[1]||'';const orden=/Orden:\\s*([0-9]+)/i.exec(text)?.[1]||'';const cargo=(/Cargo\\s*Area:\\s*([\\s\\S]*?)(?=\\bApto\\s*F[ií]sico:|\\bDistrito:|\\bRama:|\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const distrito=(/Distrito:\\s*([\\s\\S]*?)(?=\\bRama:|\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();const rama=(/Rama:\\s*([\\s\\S]*?)(?=\\bRecalificaci[oó]n laboral:|\\bFecha:|$)/i.exec(text)?.[1]||'').replace(/\\s+/g,' ').trim();return{dni:norm(dni),puntaje:norm(puntaje),orden:norm(orden),cargo:norm(cargo),distrito:norm(distrito),rama:norm(rama)};}function scrapeCurrentPage(){const items=[];for(const card of findCardCandidates()){const item=parseCardText(card.innerText);const key=[item.dni,item.cargo,item.puntaje,item.distrito,item.rama,item.orden].join('|');if(item.dni&&item.cargo)items.push({...item,key});}return items;}function nextButton(){const candidates=allVisible('button,a,span,div').filter(el=>textOf(el)==='>');return candidates[candidates.length-1]||null;}async function waitForResults(dni){for(let step=0;step<40;step++){if(pageRangeText()||cardCount())return true;if(step===0||step===5||step===12){launchSearch(dni);}await sleep(500);}return pageRangeText()||cardCount();}async function scrapeRows(){const collected=new Map();for(let turn=0;turn<120;turn++){await sleep(900);const rangeBefore=pageRangeText();const items=scrapeCurrentPage();for(const item of items)collected.set(item.key,item);const next=nextButton();if(!next)break;next.click();let changed=false;for(let i=0;i<16;i++){await sleep(450);const rangeAfter=pageRangeText();if((rangeAfter&&rangeAfter!==rangeBefore)||cardCount()){changed=true;break;}}if(!changed)break;}return[...collected.values()].map(item=>({anio:new Date().getFullYear(),tipo_listado:'OFICIAL',distrito:item.distrito,cargo:item.cargo,materia:item.rama,puntaje:item.puntaje,fuente:'abc_favorito',raw_text:JSON.stringify({source:'abc_favorito',dni:item.dni,orden:item.orden,distrito:item.distrito,rama:item.rama,cargo_area:item.cargo,puntaje:item.puntaje})}));}try{const url=new URL(location.href);const hashParams=new URLSearchParams(String(location.hash||'').replace(/^#/,''));const dni=String(hashParams.get('apd_dni')||url.searchParams.get('apd_dni')||prompt('DNI para importar desde ABC:')||'').replace(/\\D/g,'');if(!dni)throw new Error('Necesitás indicar el DNI.');post('progress',null,'Preparando búsqueda en ABC...');launchSearch(dni);const ok=await waitForResults(dni);if(!ok)throw new Error('Todavía no aparecieron resultados en ABC. Esperá unos segundos y tocá de nuevo el favorito.');post('progress',null,'Leyendo resultados visibles en ABC...');const rows=await scrapeRows();if(!rows.length)throw new Error('No pude leer resultados visibles en ABC.');post('ok',{dni,rows,facets:null,mode:'scrape-dom'},'Listados capturados desde ABC');setTimeout(()=>{try{window.close();}catch(e){}},400);}catch(err){post('error',null,String(err?.message||err));alert(String(err?.message||err));}})();`;
    return `javascript:${encodeURIComponent(source)}`;
  }

  function installBookmarklet() {
    const btn = document.getElementById('btn-bookmarklet-abc');
    if (!btn) return;
    const href = buildBookmarkletHref();
    if (btn.getAttribute('href') !== href) {
      btn.setAttribute('href', href);
      btn.setAttribute('title', 'Arrastralo a tu barra de favoritos');
    }
  }

  async function interceptOpenAbcClick(ev) {
    const btn = ev.target?.closest?.('#btn-open-abc');
    if (!btn) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();

    const dni = String(document.getElementById('perfil-dni')?.value || '').replace(/\D/g, '');
    const consentimiento = !!document.getElementById('perfil-consentimiento')?.checked;

    if (!dni) {
      setMsg('Primero cargá tu DNI.', 'error');
      return;
    }
    if (!consentimiento) {
      setMsg('Para importar desde ABC tenés que aceptar el consentimiento.', 'error');
      return;
    }

    setMsg('Guardando DNI y abriendo ABC...', 'info');

    try {
      await saveDniFromPatch(dni, consentimiento);
      const popup = window.open(buildPopupUrl(dni), ABC_POPUP_NAME, ABC_POPUP_FEATURES);
      if (popup) popup.focus();
      installBookmarklet();
      setMsg('ABC abierto. El favorito nuevo ya toma tu DNI desde la ventana y busca más directo.', 'ok');
    } catch (err) {
      setMsg(err?.message || 'No se pudo preparar la importación desde ABC.', 'error');
    }
  }

  async function fetchBannerData() {
    const now = Date.now();
    if (bannerCache && now - bannerCacheAt < 120000) return bannerCache;

    const base = String(localStorage.getItem(HIST_URL_KEY) || '').trim();
    if (!base) return null;

    const url = new URL(base);
    url.searchParams.set('action', 'overview');
    url.searchParams.set('days', '30');

    const res = await fetch(url.toString());
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok || !data?.ok) return null;

    bannerCache = data;
    bannerCacheAt = now;
    return data;
  }

  function stopBannerRotation() {
    if (bannerTimer) clearInterval(bannerTimer);
    bannerTimer = null;
  }

  function renderBannerItems(items) {
    const host = document.getElementById(BANNER_HOST_ID);
    if (!host) return;

    const safe = Array.isArray(items) && items.length
      ? items
      : [{ title: 'Mercado APD', text: 'Todavía no hay suficientes insights históricos para mostrar.' }];

    let index = 0;

    function paint() {
      const item = safe[index % safe.length];
      host.innerHTML = `
        <div style="padding:12px 14px;border:1px solid rgba(15,52,96,.12);border-radius:14px;background:#fff;margin-bottom:14px;box-shadow:0 6px 20px rgba(15,52,96,.06);">
          <div style="font-size:12px;font-weight:700;color:#0f3460;letter-spacing:.02em;text-transform:uppercase;margin-bottom:6px;">${escHtml(item.title || 'Mercado APD')}</div>
          <div style="font-size:14px;line-height:1.45;color:#1f2937;">${escHtml(item.text || '')}</div>
        </div>`;
      index += 1;
    }

    stopBannerRotation();
    paint();
    if (safe.length > 1) {
      bannerTimer = setInterval(paint, BANNER_ROTATION_MS);
    }
  }

  async function ensureMercadoBanner() {
    const body = document.getElementById('historico-docente-body');
    if (!body) return;
    if (body.querySelector('#hist-webapp-url')) return;

    let host = document.getElementById(BANNER_HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = BANNER_HOST_ID;
      body.prepend(host);
    }

    const data = await fetchBannerData().catch(() => null);
    renderBannerItems(data?.banner_items || []);
  }

  function bootEnhancements() {
    installBookmarklet();
    ensureMercadoBanner().catch(() => null);
  }

  document.addEventListener('click', interceptOpenAbcClick, true);

  const observer = new MutationObserver(() => {
    bootEnhancements();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bootEnhancements();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    bootEnhancements();
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
