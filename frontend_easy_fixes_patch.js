(function(){
  'use strict';

  if (window.__apdNativeSelectsLoaded) return;
  window.__apdNativeSelectsLoaded = true;

  const DIST_IDS = [
    'pref-distrito-principal','pref-segundo-distrito','pref-tercer-distrito'
  ];

  const CARGO_IDS = [
    'pref-cargo-1','pref-cargo-2','pref-cargo-3','pref-cargo-4','pref-cargo-5',
    'pref-cargo-6','pref-cargo-7','pref-cargo-8','pref-cargo-9','pref-cargo-10'
  ];

  async function getData(url){
    const r = await fetch(url, {
      headers:{
        apikey: window.APD_SUPABASE_KEY,
        Authorization: `Bearer ${window.APD_SUPABASE_KEY}`
      }
    });
    return r.json();
  }

  async function loadDistritos(){
    const data = await getData(`${window.APD_SUPABASE_URL}/rest/v1/catalogo_distritos?select=nombre&order=nombre.asc`);
    return data.map(x=>x.nombre.toUpperCase());
  }

  async function loadCargos(){
    const data = await getData(`${window.APD_SUPABASE_URL}/rest/v1/catalogo_cargos_areas?select=codigo,nombre&limit=1500`);
    return data.map(x=>`(${x.codigo}) ${x.nombre}`.toUpperCase());
  }

  function makeSelect(id, options){
    const old = document.getElementById(id);
    if(!old || old.tagName==='SELECT') return;

    const val = old.value;

    const sel = document.createElement('select');
    sel.id = id;
    sel.style.width = '100%';

    const opt0 = document.createElement('option');
    opt0.value='';
    opt0.textContent='NINGUNA';
    sel.appendChild(opt0);

    options.forEach(o=>{
      const op = document.createElement('option');
      op.value=o;
      op.textContent=o;
      sel.appendChild(op);
    });

    if(val) sel.value = val;

    old.replaceWith(sel);
  }

  async function apply(){
    const [distritos, cargos] = await Promise.all([
      loadDistritos(),
      loadCargos()
    ]);

    DIST_IDS.forEach(id=>makeSelect(id, distritos));
    CARGO_IDS.forEach(id=>makeSelect(id, cargos));
  }

  function fixPassword(){
    const grid = document.querySelector('#form-mi-password .grid-2');
    if(grid) grid.style.gridTemplateColumns='1fr';
  }

  const obs = new MutationObserver(()=>{
    apply();
    fixPassword();
  });

  obs.observe(document.body,{childList:true,subtree:true});

  setTimeout(()=>{
    apply();
    fixPassword();
  },500);
})();