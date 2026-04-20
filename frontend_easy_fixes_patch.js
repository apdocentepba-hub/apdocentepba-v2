(function(){
  'use strict';
  if(window.__apdListboxPatchLoaded) return;
  window.__apdListboxPatchLoaded = true;

  const DIST_INPUT_IDS = ['pref-distrito-principal','pref-segundo-distrito','pref-tercer-distrito','pref-cuarto-distrito','pref-quinto-distrito'];
  const DIST_LIST_IDS = ['sug-distrito-1','sug-distrito-2','sug-distrito-3','sug-distrito-4','sug-distrito-5'];
  const CARGO_INPUT_IDS = ['pref-cargo-1','pref-cargo-2','pref-cargo-3','pref-cargo-4','pref-cargo-5','pref-cargo-6','pref-cargo-7','pref-cargo-8','pref-cargo-9','pref-cargo-10'];
  const CARGO_LIST_IDS = ['sug-cargo-1','sug-cargo-2','sug-cargo-3','sug-cargo-4','sug-cargo-5','sug-cargo-6','sug-cargo-7','sug-cargo-8','sug-cargo-9','sug-cargo-10'];
  const MAX_ITEMS = 250;
  const cache = { distritos:null, cargos:null };

  function esc(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(v){ return String(v||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim(); }

  function addStyle(){
    if(document.getElementById('apd-listbox-style')) return;
    const style = document.createElement('style');
    style.id = 'apd-listbox-style';
    style.textContent = `
      #btn-recargar-panel{display:none!important;}
      .ac-list[data-open="1"]{display:block!important;max-height:320px!important;overflow-y:auto!important;}
      #form-mi-password .grid-2{grid-template-columns:1fr!important;gap:12px!important;}
      #form-mi-password .grid-2>.field{margin-bottom:0!important;width:100%!important;}
    `;
    document.head.appendChild(style);
  }

  async function getJson(url){
    const r = await fetch(url,{headers:{apikey:window.APD_SUPABASE_KEY,Authorization:`Bearer ${window.APD_SUPABASE_KEY}`}});
    if(!r.ok) throw new Error('fetch failed');
    return r.json();
  }

  async function loadDistritos(){
    if(cache.distritos) return cache.distritos;
    const rows = await getJson(`${window.APD_SUPABASE_URL}/rest/v1/catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc`);
    const seen = new Set();
    cache.distritos = [];
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      [row?.nombre,row?.apd_nombre].forEach(raw=>{
        const v = String(raw||'').trim().toUpperCase();
        if(!v||seen.has(v)) return;
        seen.add(v);
        cache.distritos.push(v);
      });
    });
    return cache.distritos;
  }

  async function loadCargos(){
    if(cache.cargos) return cache.cargos;
    const rows = await getJson(`${window.APD_SUPABASE_URL}/rest/v1/catalogo_cargos_areas?select=codigo,nombre,apd_nombre&order=nombre.asc&limit=1500`);
    const seen = new Set();
    cache.cargos = [];
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      const codigo = String(row?.codigo||'').trim().toUpperCase();
      const nombre = String(row?.nombre||row?.apd_nombre||'').trim().toUpperCase();
      if(!nombre) return;
      const v = codigo ? `(${codigo}) ${nombre}` : nombre;
      if(seen.has(v)) return;
      seen.add(v);
      cache.cargos.push(v);
    });
    return cache.cargos;
  }

  function filterItems(items, query){
    const q = norm(query);
    if(!q) return items.slice(0, MAX_ITEMS);
    const starts=[]; const contains=[];
    items.forEach(item=>{
      const n = norm(item);
      if(!n) return;
      if(n.startsWith(q)) starts.push(item); else if(n.includes(q)) contains.push(item);
    });
    return starts.concat(contains).slice(0, MAX_ITEMS);
  }

  function renderList(input, list, items){
    list.innerHTML = ['<div class="ac-item" data-value="">NINGUNA</div>']
      .concat(items.map(item=>`<div class="ac-item" data-value="${esc(item)}">${esc(item)}</div>`)).join('');
    list.dataset.open = '1';
    list.querySelectorAll('.ac-item').forEach(el=>{
      el.addEventListener('mousedown', ev=>{
        ev.preventDefault();
        input.value = el.dataset.value || '';
        list.dataset.open = '0';
      });
    });
  }

  function enhance(inputId, listId, type){
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if(!input || !list || input.dataset.apdListboxBound==='1') return;
    input.dataset.apdListboxBound='1';
    list.dataset.open='0';

    const open = async ()=>{
      const source = type==='district' ? await loadDistritos() : await loadCargos();
      renderList(input, list, filterItems(source, input.value));
    };

    input.addEventListener('focus', ()=>open().catch(console.error));
    input.addEventListener('click', ()=>open().catch(console.error));
    input.addEventListener('input', ()=>open().catch(console.error));
    input.addEventListener('blur', ()=>setTimeout(()=>{list.dataset.open='0';},180));
  }

  function boot(){
    addStyle();
    DIST_INPUT_IDS.forEach((id,i)=>enhance(id,DIST_LIST_IDS[i],'district'));
    CARGO_INPUT_IDS.forEach((id,i)=>enhance(id,CARGO_LIST_IDS[i],'cargo'));
    const rec = document.getElementById('btn-recargar-panel'); if(rec) rec.remove();
  }

  const obs = new MutationObserver(()=>boot());
  obs.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();