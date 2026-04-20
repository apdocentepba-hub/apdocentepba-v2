(function(){
'use strict';
if(window.__apdListboxFixLoaded3) return;
window.__apdListboxFixLoaded3 = true;

const SUPABASE_URL = 'https://vvgkinkvojqwfuqaxijh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Otlh-GYO19ZzO7VhwGzDIw_ebuJkukT';
const MAX_DISTRICT_ITEMS = 300;
const MAX_CARGO_ITEMS = 3000;
const cache = { distritos: null, cargos: null };

const pairs=[
['pref-distrito-principal','sug-distrito-1','distrito'],['pref-segundo-distrito','sug-distrito-2','distrito'],['pref-tercer-distrito','sug-distrito-3','distrito'],['pref-cuarto-distrito','sug-distrito-4','distrito'],['pref-quinto-distrito','sug-distrito-5','distrito'],
['pref-cargo-1','sug-cargo-1','cargo'],['pref-cargo-2','sug-cargo-2','cargo'],['pref-cargo-3','sug-cargo-3','cargo'],['pref-cargo-4','sug-cargo-4','cargo'],['pref-cargo-5','sug-cargo-5','cargo'],['pref-cargo-6','sug-cargo-6','cargo'],['pref-cargo-7','sug-cargo-7','cargo'],['pref-cargo-8','sug-cargo-8','cargo'],['pref-cargo-9','sug-cargo-9','cargo'],['pref-cargo-10','sug-cargo-10','cargo']
];

function esc(v){
 return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function norm(v){
 return String(v||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
}

function getMaxItems(type){
 return type === 'distrito' ? MAX_DISTRICT_ITEMS : MAX_CARGO_ITEMS;
}

function addStyle(){
 if(document.getElementById('apd-listbox-fix-style-3')) return;
 const s=document.createElement('style');
 s.id='apd-listbox-fix-style-3';
 s.textContent=`
 .ac-list{z-index:9999;}
 .ac-list[data-force-open="1"]{display:block!important;max-height:320px!important;overflow-y:auto!important;border:1px solid #d9dfe8;background:#fff;box-shadow:0 10px 24px rgba(0,0,0,.08);}
 .ac-list .ac-item{padding:10px 12px;cursor:pointer;}
 .ac-list .ac-item:hover{background:#f2f6ff;}
 #btn-recargar-panel{display:none!important;}
 #form-mi-password .grid-2{grid-template-columns:1fr!important;gap:12px!important;}
 `;
 document.head.appendChild(s);
}

async function fetchJson(url){
 const r=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}});
 if(!r.ok) throw new Error(`fetch failed ${r.status}`);
 return r.json();
}

async function loadDistritos(){
 if(cache.distritos) return cache.distritos;
 const rows=await fetchJson(`${SUPABASE_URL}/rest/v1/catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc`);
 const seen=new Set();
 cache.distritos=[];
 (Array.isArray(rows)?rows:[]).forEach(row=>{
  [row?.nombre,row?.apd_nombre].forEach(raw=>{
   const v=String(raw||'').trim().toUpperCase();
   const k=norm(v);
   if(!v||!k||seen.has(k)) return;
   seen.add(k);
   cache.distritos.push(v);
  });
 });
 return cache.distritos;
}

async function loadCargos(){
 if(cache.cargos) return cache.cargos;
 const rows=await fetchJson(`${SUPABASE_URL}/rest/v1/catalogo_cargos_areas?select=codigo,nombre,apd_nombre&order=nombre.asc&limit=4000`);
 const seen=new Set();
 cache.cargos=[];
 (Array.isArray(rows)?rows:[]).forEach(row=>{
  const codigo=String(row?.codigo||'').trim().toUpperCase();
  const nombre=String(row?.nombre||row?.apd_nombre||'').trim().toUpperCase();
  if(!nombre) return;
  const v=codigo?`(${codigo}) ${nombre}`:nombre;
  const k=norm(v);
  if(!k||seen.has(k)) return;
  seen.add(k);
  cache.cargos.push(v);
 });
 return cache.cargos;
}

function filterItems(items, query, type){
 const maxItems = getMaxItems(type);
 const q=norm(query);
 if(!q) return items.slice(0, maxItems);
 const starts=[];
 const contains=[];
 for(const item of items){
  const n=norm(item);
  if(!n) continue;
  if(n.startsWith(q)) starts.push(item);
  else if(n.includes(q)) contains.push(item);
  if(starts.length + contains.length >= maxItems) break;
 }
 return starts.concat(contains).slice(0, maxItems);
}

function showList(list){
 list.dataset.forceOpen='1';
 list.style.display='block';
 list.style.maxHeight='320px';
 list.style.overflowY='auto';
}

function hideList(list){
 list.dataset.forceOpen='0';
 list.style.display='none';
}

function renderList(input,list,items){
 list.innerHTML=['<div class="ac-item" data-value="">NINGUNA</div>']
  .concat(items.map(item=>`<div class="ac-item" data-value="${esc(item)}">${esc(item)}</div>`)).join('');
 showList(list);
 list.querySelectorAll('.ac-item').forEach(el=>{
  el.addEventListener('mousedown',function(ev){
   ev.preventDefault();
   input.value=el.dataset.value||'';
   hideList(list);
  });
 });
}

async function openList(input,list,type){
 const source = type === 'distrito' ? await loadDistritos() : await loadCargos();
 renderList(input,list,filterItems(source,input.value,type));
}

function bind(){
 addStyle();
 pairs.forEach(function(pair){
   const input=document.getElementById(pair[0]);
   const list=document.getElementById(pair[1]);
   const type=pair[2];
   if(!input||!list||input.dataset.apdListFixBound3==='1') return;
   input.dataset.apdListFixBound3='1';
   hideList(list);
   input.addEventListener('focus',function(){openList(input,list,type).catch(console.error);});
   input.addEventListener('click',function(){openList(input,list,type).catch(console.error);});
   input.addEventListener('input',function(){openList(input,list,type).catch(console.error);});
   input.addEventListener('keydown',function(ev){ if(ev.key==='ArrowDown') openList(input,list,type).catch(console.error); });
   input.addEventListener('blur',function(){ setTimeout(function(){hideList(list);},180); });
  });
 const rec=document.getElementById('btn-recargar-panel'); if(rec) rec.remove();
}

const obs=new MutationObserver(bind);
obs.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
})();