(function(){
'use strict';
if(window.__apdListboxFixLoaded5) return;
window.__apdListboxFixLoaded5 = true;

const SUPABASE_URL = 'https://vvgkinkvojqwfuqaxijh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Otlh-GYO19ZzO7VhwGzDIw_ebuJkukT';
const MAX_DISTRICT_ITEMS = 300;
const MAX_CARGO_ITEMS = 3000;
const INITIAL_DISTRICT_RENDER = 140;
const INITIAL_CARGO_RENDER = 120;
const CHUNK_DISTRICT_RENDER = 80;
const CHUNK_CARGO_RENDER = 120;
const INPUT_DEBOUNCE_MS = 90;
const cache = { distritos: null, cargos: null };
const listState = new WeakMap();

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

function getInitialRender(type){
 return type === 'distrito' ? INITIAL_DISTRICT_RENDER : INITIAL_CARGO_RENDER;
}

function getChunkRender(type){
 return type === 'distrito' ? CHUNK_DISTRICT_RENDER : CHUNK_CARGO_RENDER;
}

function debounce(fn, ms){
 let timer = null;
 return function(){
  const args = arguments;
  clearTimeout(timer);
  timer = setTimeout(function(){ fn.apply(null, args); }, ms);
 };
}

function addStyle(){
 if(document.getElementById('apd-listbox-fix-style-5')) return;
 const s=document.createElement('style');
 s.id='apd-listbox-fix-style-5';
 s.textContent=`
 .ac-list{z-index:9999;}
 .ac-list[data-force-open="1"]{display:block!important;max-height:320px!important;overflow-y:auto!important;border:1px solid #d9dfe8;background:#fff;box-shadow:0 10px 24px rgba(0,0,0,.08);}
 .ac-list .ac-item{padding:10px 12px;cursor:pointer;}
 .ac-list .ac-item:hover{background:#f2f6ff;}
 .ac-list .ac-more{padding:8px 12px;color:#6b7280;font-size:12px;background:#fafafa;border-top:1px solid #eef2f7;}
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

function buildCatalog(rows, type){
 const seen = new Set();
 const items = [];
 const normalized = [];
 (Array.isArray(rows)?rows:[]).forEach(function(row){
  if(type === 'distrito'){
   [row?.nombre,row?.apd_nombre].forEach(function(raw){
    const v = String(raw||'').trim().toUpperCase();
    const k = norm(v);
    if(!v || !k || seen.has(k)) return;
    seen.add(k);
    items.push(v);
    normalized.push(k);
   });
   return;
  }
  const codigo = String(row?.codigo||'').trim().toUpperCase();
  const nombre = String(row?.nombre||row?.apd_nombre||'').trim().toUpperCase();
  if(!nombre) return;
  const v = codigo ? `(${codigo}) ${nombre}` : nombre;
  const k = norm(v);
  if(!k || seen.has(k)) return;
  seen.add(k);
  items.push(v);
  normalized.push(k);
 });
 return { items, normalized };
}

async function loadDistritos(){
 if(cache.distritos) return cache.distritos;
 const rows=await fetchJson(`${SUPABASE_URL}/rest/v1/catalogo_distritos?select=nombre,apd_nombre&order=nombre.asc`);
 cache.distritos = buildCatalog(rows, 'distrito');
 return cache.distritos;
}

async function loadCargos(){
 if(cache.cargos) return cache.cargos;
 const rows=await fetchJson(`${SUPABASE_URL}/rest/v1/catalogo_cargos_areas?select=codigo,nombre,apd_nombre&order=nombre.asc&limit=4000`);
 cache.cargos = buildCatalog(rows, 'cargo');
 return cache.cargos;
}

function filterItems(catalog, query, type){
 const maxItems = getMaxItems(type);
 const q = norm(query);
 const items = catalog.items;
 const normalized = catalog.normalized;
 if(!q) return items.slice(0, maxItems);
 const starts=[];
 const contains=[];
 for(let i=0;i<items.length;i++){
  const n = normalized[i];
  if(!n) continue;
  if(n.startsWith(q)) starts.push(items[i]);
  else if(n.includes(q)) contains.push(items[i]);
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
 const state = listState.get(list);
 if(state){
  state.items = [];
  state.rendered = 0;
  state.type = '';
 }
}

function appendRows(input,list,start,end){
 const state = listState.get(list);
 if(!state || !state.items.length) return;
 const items = state.items;
 const frag=document.createDocumentFragment();
 for(let i=start;i<end;i++){
  const item=items[i];
  const div=document.createElement('div');
  div.className='ac-item';
  div.dataset.value=item;
  div.textContent=item;
  div.addEventListener('mousedown',function(ev){
   ev.preventDefault();
   input.value=item;
   hideList(list);
  });
  frag.appendChild(div);
 }
 const more=list.querySelector('.ac-more');
 if(more) more.remove();
 list.appendChild(frag);
 if(end < items.length){
  const info=document.createElement('div');
  info.className='ac-more';
  info.textContent=`Mostrando ${end} de ${items.length}. Bajá para cargar más.`;
  list.appendChild(info);
 }
 state.rendered = end;
}

function renderList(input,list,items,type){
 list.innerHTML='';
 const state = { items, type, rendered: 0 };
 listState.set(list, state);
 const none=document.createElement('div');
 none.className='ac-item';
 none.dataset.value='';
 none.textContent='NINGUNA';
 none.addEventListener('mousedown',function(ev){
  ev.preventDefault();
  input.value='';
  hideList(list);
 });
 list.appendChild(none);
 const initial=Math.min(items.length, getInitialRender(type));
 appendRows(input,list,0,initial);
 showList(list);
}

function maybeAppendMore(input,list){
 const state = listState.get(list);
 if(!state || !state.items.length) return;
 if(state.rendered >= state.items.length) return;
 if(list.scrollTop + list.clientHeight < list.scrollHeight - 24) return;
 const next=Math.min(state.items.length, state.rendered + getChunkRender(state.type || 'cargo'));
 appendRows(input,list,state.rendered,next);
}

async function openList(input,list,type){
 const catalog = type === 'distrito' ? await loadDistritos() : await loadCargos();
 renderList(input,list,filterItems(catalog,input.value,type),type);
}

function bind(){
 addStyle();
 pairs.forEach(function(pair){
   const input=document.getElementById(pair[0]);
   const list=document.getElementById(pair[1]);
   const type=pair[2];
   if(!input||!list||input.dataset.apdListFixBound5==='1') return;
   input.dataset.apdListFixBound5='1';
   hideList(list);
   const debouncedInput = debounce(function(){ openList(input,list,type).catch(console.error); }, INPUT_DEBOUNCE_MS);
   input.addEventListener('focus',function(){openList(input,list,type).catch(console.error);});
   input.addEventListener('click',function(){openList(input,list,type).catch(console.error);});
   input.addEventListener('input',debouncedInput);
   input.addEventListener('keydown',function(ev){ if(ev.key==='ArrowDown') openList(input,list,type).catch(console.error); });
   input.addEventListener('blur',function(){ setTimeout(function(){hideList(list);},180); });
   list.addEventListener('scroll',function(){ maybeAppendMore(input,list); });
  });
 const rec=document.getElementById('btn-recargar-panel'); if(rec) rec.remove();
}

const obs=new MutationObserver(bind);
obs.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
})();