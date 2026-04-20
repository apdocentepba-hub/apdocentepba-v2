(function(){
  'use strict';

  if (window.__apdFrontendPatchLoadedV4) return;
  window.__apdFrontendPatchLoadedV4 = true;

  const DIST_IDS = ['pref-distrito-principal','pref-segundo-distrito','pref-tercer-distrito','pref-cuarto-distrito','pref-quinto-distrito'];
  const CARGO_IDS = ['pref-cargo-1','pref-cargo-2','pref-cargo-3','pref-cargo-4','pref-cargo-5','pref-cargo-6','pref-cargo-7','pref-cargo-8','pref-cargo-9','pref-cargo-10'];
  const LIST_IDS = ['sug-distrito-1','sug-distrito-2','sug-distrito-3','sug-distrito-4','sug-distrito-5','sug-cargo-1','sug-cargo-2','sug-cargo-3','sug-cargo-4','sug-cargo-5','sug-cargo-6','sug-cargo-7','sug-cargo-8','sug-cargo-9','sug-cargo-10'];
  const cache = { distritos: null, cargos: null };

  function esc(v){
    return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function addStyle(){
    if(document.getElementById('apd-frontend-v4-style')) return;
    const style=document.createElement('style');
    style.id='apd-frontend-v4-style';
    style.textContent=`
      #btn-recargar-panel{display:none!important;}
      .ac-list{display:none!important;}
      .apd-native-select{width:100%;padding:11px 14px;border:1.5px solid var(--gris-b);border-radius:var(--r-sm);font-family:inherit;font-size:14px;color:var(--texto);background:#fff;appearance:auto;}
      .apd-native-select:focus{outline:none;border-color:var(--azul-claro);box-shadow:0 0 0 3px rgba(31,102,255,.13);}
      #form-mi-password .grid-2{grid-template-columns:1fr!important;gap:12px!important;}
      #form-mi-password .grid-2>.field{margin-bottom:0!important;width:100%!important;}
      #form-mi-password .pw-wrap,#form-mi-password .pw-wrap input{width:100%!important;}
    `;
    document.head.appendChild(style);
  }

  async function fetchJson(url){
    const r=await fetch(url,{headers:{apikey:window.APD_SUPABASE_KEY,Authorization:`Bearer ${window.APD_SUPABASE_KEY}`}});
    if(!r.ok) throw new Error('fetch failed');
    return r.json();
  }

  async function loadDistritos(){
    if(cache.distritos) return cache.distritos;
    const rows=await fetchJson(`${window.APD_SUPABASE_URL}/rest/v1/catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc`);
    const seen=new Set();
    cache.distritos=[];
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      [row?.nombre,row?.apd_nombre].forEach(raw=>{
        const v=String(raw||'').trim().toUpperCase();
        if(!v||seen.has(v)) return;
        seen.add(v);
        cache.distritos.push(v);
      });
    });
    return cache.distritos;
  }

  async function loadCargos(){
    if(cache.cargos) return cache.cargos;
    const rows=await fetchJson(`${window.APD_SUPABASE_URL}/rest/v1/catalogo_cargos_areas?select=codigo,nombre,apd_nombre&order=nombre.asc&limit=1500`);
    const seen=new Set();
    cache.cargos=[];
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      const codigo=String(row?.codigo||'').trim().toUpperCase();
      const nombre=String(row?.nombre||row?.apd_nombre||'').trim().toUpperCase();
      if(!nombre) return;
      const v=codigo?`(${codigo}) ${nombre}`:nombre;
      if(seen.has(v)) return;
      seen.add(v);
      cache.cargos.push(v);
    });
    return cache.cargos;
  }

  function buildSelect(id, options, currentValue){
    const select=document.createElement('select');
    select.id=id;
    select.name=id;
    select.className='apd-native-select';
    select.innerHTML=`<option value="">NINGUNA</option>${options.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;
    const wanted=String(currentValue||'').trim();
    if(wanted){
      const exists=Array.from(select.options).some(o=>o.value===wanted);
      if(!exists){
        const extra=document.createElement('option');
        extra.value=wanted;
        extra.textContent=wanted;
        select.appendChild(extra);
      }
      select.value=wanted;
    }
    return select;
  }

  function replaceInput(id, options){
    const old=document.getElementById(id);
    if(!old||old.tagName==='SELECT') return;
    const current=old.value||'';
    const select=buildSelect(id, options, current);
    old.replaceWith(select);
  }

  async function apply(){
    try{
      addStyle();
      const [distritos,cargos]=await Promise.all([loadDistritos(),loadCargos()]);
      DIST_IDS.forEach(id=>replaceInput(id,distritos));
      CARGO_IDS.forEach(id=>replaceInput(id,cargos));
      LIST_IDS.forEach(id=>{ const el=document.getElementById(id); if(el) el.remove(); });
      const rec=document.getElementById('btn-recargar-panel'); if(rec) rec.remove();
    }catch(err){ console.error('frontend patch v4 error', err); }
  }

  const obs=new MutationObserver(()=>{ apply(); });
  obs.observe(document.documentElement,{childList:true,subtree:true});

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  }else{
    apply();
  }
})();