/* APDocentePBA · Maqueta visual integral, sin backend ni persistencia.
   Datos de alertas ficticios. Los recursos son fichas públicas del repositorio.
   Ningún control crea cambios, solicitudes de red ni contratos.
*/
(function(){
'use strict';
const ids=['resumen','alertas','listados','estadisticas','preferencias','plan','recursos','buscar'];
const names={resumen:'Resumen',alertas:'Alertas',listados:'Listados APD',estadisticas:'Estadísticas',preferencias:'Preferencias',plan:'Mi plan',recursos:'Herramientas',buscar:'Buscar'};
const nav=Array.from(document.querySelectorAll('#mock-tabs [data-tab]'));
const catalog=Array.isArray(window.AP_DOCENTE_HERRAMIENTAS)?window.AP_DOCENTE_HERRAMIENTAS:[];
const $=id=>document.getElementById(id);
const norm=s=>String(s??'').toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
let toastClear=null;
function element(tag,cl,text) {
  const node=document.createElement(tag);
  if(cl) node.className=cl;
  if(text!==undefined)node.textContent=String(text);
  return node;
}
function note(msg){
  const box=$('toast');if(!box)return;
  box.hidden=false;box.textContent=msg;
  if(toastClear) clearTimeout(toastClear);
  toastClear=setTimeout(()=>{box.hidden=true;box.textContent='';},4200);
}
function show(id,{updateHash=true}={}){
  const target=ids.includes(id)?id:'resumen';
  ids.forEach(key=>{
    const active=key===target;
    const section=$('section-'+key);
    if(section){section.classList.toggle('active',active);section.hidden=!active;}
  });
  nav.forEach(button=>{
    const active=button.dataset.tab===target;
    button.classList.toggle('is-active',active);
    if(active)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  const heading=$('header-location');if(heading)heading.textContent=names[target];
  if(updateHash && window.location.hash!=='#'+target)history.replaceState(null,'','#'+target);
  window.scrollTo({top:0,behavior:'instant'});
}
nav.forEach(button=>button.addEventListener('click',()=>show(button.dataset.tab)));
document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',event=>{
  if(el.tagName==='A')event.preventDefault();
  show(el.dataset.go);
}));
window.addEventListener('hashchange',()=>show(location.hash.slice(1),{updateHash:false}));
show(location.hash.slice(1),{updateHash:false});

const alerts=[
  {title:'Preceptor · Secundaria',location:'Avellaneda',shift:'Mañana',school:'Escuela ficticia A'},
  {title:'Matemática · Secundaria',location:'Quilmes',shift:'Tarde',school:'Escuela ficticia B'},
  {title:'Informática · Técnica',location:'Lanús',shift:'Noche',school:'Escuela ficticia C'}
];
let alertIndex=0;
function renderAlertState(){
  const frame=$('alert-state-view');const state=$('alert-state')?.value||'results';
  if(!frame)return;
  frame.replaceChildren();
  if(state!=='results'){
    const box=element('div',state==='error'?'status danger':state==='empty'?'empty':'status');
    const title=element('strong','',state==='error'?'No pudimos verificar tus alertas':state==='empty'?'No encontramos coincidencias en el ejemplo':'Actualizando ofertas…');
    const copy=element('p','',state==='error'?'El servidor no respondió. Esta situación nunca debe confundirse con cero ofertas.':state==='empty'?'Probá otros distritos, cargos o turnos. Este es un resultado ficticio.':'Podés seguir usando el resto del panel mientras llegan las alertas.');
    box.append(title,copy);frame.appendChild(box);
    if(state==='error') {const retry=element('button','btn secondary','Reintentar (demo)');retry.type='button';retry.addEventListener('click',()=>{$('alert-state').value='results';renderAlertState();note('Se restableció únicamente la visualización de ejemplo.');});frame.appendChild(retry);}
    return;
  }
  const offer=alerts[alertIndex];
  const top=element('div','row-between');
  top.append(element('span','pill neutral','Tarjeta ficticia · El carrusel real no se modifica'),element('span','small',(alertIndex+1)+' de '+alerts.length));
  const tile=element('article','offer-tile');
  tile.id='example-alert-card';
  tile.appendChild(element('h3','',offer.title));
  const meta=element('div','offer-meta');
  for(const item of [offer.location,offer.shift,offer.school])meta.appendChild(element('span','',item));
  tile.append(meta,element('p','', 'Esta representación enseña la ubicación visual; el carrusel original sigue intacto en la plataforma.'));
  const controls=element('div','frame-controls');
  const prev=element('button','btn secondary','← Anterior');prev.type='button';prev.id='carousel-prev';
  const count=element('span','small','Botones de ejemplo · Sin consultar ABC');
  const next=element('button','btn secondary','Siguiente →');next.type='button';next.id='carousel-next';
  prev.addEventListener('click',()=>{alertIndex=(alertIndex+alerts.length-1)%alerts.length;renderAlertState();});
  next.addEventListener('click',()=>{alertIndex=(alertIndex+1)%alerts.length;renderAlertState();});
  controls.append(prev,count,next);
  frame.append(top,tile,controls);
}
$('alert-state')?.addEventListener('change',renderAlertState);
renderAlertState();

function selectedLevels(){return Array.from(document.querySelectorAll('input[name="pref-level"]:checked')).map(x=>x.value);}
function renderPrefs(){
  const district=$('pref-district').value;
  const cargo=$('pref-cargo').value;
  const turn=$('pref-turn').selectedOptions[0]?.textContent||'Todos los turnos';
  const levels=selectedLevels();
  const active=$('pref-status').value==='yes';
  const email=$('pref-email').checked;
  const s=$('pref-summary');
  s.replaceChildren();
  const title=element('strong','',district+' · '+cargo);
  const description=document.createTextNode((levels.length?levels.join(', '):'Todos los niveles')+' · '+turn+
    '\n'+(active?'Alertas activas':'Alertas pausadas')+' · Email '+(email?'sí':'no')+' (demo)');
  const text=element('div','');text.style.whiteSpace='pre-line';text.appendChild(description);
  s.append(title,text);
  const dashboard=$('dashboard-config-summary');
  dashboard.replaceChildren();
  dashboard.append(element('strong','',district+' · '+cargo));
  dashboard.append(element('p','small',(levels.length?levels.join(', '):'Todos los niveles')+' · '+turn));
  dashboard.append(element('p','small','Email: '+(email?'Sí':'No')+' (demo)'));
  const badge=dashboard.parentElement?.querySelector('.pill');
  if(badge){badge.textContent=active?'Configurada':'Alertas pausadas';badge.className='pill '+(active?'good':'warn');}
}
$('preferences-form')?.addEventListener('submit',e=>{
  e.preventDefault();renderPrefs();
  const active=$('pref-status').value==='yes',email=$('pref-email').checked;
  note(active&&!email?'Simulación aplicada: las alertas están activas pero el email está deshabilitado.':'Preferencias actualizadas solamente en esta vista. No guardamos ni enviamos nada.');
});
$('prefs-reset')?.addEventListener('click',()=>{
  $('preferences-form').reset();
  document.querySelectorAll('input[name="pref-level"]').forEach(x=>{x.checked=x.value==='SECUNDARIO';});
  renderPrefs();note('Se restauró el ejemplo sin modificar tu cuenta.');
});
renderPrefs();

function renderAdvisor(){
  const d=Number($('need-districts').value),c=Number($('need-cargos').value);
  const plans=[{name:'Plus',d:2,c:4},{name:'Pro',d:3,c:6},{name:'Insigne (actual)',d:5,c:10}];
  const fit=plans.find(p=>p.d>=d&&p.c>=c);
  const box=$('plan-advisor');box.replaceChildren();
  if(fit){box.append(element('strong','','Orientación: '+fit.name),document.createTextNode('Cupos publicados por el Worker en el corte de referencia. Confirmá prestaciones y condiciones vigentes antes de contratar.'));}
  else box.append(element('strong','','Fuera de los límites publicados'),document.createTextNode('No se ofrece cobertura imaginaria ni se modifica el plan existente.'));
}
$('need-districts')?.addEventListener('change',renderAdvisor);$('need-cargos')?.addEventListener('change',renderAdvisor);renderAdvisor();

const states=[...new Set(catalog.map(c=>c.estado).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
const categories=[...new Set(catalog.map(c=>c.categoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
function putOptions(el,items) {
  for(const value of items){const opt=element('option','',value);opt.value=value;el.appendChild(opt);}
}
putOptions($('tools-category'),categories);
putOptions($('tools-state'),states);
function iconFor(record){return String(record.icono||'▤').slice(0,4);}
function resourceCard(record){
  const art=element('article','card resource-card');
  art.appendChild(element('span','resource-icon',iconFor(record)));
  const title=element('h3','',record.titulo||'Herramienta');
  const status=element('span','pill '+(record.estado==='Experimental'?'warn':record.estado==='Preparado'?'neutral':'good'),record.estado||'Sin verificar');
  const category=element('span','small',record.categoria||'Recurso');
  const desc=element('p','',record.descripcion||'Recurso del catálogo.');
  const actions=element('div','actions');
  const link=element('a','btn secondary','Abrir recurso existente ↗');
  const path=String(record.url||'').replace(/^\.\//,'');
  // Lista de rutas relativas suministrada por el catálogo estático del propio repositorio.
  if(!/^[a-z0-9_./-]+\.html(?:\?[a-z0-9_=&-]+)?$/i.test(path)||path.includes('..')){
    link.removeAttribute('href');link.textContent='Ruta no verificada';
  }else{
    link.href='https://alertasapd.com.ar/'+path;
    link.target='_blank';link.rel='noopener noreferrer';link.title='Abre la herramienta existente del sitio productivo';
  }
  actions.appendChild(link);
  art.append(title,category,status,desc,actions);
  return art;
}
function sortedRecords(rows){return rows.slice().sort((a,b)=>(Number(!!b.destacado)-Number(!!a.destacado))||String(a.titulo).localeCompare(String(b.titulo),'es'));}
function matchTerms(record,query){
  if(!query.trim())return true;
  const terms=norm(query).split(/[^a-z0-9]+/).filter(Boolean);
  const blob=norm([record.titulo,record.categoria,record.descripcion,(record.tags||[]).join(' ')].join(' '));
  return terms.every(term=>blob.includes(term));
}
function putResults(box,items,limit=12){
  box.replaceChildren();
  if(!items.length){
    const empty=element('div','empty');empty.append(element('strong','','No encontramos ese recurso'),element('p','','Probá términos más generales, otra categoría o borrá los filtros.'));
    box.appendChild(empty);return;
  }
  let visible=Math.min(limit,items.length);
  const render=()=>{
    box.replaceChildren();
    for(const record of items.slice(0,visible))box.appendChild(resourceCard(record));
    if(visible<items.length){
      const wrapper=element('div','');wrapper.style.gridColumn='1 / -1';wrapper.style.textAlign='center';
      const more=element('button','btn secondary','Mostrar más ('+(items.length-visible)+' restantes)');
      more.type='button';more.addEventListener('click',()=>{visible=Math.min(visible+12,items.length);render();});
      wrapper.appendChild(more);box.appendChild(wrapper);
    }
  };
  render();
}
function refreshTools(){
  const cat=$('tools-category').value,st=$('tools-state').value;
  const rows=sortedRecords(catalog.filter(r=>(!cat||r.categoria===cat)&&(!st||r.estado===st)));
  $('tools-count').textContent=rows.length+' de '+catalog.length+' recursos · Catálogo estático del repositorio';
  putResults($('tools-results'),rows);
}
$('tools-category')?.addEventListener('change',refreshTools);
$('tools-state')?.addEventListener('change',refreshTools);
$('tools-clear')?.addEventListener('click',()=>{$('tools-category').value='';$('tools-state').value='';refreshTools();});
refreshTools();
function refreshSearch(){
  const text=$('search-text').value;
  const rows=sortedRecords(catalog.filter(row=>matchTerms(row,text)));
  $('search-count').textContent=rows.length+' resultado(s) para '+(text.trim()?'“'+text.trim().slice(0,90)+'”':'todo el catálogo')+' · Fichas verificadas en el repositorio';
  putResults($('search-results'),rows);
  const n=norm(text);
  document.querySelectorAll('[data-query]').forEach(btn=>btn.classList.toggle('active',norm(btn.dataset.query)===n));
}
$('search-form')?.addEventListener('submit',e=>{e.preventDefault();refreshSearch();});
$('search-text')?.addEventListener('input',refreshSearch);
$('search-clear')?.addEventListener('click',()=>{$('search-text').value='';refreshSearch();$('search-text').focus();});
document.querySelectorAll('[data-query]').forEach(btn=>btn.addEventListener('click',()=>{
  $('search-text').value=btn.dataset.query;refreshSearch();
}));
refreshSearch();
$('global-search')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    e.preventDefault();$('search-text').value=e.target.value;show('buscar');refreshSearch();$('search-text').focus();
  }
});
$('stats-explain')?.addEventListener('click',()=>note('Corte y fuentes al 1/11/2026: no son métricas en vivo. Los filtros personales requieren autenticación.'));
$('theme-toggle')?.addEventListener('click',()=>{
  const dark=document.body.dataset.theme!=='dark';
  document.body.dataset.theme=dark?'dark':'light';
  $('theme-toggle').setAttribute('aria-pressed',String(dark));
  $('theme-label').textContent=dark?'Claro':'Oscuro';
  note(dark?'Modo oscuro de ejemplo activado. No se guarda.':'Modo claro restaurado.');
});
})();
