/* APDocentePBA — comparador opt-in; isolated browser-only UI.
 * No credentials, user data storage, outbound fetches or mutations.
 */
import {compareOffers} from './scripts/apd-comparador-criterios.mjs?v=20261109-decision1';
import {assessComparatorCriterion} from './scripts/apd-comparador-datos-evaluacion.mjs';
import {checkScheduleOverlap,compareSelectedOfferSchedules} from './scripts/apd-mi-jornada-comparador.mjs?v=20261109-pairs1';
import {hasInsignePlannerAccess} from './scripts/apd-insigne-planner-entitlement.mjs';
import {createPrivatePlannerForm,loadPrivatePlanner,clearPrivatePlanner} from './scripts/apd-mi-jornada-ui.mjs?v=20261109-gap1';
import {
 fetchSelectedSchools,pairSchoolDistances,verifiedSchoolKey
} from './scripts/apd-school-geodistance.mjs';

const state={
 available:[],selected:new Set(),index:0,current:null,enabled:false,
 privatePlannerAllowed:false,
 sort:'cierre',district:'',turn:'',
 geoByKey:Object.create(null),geoRequested:false,geoWorking:false,
 geoStatus:'',geoRunId:0,geoAbort:null,geoSignature:'',anchor:''
};
const root=document.getElementById('apd-comparador-panel');
const max=5;
const safeKey=key=>/^[A-Za-z0-9_.:|-]{1,160}$/.test(key);
const codePattern=/^[0-9]{4}[A-Z]{2}[0-9]{4}$/;

function offerKey(offer) {
 const declared=String(offer?.source_offer_key||'').trim();
 if(safeKey(declared))return declared;
 const id=String(offer?.iddetalle??'').trim();
 return /^[0-9]{1,14}$/.test(id)?'D_'+id:null;
}
function selectedOffers() {
 return state.available.filter(x=>state.selected.has(offerKey(x)))
  .map(x=>({...x,source_offer_key:offerKey(x)}));
}
function node(tag,classes,text) {
 const el=document.createElement(tag);
 if(classes)el.className=classes;
 if(text!==undefined)el.textContent=String(text);
 return el;
}
function button(label,onClick,classes='btn btn-secondary') {
 const el=node('button',classes,label);
 el.type='button';
 el.addEventListener('click',onClick);
 return el;
}
function titleFor(offer) {
 return [String(offer?.descripcioncargo||offer?.cargo||'Cargo sin descripción').trim(),
  String(offer?.distrito||'').trim()].filter(Boolean).join(' · ');
}
function closeComparisonDialog() {
 const previous=document.getElementById('apd-comparison-dialog');
 if(!previous)return;
 if(previous.open&&typeof previous.close==='function')previous.close();
 previous.remove();
}
// Read-only comparison snapshot of numbers ALREADY displayed by the authorized
// card. Never calls the API, accesses credentials or stores data beyond this tab.
const observedApplicants=new Map();
let applicantObserver=null;
function offerIdentity(offer) {
 return [offerKey(offer),String(offer?.idoferta??''),String(offer?.iddetalle??'')].join('|');
}
function captureVisibleApplicants() {
 if(!state.enabled||!state.current)return;
 const box=document.querySelector('#panel-alertas .alerta-main-card #alerta-postulantes-meta');
 if(!box)return;
 const field=label=>{
  const item=[...box.querySelectorAll('.alerta-meta-item')].find(el=>
   el.querySelector('.alerta-meta-k')?.textContent?.trim()===label);
  return item?.querySelector('.alerta-meta-v')?.textContent?.trim()||'';
 };
 const countText=field('Postulantes');
 let count=Number(countText);
 const empty=box.querySelector('.alerta-meta-empty')?.textContent?.trim()||'';
 if(!countText) {
  if(!empty.includes('Todavía no hay postulantes visibles'))return;
  count=0;
 }
 if(!Number.isSafeInteger(count)||count<0)return;
 const id=offerIdentity(state.current);
 observedApplicants.set(offerKey(state.current),{
  identity:id,verified_from_current_card:true,total_postulantes:count,
  puntaje_primero:field('Puntaje del primero'),
  listado_origen_primero:field('Listado del primero')
 });
}
function watchVisibleApplicants(){
 if(!applicantObserver)
  applicantObserver=new MutationObserver(captureVisibleApplicants);
 applicantObserver.disconnect();
 const panel=document.getElementById('panel-alertas');
 if(panel&&state.enabled)applicantObserver.observe(panel,{childList:true,subtree:true});
 captureVisibleApplicants();
}
function readApplicantSummaries(offers) {
 captureVisibleApplicants();
 const result=Object.create(null);
 for(const offer of offers) {
  const key=offerKey(offer);
  const cached=observedApplicants.get(key);
  if(cached?.identity===offerIdentity(offer))
   result[key]={
    verified_from_current_card:true,
    total_postulantes:cached.total_postulantes,
    puntaje_primero:cached.puntaje_primero,
    listado_origen_primero:cached.listado_origen_primero
   };
 }
 return result;
}
function focusComparison() {
 // The alert carousel may be in a fixed-height/rearranged card. Open the
 // actual comparison in the browser top layer, not under a clipped ancestor.
 if(!state.enabled||state.selected.size<2)return;
 const selected=selectedOffers();
 if(selected.length<2)return;
 closeComparisonDialog();
 const dialog=node('dialog','apd-comparator-dialog');
 dialog.id='apd-comparison-dialog';
 dialog.setAttribute('aria-label','Comparación de ofertas seleccionadas');
 const header=node('div','apd-comparator-modal-head');
 header.appendChild(node('h2','','Comparación de '+selected.length+' ofertas'));
 const close=button('Cerrar comparación',closeComparisonDialog,
  'apd-comparator-modal-close');
 close.id='apd-comparison-close';
 header.appendChild(close);
 dialog.appendChild(header);
 const body=node('div','apd-comparator-modal-body');
 if(state.privatePlannerAllowed)body.appendChild(
  createPrivatePlannerForm({onChanged:()=>{render();focusComparison()}})
 );
 else body.appendChild(node('p','apd-comparator-insigne-locked',
  'Domicilio y compatibilidad de jornadas: exclusivo del Plan Insigne vigente. '+
  'La comparación básica de ofertas sigue disponible.'));
 try {
  const origin=state.geoByKey[state.anchor]||null;
  const result=compareOffers({
   offers:selected,sortBy:state.sort,
   preferredDistricts:state.district?[state.district]:[],
   preferredTurns:state.turn?[state.turn]:[],
   referenceLocation:origin,verifiedGeoByKey:state.geoByKey,applicantSummaries:readApplicantSummaries(selected)
  });
  const comparison=renderSideBySide(result.items);
  if(comparison)body.appendChild(comparison);
  else {
   const reasons=result.excluded.map(x=>({
    official_status_closed:'estado oficial cerrado o anulado',
    confirmed_deadline_passed:'plazo de cierre vencido',
    duplicate_key:'identificador duplicado',
    missing_or_invalid_key:'identificador ausente o inválido'
   }[x.reason]||'información no comparable')).join('; ');
   body.appendChild(node('p','apd-comparator-unavailable',
    'No hay dos ofertas comparables: '+result.items.length+' de '+
    selected.length+' cumplen las condiciones. '+
    (reasons?'Motivos: '+reasons+'. ':'')+
    'Verificá la vigencia en ABC o seleccioná otras ofertas.'));
  }
 } catch(_) {
  body.appendChild(node('p','apd-comparator-unavailable',
   'No se pudo completar la comparación. Actualizá las ofertas y probá nuevamente.'));
 }
 dialog.appendChild(body);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 document.body.appendChild(dialog);
 if(typeof dialog.showModal==='function')dialog.showModal();
 else {dialog.setAttribute('open','');close.focus();}
}
function syncCurrentButton() {
 const actions=document.querySelector('#panel-alertas .alerta-main-card .alerta-actions');
 if(!actions)return;
 actions.querySelectorAll('#apd-comparar-oferta,#apd-ver-comparacion')
  .forEach(control=>control.remove());
 if(!state.enabled||!state.available.length)return;
 const item=state.current;
 const key=offerKey(item);
 const selected=key&&state.selected.has(key);
 const btn=button(!key?'Comparación no disponible (sin ID)':
  selected?'Quitar de comparación':'Comparar esta oferta',
  ()=>{
   if(!key)return;
   const beforeCount=state.selected.size;
   if(state.selected.has(key)){state.selected.delete(key);invalidateGeo();}
   else {
    if(state.selected.size>=max){
     const status=root?.querySelector('#apd-comparator-status');
     if(status)status.textContent='Podés comparar hasta cinco ofertas. Quitá una para continuar.';
     return;
    }
    state.selected.add(key);invalidateGeo();
   }
   syncCurrentButton();
   render();
   // Automatically reveal the first meaningful comparison (2 selected).
   if(beforeCount===1&&state.selected.size===2)focusComparison();
  });
 btn.id='apd-comparar-oferta';
 btn.disabled=!key;
 btn.setAttribute('aria-pressed',String(!!selected));
 btn.setAttribute('aria-controls','apd-comparador-panel');
 actions.appendChild(btn);
 if(state.selected.size){
  const view=button('Ver comparación ('+state.selected.size+')',focusComparison,
   'btn btn-secondary apd-compare-view');
  view.id='apd-ver-comparacion';
  view.setAttribute('aria-controls','apd-comparador-panel');
  actions.appendChild(view);
 }
}
function makeSelect(labelText,options,value,change){
 const container=node('label','apd-comparator-label');
 container.appendChild(node('span','',labelText));
 const select=node('select','apd-comparator-select');
 for(const [v,t] of options) {
  const option=document.createElement('option');
  option.value=v;option.textContent=t;
  select.appendChild(option);
 }
 select.value=value;
 select.addEventListener('change',()=>change(select.value));
 container.appendChild(select);
 return container;
}
function countLabel(n) {return n+' de '+max+' ofertas seleccionadas';}
function selectedSchoolKeys(){
 return [...new Set(selectedOffers().map(x=>verifiedSchoolKey(x.escuela)).filter(Boolean))];
}
function invalidateGeo(){
 state.geoRunId++;
 state.geoAbort?.abort();
 state.geoAbort=null;state.geoWorking=false;state.geoRequested=false;
 state.geoStatus='';state.geoByKey=Object.create(null);state.anchor='';
 state.geoSignature='';
 if(state.sort==='distancia')state.sort='cierre';
}
async function verifySchoolDistances(){
 if(!state.enabled||state.geoWorking)return;
 const codes=selectedSchoolKeys();
 if(codes.length<2){
  state.geoStatus='Seleccioná al menos dos escuelas con claves provinciales válidas.';
  render();return;
 }
 invalidateGeo();
 const run=state.geoRunId;
 const controller=new AbortController();
 state.geoAbort=controller;
 state.geoRequested=true;state.geoWorking=true;
 state.geoStatus='Consultando el Mapa Escolar ABC...';
 state.geoSignature=JSON.stringify(codes);
 render();
 try{
  // At most five anonymous, read-only GETs, on explicit click only.
  const response=await fetchSelectedSchools(codes,{signal:controller.signal});
  if(run!==state.geoRunId||!state.enabled||controller.signal.aborted)return;
  state.geoByKey=response.verified;
  const count=Object.keys(response.verified).length;
  state.anchor=codes.find(key=>response.verified[key])||'';
  state.geoStatus=count+' de '+codes.length+
   ' escuelas con ubicación exacta verificada en ABC.';
  if(count>=2)state.sort='distancia';
 }catch(_){
  if(run===state.geoRunId)state.geoStatus='No se pudieron verificar las escuelas.';
 }finally{
  if(run===state.geoRunId){
   state.geoWorking=false;state.geoAbort=null;render();
  }
 }
}
function renderSideBySide(items){
 if(!Array.isArray(items)||items.length<2)return null;
 const region=node('section','apd-comparator-side-by-side');
 const heading=node('h4','','Comparación lado a lado');
 heading.tabIndex=-1;
 region.appendChild(heading);
 region.appendChild(node('p','apd-comparator-hint',
  'Compará condiciones de trabajo y competencia visible. La compatibilidad PID indicada por el panel no garantiza adjudicación. Los postulantes provienen solo de fichas ya consultadas; no se actualizan al abrir esta tabla.'));
 // A same-day clock collision is not proof of normative incompatibility.
 const pairs=compareSelectedOfferSchedules(items);
 const alerts=pairs.filter(p=>p.status==='overlap'||p.status==='possible-overlap');
 const pairsBox=node('details','apd-comparator-schedule-pairs');
 pairsBox.open=alerts.length>0;
 const pairSummary=node('summary','apd-comparator-schedule-summary',
  'Cruces entre ofertas: '+alerts.length+' a revisar de '+pairs.length+' pares');
 pairsBox.appendChild(pairSummary);
 pairsBox.appendChild(node('p','apd-comparator-hint',
  'Compara días, horas y vigencias declaradas. No determina compatibilidad '+
  'normativa, adjudicación ni posibilidad de traslado.'));
 const pairsList=node('ul','apd-comparator-schedule-list');
 // Priority sorting keeps actionable collisions visible without requiring
 // scrolling through ten pairs when five offers are selected.
 const severity={overlap:0,'possible-overlap':1,unverified:2,
  'no-shared-date':3,'separate-periods':4,'no-time-overlap':5};
 const displayPairs=[...pairs].sort((a,b)=>
  (severity[a.status]??6)-(severity[b.status]??6)||
  a.firstOffer-b.firstOffer||a.secondOffer-b.secondOffer);
 for(const pair of displayPairs){
  const item=node('li','apd-comparator-schedule-item apd-comparator-schedule-'+pair.status);
  const match=pair.days?.length?
   ' · '+pair.days.join(', ')+', '+pair.from+' a '+pair.to:'';
  item.textContent='Ofertas '+pair.firstOffer+' y '+pair.secondOffer+': '+pair.label+match;
  pairsList.appendChild(item);
 }
 pairsBox.appendChild(pairsList);
 region.appendChild(pairsBox);
 const wrap=node('div','apd-comparator-table-scroll');
 wrap.tabIndex=0;
 wrap.setAttribute('role','region');
 wrap.setAttribute('aria-label','Tabla de comparación; desplazable horizontalmente');
 const table=node('table','apd-comparator-table');
 table.style.minWidth=(148+Math.max(items.length,2)*166)+'px';
 const caption=node('caption','','Ofertas seleccionadas y criterios comparables');
 table.appendChild(caption);
 const thead=document.createElement('thead');
 const titles=document.createElement('tr');
 const empty=node('th','','Criterio');empty.scope='col';titles.appendChild(empty);
 items.forEach((item,i)=>{
  const cell=node('th','', 'Oferta '+(i+1));
  cell.scope='col';titles.appendChild(cell);
 });
 thead.appendChild(titles);table.appendChild(thead);
 const tbody=document.createElement('tbody');
 const dateText=x=>{
  if(typeof x!=='number'||!Number.isFinite(x))return 'Sin cierre verificable';
  return new Intl.DateTimeFormat('es-AR',{
   timeZone:'America/Argentina/Buenos_Aires',
   day:'2-digit',month:'2-digit',year:'numeric',
   hour:'2-digit',minute:'2-digit'
  }).format(new Date(x));
 };
 const score=x=>typeof x==='number'&&Number.isFinite(x)?
  new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(x):null;
 const value=x=>String(x??'').trim()||'No informado';
 // Decision criteria shown by the primary card, not a guess about adjudication.
 const data=[
  ['Cargo',x=>value(x.cargo)],
  ['Distrito',x=>value(x.distrito)],
  ['Escuela',x=>value(x.escuela)],
  ['Turno',x=>value(x.turno)],
  ['Cierra',x=>dateText(x.cierre_ms)],
  ['Tiempo hasta el cierre',x=>x.horas_hasta_cierre===null?'Sin hora verificable':x.horas_hasta_cierre+' h'],
  ['Días y horarios',x=>value(x.horario)],
  ['Módulos',x=>value(x.modulos)],
  ['Vigencia desde',x=>value(x.supl_desde)],
  ['Vigencia hasta',x=>value(x.supl_hasta)],
  ['Revista / suplencia',x=>value(x.revista)],
  ['Jornada',x=>value(x.jornada)],
  ['Curso / división',x=>value(x.curso_division)],
  ['PID según ficha',x=>x.pid_compatible_panel===true?'Coincide según el panel':
   x.pid_compatible_panel===false?'No coincide según el panel':'Sin información PID'],
  ['Tu puntaje PID',x=>score(x.pid_puntaje_panel)||'Sin puntaje confirmado'],
  ['Postulantes visibles',x=>x.postulantes_observados!==null?
   String(x.postulantes_observados)+' (consulta de la ficha)':'Consultá la ficha para cargar'],
  ['Puntaje del primero',x=>x.puntaje_primero_observado!==null&&x.postulantes_observados>0?
   score(x.puntaje_primero_observado):'Sin dato comparable'],
  ['Diferencia de puntos',x=>x.diferencia_puntaje_comparable!==null?
   (x.diferencia_puntaje_comparable>0?'+':'')+score(x.diferencia_puntaje_comparable)+
   ' (mismo listado indicado)':'No comparable'],
  ['Listado PID',x=>value(x.pid_listado)]
 ];
 if(items.some(x=>x.distancia_km!==null))
  data.push(['Distancia desde referencia',x=>x.distancia_km===null?
   'No verificada':x.distancia_km+' km en línea recta']);
 const privateProfile=state.privatePlannerAllowed?loadPrivatePlanner():null;
 if(privateProfile?.jobs.length){
  data.push(['Cruce con mi jornada actual',x=>{
   const o=checkScheduleOverlap(x.horario,privateProfile);
   return o.status==='overlap'?
    'Superposición de horarios: '+o.conflicts.map(c=>
     c.school+' ('+c.days.join(', ')+', '+c.from+' a '+c.to+')').join('; '):
    o.status==='tight-transition'?
    'Sin cruce, pero traslado a revisar: '+o.transitions.map(t=>
     t.school+' ('+t.days.join(', ')+', '+t.gapMinutes+' min entre horarios)').join('; ')+
     '. Margen elegido: '+o.travelGapMinutes+
     ' min. No es un tiempo de viaje calculado ni una incompatibilidad legal.':
    o.status==='no-overlap'?
    'Sin superposición exacta (viaje real y normativa no evaluados)':
    'No evaluable: horario de oferta o jornadas incompletas';
  }]);
 }
 // The most useful fields stay visible even when they match.
 const priority=new Set(['Escuela','Cierra','Tiempo hasta el cierre','Días y horarios',
  'Módulos','Vigencia desde','Vigencia hasta','PID según ficha','Tu puntaje PID',
  'Postulantes visibles','Puntaje del primero','Diferencia de puntos',
  'Cruce con mi jornada actual']);
 const differences=[],unverified=[];
 let matching=0;
 for(const [label,fieldValue] of data){
  const raw=items.map(item=>String(fieldValue(item)));
  const assessment=assessComparatorCriterion(label,raw);
  const differs=assessment.status==='different';
  if(differs)differences.push(label);
  else if(assessment.status==='same')matching++;
  else unverified.push(label);
  const row=node('tr',differs?'apd-comparator-diff':
   assessment.status==='unverified'?'apd-comparator-priority apd-comparator-incomplete':
   priority.has(label)?'apd-comparator-priority':'apd-comparator-same');
  row.dataset.comparisonStatus=assessment.status;
  const labelCell=node('th','',label);labelCell.scope='row';
  row.appendChild(labelCell);
  assessment.values.forEach(v=>row.appendChild(node('td','',v)));
  tbody.appendChild(row);
 }
 const summary=node('p','apd-comparator-difference-summary',
  (differences.length?'Diferencias detectadas: '+differences.join(' · '):
   'No se detectaron diferencias en los datos comparables.')+
  (unverified.length?' Datos incompletos o no comparables: '+unverified.join(' · ')+'.':''));
 region.appendChild(summary);
 const toolbar=node('div','apd-comparator-view-tools');
 const toggle=button('Mostrar todos los datos',()=>{
  const expanded=table.classList.toggle('apd-comparator-show-all');
  toggle.textContent=expanded?'Ocultar datos iguales':'Mostrar todos los datos';
 },'apd-comparator-expand');
 toolbar.appendChild(toggle);
 toolbar.appendChild(node('span','apd-comparator-hint',
  matching+' criterios coinciden; '+
  (unverified.length?unverified.length+' sin datos suficientes; ':'')+
  'se destacan los relevantes.'));
 region.appendChild(toolbar);
 table.classList.add('apd-comparator-focus');
 table.appendChild(tbody);wrap.appendChild(table);region.appendChild(wrap);
 return region;
}
function render(){
 if(!root)return;
 closeComparisonDialog();
 root.replaceChildren();
 root.hidden=!state.enabled||!state.available.length;
 if(root.hidden)return;
 const head=node('div','apd-comparator-head');
 const heading=node('h3','', 'Comparar ofertas');
 heading.tabIndex=-1;
 const count=node('span','apd-comparator-count',countLabel(state.selected.size));
 head.append(heading,count);
 root.appendChild(head);
 const hint=node('p','apd-comparator-hint',
  'Elegí ofertas del carrusel. Solo se comparan datos visibles de tu sesión; no se guardan selecciones ni se calculan chances de adjudicación.');
 root.appendChild(hint);
 if(state.privatePlannerAllowed)
  root.appendChild(createPrivatePlannerForm({onChanged:render}));
 else root.appendChild(node('p','apd-comparator-insigne-locked',
  'Comparación con domicilio y jornadas actuales: exclusiva del Plan Insigne. '+
  'Revisá Mi plan si querés acceder a esta función.'));
 if(state.selected.size){
  const selected=selectedOffers();
  const codes=selectedSchoolKeys();
  const verifiedCount=Object.keys(state.geoByKey).length;
  const tools=node('div','apd-comparator-tools');
  const sortOptions=[['cierre','Próximo cierre'],['preferencias','Distrito y turno']];
  if(verifiedCount>=2)sortOptions.push(['distancia','Distancia desde escuela elegida']);
  tools.appendChild(makeSelect('Ordenar por',sortOptions,state.sort,
    value=>{state.sort=value;render()}));
  const districts=[...new Set(selected.map(x=>String(x.distrito||'').trim()).filter(Boolean))].sort();
  tools.appendChild(makeSelect('Distrito preferido',[
   ['','Sin preferencia'],...districts.map(d=>[d,d])
  ],districts.includes(state.district)?state.district:'',
  value=>{state.district=value;render()}));
  const turns=[...new Set(selected.map(x=>String(x.turno||'').trim()).filter(Boolean))].sort();
  tools.appendChild(makeSelect('Turno preferido',[
   ['','Sin preferencia'],...turns.map(t=>[t,t])
  ],turns.includes(state.turn)?state.turn:'',
  value=>{state.turn=value;render()}));
  if(verifiedCount>=2){
   tools.appendChild(makeSelect('Escuela de referencia',codes
     .filter(key=>!!state.geoByKey[key])
     .map(key=>[key,(state.geoByKey[key].nombre||key)+' · '+key]),state.anchor,
     value=>{state.anchor=value;render()}));
  }
  root.appendChild(tools);
  if(codes.length>=2){
   const geoButton=button(state.geoWorking?'Consultando ABC...':
     state.geoRequested?'Actualizar ubicaciones oficiales':'Consultar distancias oficiales',
     ()=>{void verifySchoolDistances()},'btn btn-secondary apd-comparator-geobutton');
   geoButton.disabled=state.geoWorking;
   root.appendChild(geoButton);
  }
  if(state.geoStatus){
   const hint=node('p','apd-comparator-geo-status',state.geoStatus);
   hint.setAttribute('role','status');root.appendChild(hint);
  }
  root.appendChild(button('Limpiar selección',()=>{
    state.selected.clear();invalidateGeo();syncCurrentButton();render()
  },'apd-comparator-clear'));
  const origin=state.geoByKey[state.anchor]||null;
  const result=compareOffers({
   offers:selected,sortBy:state.sort,
   preferredDistricts:state.district?[state.district]:[],
   preferredTurns:state.turn?[state.turn]:[],
   referenceLocation:origin,verifiedGeoByKey:state.geoByKey,applicantSummaries:readApplicantSummaries(selected)
  });
  const excludedReasons=result.excluded.map(x=>({
   official_status_closed:'estado oficial cerrado o anulado',
   confirmed_deadline_passed:'plazo de cierre vencido',
   duplicate_key:'identificador duplicado',
   missing_or_invalid_key:'identificador ausente o inválido'
  }[x.reason]||'información no comparable')).join('; ');
  if(selected.length>=2){
   const comparison=renderSideBySide(result.items);
   if(comparison)root.appendChild(comparison);
   else {
    const notice=node('p','apd-comparator-unavailable',
     'No se puede mostrar una comparación lado a lado: solo '+result.items.length+
     ' de '+selected.length+' ofertas seleccionadas son comparables. '+
     (excludedReasons?'Motivos: '+excludedReasons+'. ':'')+
     'Verificá la vigencia en ABC o elegí otras ofertas.');
    notice.tabIndex=-1;
    notice.setAttribute('role','status');
    root.appendChild(notice);
   }
  }else{
   root.appendChild(node('p','apd-comparator-empty',
    'Seleccionaste una oferta. Marcá otra y vas a ver una tabla con sus diferencias.'));
  }
  const list=node('ol','apd-comparator-results');
  for(const row of result.items){
   const entry=node('li','apd-comparator-item');
   const heading=node('strong','',[
    row.cargo||'Cargo sin descripción',
    row.distrito||'Distrito no informado'
   ].join(' · '));
   entry.appendChild(heading);
   const meta=node('p','',[
    row.escuela||'Escuela sin clave',
    row.turno||'Turno sin confirmar',
    row.horas_hasta_cierre!==null?
     'Cierra en '+row.horas_hasta_cierre+' h':'Cierre por verificar'
   ].join(' · '));
   entry.appendChild(meta);
   if(state.geoRequested){
    const verified=state.geoByKey[row.escuela.toUpperCase()];
    const distance=state.anchor && verified && origin ?
      row.distancia_km : null;
    const geographic=distance===null?
     'Ubicación sin verificar o escuela sin clave válida':
     'A '+distance+' km en línea recta de '+state.anchor;
    entry.appendChild(node('p','apd-comparator-distance',geographic));
    if(verified){
     entry.appendChild(node('p','apd-comparator-geo-detail',
      [verified.domicilio,verified.cue?'CUE '+verified.cue:'']
       .filter(Boolean).join(' · ')));
     const home=state.privatePlannerAllowed?loadPrivatePlanner().domicile:'';
     if(home&&Number.isFinite(verified.lat)&&Number.isFinite(verified.lon)){
      entry.appendChild(button('Ver trayecto desde domicilio en Maps',()=>{
       const url='https://www.google.com/maps/dir/?'+new URLSearchParams({
        api:'1',origin:home,destination:verified.lat+','+verified.lon
       });
       window.open(url,'_blank','noopener,noreferrer');
      },'btn btn-secondary apd-comparator-home-map'));
     }
    }
   }
   const explanation=node('p','apd-comparator-reasons',row.explicacion.join(' · '));
   entry.appendChild(explanation);
   // This link only appears after the verified-key map implementation (#255)
   // is present. A comparator-only release must not open the old generic map.
   if(window.APD_offerSchoolMapReady===true && codePattern.test(row.escuela.toUpperCase())){
    // Official school-key map integration is maintained separately in PR #255.
    const link=node('a','apd-comparator-map-link','Ver escuela en mapa');
    const params=new URLSearchParams({clave:row.escuela.toUpperCase(),distrito:row.distrito});
    link.href='./mapa-escuelas-pba.html?'+params.toString();
    link.target='_blank';link.rel='noopener noreferrer';
    entry.appendChild(link);
   }
   entry.appendChild(button('Quitar',()=>{
    state.selected.delete(row.source_offer_key);invalidateGeo();
    syncCurrentButton();render();
   },'apd-comparator-remove'));
   list.appendChild(entry);
  }
  root.appendChild(list);
  if(verifiedCount>=2){
   const pairs=pairSchoolDistances(state.geoByKey,codes);
   if(pairs.length){
    const section=node('section','apd-comparator-pairs');
    section.appendChild(node('h4','','Distancias entre escuelas verificadas'));
    const pairing=node('ul','');
    for(const pair of pairs)pairing.appendChild(node('li','',
     pair.escuela_a+' ↔ '+pair.escuela_b+
     ': '+pair.km_linea_recta+' km en línea recta'));
    section.appendChild(pairing);root.appendChild(section);
   }
  }
  if(result.excluded.length){
   root.appendChild(node('p','apd-comparator-warning',
    result.excluded.length+' oferta(s) excluida(s) de la comparación: '+
    excludedReasons+'. Confirmá estado y cierre en ABC.'));
  }
 }else{
  root.appendChild(node('p','apd-comparator-empty',
   'Tocá «Comparar esta oferta» en al menos dos ofertas para verlas juntas.'));
 }
 const status=node('div','apd-comparator-status');
 status.id='apd-comparator-status';status.setAttribute('role','status');
 root.appendChild(status);
 root.appendChild(node('p','apd-comparator-disclaimer',
  'Orientativo. Las distancias son en línea recta entre escuelas verificadas por ABC; no son tiempo de viaje. Verificá condiciones y postulación en ABC. No se usa la ubicación del celular.'));
}
function refresh({offers=[],index=0,enabled=false,planInfo=null}={}) {
 const entitled=hasInsignePlannerAccess(planInfo);
 // A downgrade, expiration or unverified subscription wipes previous personal
 // information from this browser tab before any new DOM can read it.
 if(!entitled)clearPrivatePlanner();
 state.privatePlannerAllowed=entitled;
 state.enabled=enabled===true;
 if(!state.enabled){
  reset();return;
 }
 const unique=new Map();
 for(const item of Array.isArray(offers)?offers:[]){
  const key=offerKey(item);
  if(key&&!unique.has(key))unique.set(key,item);
 }
 state.available=[...unique.values()];
 state.index=Number.isInteger(index)&&index>=0&&index<offers.length?index:0;
 state.current=Array.isArray(offers)?offers[state.index]:null;
 // The current card may have an invalid key: preserve its physical index only
 // when identity keys were not removed. Otherwise find its matching source key.
 const current=offers?.[index];
 const currentKey=offerKey(current);
 const matched=state.available.findIndex(x=>offerKey(x)===currentKey);
 if(matched>=0)state.index=matched;
 const valid=new Set(state.available.map(offerKey));
 let removed=false;
 for(const key of state.selected){
  if(!valid.has(key)){state.selected.delete(key);removed=true;}
 }
 if(removed)invalidateGeo();
 if(state.geoRequested&&
   JSON.stringify(selectedSchoolKeys())!==state.geoSignature)invalidateGeo();
 syncCurrentButton();
 watchVisibleApplicants();
 render();
}
function reset() {
 // Auth/session ownership changes must not expose a former account's local
 // home address or work timetable to the next account in the same tab.
 clearPrivatePlanner();
 applicantObserver?.disconnect();
 observedApplicants.clear();
 closeComparisonDialog();
 invalidateGeo();
 state.enabled=false;state.privatePlannerAllowed=false;
 state.available=[];state.current=null;state.selected.clear();
 state.sort='cierre';state.district='';state.turn='';
 document.querySelectorAll('#apd-comparar-oferta,#apd-ver-comparacion')
  .forEach(control=>control.remove());
 if(root){root.hidden=true;root.replaceChildren();}
}
document.getElementById('btn-logout')?.addEventListener('click',clearPrivatePlanner,true);
window.APD_comparatorRefresh=refresh;
window.APD_comparatorReset=reset;
// Core app may have rendered before module import was completed.
if(root){root.hidden=true;}
