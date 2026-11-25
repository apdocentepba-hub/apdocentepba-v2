/* APDocentePBA — comparador opt-in; isolated browser-only UI.
 * No credentials, user data storage, outbound fetches or mutations.
 */
import {compareOffers} from './scripts/apd-comparador-criterios.mjs?v=20261109-decision1';
import {assessOfferDecisionSignals} from './scripts/apd-offer-decision-signals.mjs?v=20261114-signals1';
import {assessComparatorCriterion} from './scripts/apd-comparador-datos-evaluacion.mjs?v=20261112-dothour1';
import {checkScheduleOverlap,compareSelectedOfferSchedules} from './scripts/apd-mi-jornada-comparador.mjs?v=20261124-modulos';
import {simulateWeek,intervalText} from './scripts/apd-week-simulator.mjs?v=20261124-simulator1';
import {createOfferEconomics} from './scripts/apd-offer-economics-ui.mjs?v=20261124-calendar1';
import {marginalPay} from './scripts/apd-career-profile-core.mjs?v=20261124-career1';
import {createFavoriteOffers} from './scripts/apd-favorite-offers.mjs?v=20261124-favorites1';
import {createWeekOptimizerSection} from './scripts/apd-week-optimizer-ui.mjs?v=20261124-optimizer1';
import {createApplicationDiarySection} from './scripts/apd-application-diary-ui.mjs?v=20261124-diary2';
import {recommendOffers} from './scripts/apd-offer-recommendations.mjs?v=20261124-recommend1';
import {mountPersonalHistory} from './scripts/apd-personal-history-ui.mjs?v=20261124-vacancy1';
import {straightLineHomeSchoolKm} from './scripts/apd-home-georef.mjs?v=20261110-home4';
import {hasInsignePlannerAccess} from './scripts/apd-insigne-planner-entitlement.mjs';
import {createMobilitySection} from './scripts/apd-mobility-ui.mjs?v=20261113-auto1';
import {createPrivatePlannerForm,loadPrivatePlanner,clearPrivatePlanner,createWeeklyScheduleForm} from './scripts/apd-mi-jornada-ui.mjs?v=20261124-schedulefix1';
import {
 fetchSelectedSchools,pairSchoolDistances,verifiedSchoolKey,workToOfferSchoolDistances
} from './scripts/apd-school-geodistance.mjs?v=20261111-workgeo1';

const state={
 available:[],selected:new Set(),index:0,current:null,enabled:false,
 privatePlannerAllowed:false,
 sort:'cierre',district:'',turn:'',
 geoByKey:Object.create(null),geoRequested:false,geoWorking:false,
 geoStatus:'',geoRunId:0,geoAbort:null,geoSignature:'',anchor:'',
 autoGeoSignature:''
};
const root=document.getElementById('apd-comparador-panel');
const max=5;
let disposePersonalHistory=null;
let profileScheduleClient=null,profileScheduleRequired=true;
function clearPersonalHistory(){disposePersonalHistory?.();disposePersonalHistory=null;}
const favorites=createFavoriteOffers();
const emptyDiary=(client=null)=>({client,record:{entries:[],revision:0},titles:new Map(),open:false,loaded:false,busy:false,message:''});
function resetDiary(client=null){applicationDiary.client?.reset();applicationDiary=emptyDiary(client);}
let applicationDiary=emptyDiary();
let favoriteVisible=new Set(),favoritesOpen=false,favoriteMessage='';
let permanentFavorites=false,accountFavorites=null,favoriteEpoch=0,favoriteBusy=false;
function clearAccountFavorites(){
 accountFavorites?.reset();accountFavorites=null;permanentFavorites=false;favoriteEpoch++;favoriteBusy=false;
}
function favoriteRecord(){return permanentFavorites?accountFavorites?.peek()??null:null;}
function favoriteHas(key){return permanentFavorites?!!favoriteRecord()?.keys.includes(key):favorites.has(key);}
async function favoriteOperation(action,key){
 const client=accountFavorites,epoch=favoriteEpoch;
 if(!state.enabled||!state.privatePlannerAllowed||!client||favoriteBusy)return;
 favoriteBusy=true;favoriteMessage='';favoritesOpen=true;syncCurrentButton();render();
 try{
  if(action==='reload')await client.reload();
  else await client.mutate(action,key);
  if(epoch===favoriteEpoch&&client===accountFavorites)favoriteMessage=action==='reload'?'Favoritos de tu cuenta cargados.':'Favoritos de tu cuenta actualizados.';
 }catch(error){if(epoch===favoriteEpoch&&client===accountFavorites)favoriteMessage=String(error?.message||'No se pudo confirmar la operación');}
 finally{if(epoch===favoriteEpoch&&client===accountFavorites){favoriteBusy=false;syncCurrentButton();render();}}
}
let recommendOpen=false,recommendDistrict='',recommendTurn='',recommendSort='cierre',recommendGroup='',recommendLimit=10;
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
 const headerActions=node('div','apd-comparator-modal-actions');
 if(state.privatePlannerAllowed&&selectedSchoolKeys().length&&!state.geoRequested){
  headerActions.appendChild(button('Consultar ABC',()=>{
   // Explicit click only. Keep control visible while the table scrolls.
   void verifySchoolDistances().then(()=>{
    if(state.enabled&&state.privatePlannerAllowed&&state.selected.size>=2&&
       state.geoRequested&&!state.geoWorking&&
       state.geoSignature===schoolGeoSignature())focusComparison();
   });
  },'btn btn-secondary apd-comparator-dialog-geobutton'));
 }
 const close=button('Cerrar comparación',closeComparisonDialog,
  'apd-comparator-modal-close');
 close.id='apd-comparison-close';
 headerActions.appendChild(close);
 header.appendChild(headerActions);
 dialog.appendChild(header);
 const body=node('div','apd-comparator-modal-body');
 if(state.privatePlannerAllowed)body.appendChild(
  createPrivatePlannerForm({onChanged:()=>{refreshAlertSchedule(); refreshProfileSchedule();render();focusComparison()}})
 );
 else body.appendChild(node('p','apd-comparator-insigne-locked',
  'Domicilio y compatibilidad de jornadas: exclusivo del Plan Insigne vigente. '+
  'La comparación básica de ofertas sigue disponible.'));
 if(state.privatePlannerAllowed&&selectedSchoolKeys().length&&!state.geoRequested){
  body.appendChild(node('p','apd-comparator-hint',
   hasSavedVerifiedHome()?
    'Insigne consulta automáticamente en ABC la ubicación oficial de estas escuelas.':
    'Todavía no consultaste la ubicación oficial de estas escuelas en ABC. '+
    'Usá «Consultar ABC» en la cabecera de esta ventana.'));
 }else if(state.privatePlannerAllowed&&state.geoWorking){
  body.appendChild(node('p','apd-comparator-hint','Consultando ubicaciones en ABC...'));
 }
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
  // Route links and OSM stop searches become visible only after the user has
  // explicitly verified school coordinates via ABC and Insigne is active.
  if(state.privatePlannerAllowed&&state.geoRequested&&!state.geoWorking){
   const currentHome=loadPrivatePlanner().homeLocation;
   body.appendChild(createMobilitySection({
    home:currentHome,offers:result.items,verifiedBySchool:state.geoByKey
   }));
  }
  if(!comparison){
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
 actions.querySelectorAll('#apd-comparar-oferta,#apd-ver-comparacion,#apd-simular-oferta,#apd-favorite-oferta')
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
 if(state.privatePlannerAllowed&&key){
  const simulator=button('Simular esta oferta',()=>openWeekSimulator(key));
  simulator.id='apd-simular-oferta';actions.appendChild(simulator);
  const favorite=button(favoriteHas(key)?'Quitar favorito':permanentFavorites&&!favoriteRecord()?'Cargar mis favoritos':'Guardar favorito',()=>{
   if(!state.enabled||!state.privatePlannerAllowed||offerKey(state.current)!==key)return;
   if(permanentFavorites){void favoriteOperation(!favoriteRecord()?'reload':favoriteHas(key)?'remove':'add',key);return;}
   try{if(favorites.has(key))favorites.remove(key);else favorites.add(state.current,key);favoriteVisible=favorites.refresh(state.available,offerKey);favoriteMessage='';}
   catch(error){favoriteMessage=error.message;}
   favoritesOpen=true;syncCurrentButton();render();
  });favorite.id='apd-favorite-oferta';favorite.setAttribute('aria-pressed',String(favoriteHas(key)));favorite.disabled=permanentFavorites&&(!accountFavorites||favoriteBusy);actions.appendChild(favorite);
 }
 // The compare dialog requires at least two offers. Never show a dead CTA for one.
 if(state.selected.size>=2){
  const view=button('Ver comparación ('+state.selected.size+')',focusComparison,
   'btn btn-secondary apd-compare-view');
  view.id='apd-ver-comparacion';
  view.setAttribute('aria-controls','apd-comparador-panel');
  actions.appendChild(view);
 }
}
function createSalaryComparison(){
 const box=node('details','apd-salary-compare');box.open=true;
 box.append(node('summary','apd-work-summary','Impacto en mi sueldo'));
 const info=node('p','apd-comparator-hint','Compará dos liquidaciones del mismo período. Los importes se ingresan manualmente; no se guardan ni se envían.');
 box.appendChild(info);
 const form=node('form','apd-salary-compare-form');
 const sourceField=node('label','apd-work-field');sourceField.append(node('span','','Método de cálculo'));
 const source=node('select','apd-work-input');source.name='salarySource';
 for(const [value,label] of [['FEB','FEB'],['SUTEBA','SUTEBA'],['RECIBO_MANUAL','Estimación manual']]){const option=node('option','',label);option.value=value;source.append(option);}
 sourceField.append(source);form.append(sourceField);
 const periodField=node('label','apd-work-field');periodField.append(node('span','','Período de ambas liquidaciones'));
 const period=node('input','apd-work-input');period.name='salaryPeriod';period.type='month';period.required=true;periodField.append(period);form.append(periodField);
 const inputs=[];
 for(const label of ['Bolsillo actual ($)','Bolsillo con la nueva oferta ($)']){
  const field=node('label','apd-work-field');field.append(node('span','',label));
  const input=node('input','apd-work-input');input.type='number';input.min='0';input.max='100000000';input.step='0.01';input.required=true;
  field.append(input);form.append(field);inputs.push(input);
 }
 const output=node('div','apd-week-metrics');output.setAttribute('role','status');
 const calculate=button('Comparar haberes',()=>{},'btn btn-primary');calculate.type='submit';form.append(calculate,output);
 const fmt=v=>v.toLocaleString('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2});
 form.addEventListener('input',()=>output.replaceChildren());
 form.addEventListener('submit',e=>{
  e.preventDefault();output.replaceChildren();
  if(!form.reportValidity()||inputs.some(i=>!i.value.trim()))return;
  const [before,after]=inputs.map(i=>Number(i.value));
  if(![before,after].every(v=>Number.isFinite(v)&&v>=0&&v<=100000000))return;
  let result;
  try{result=marginalPay({source:source.value,period:period.value,netCentavos:Math.round(before*100)},{source:source.value,period:period.value,netCentavos:Math.round(after*100)});}catch(error){output.append(node('p','',error.message));return;}
  const delta=result.deltaCentavos/100;
  for(const [label,value] of [['Actual',before],['Con la oferta',after],['Diferencia mensual',delta]]){
   const metric=node('div','apd-week-metric');metric.append(node('span','',label),node('strong','',fmt(value)));output.append(metric);
  }
 });
 const refs=node('div','apd-week-legend');
 for(const [title,url] of [['FEB','https://calculadora.feb.org.ar/'],['SUTEBA','https://haberes.suteba.org.ar/app/']]){
  const a=node('a','apd-comparator-map-link',title+' · consultar haberes');a.href=url;a.target='_blank';a.rel='noopener noreferrer';refs.append(a);
 }
 box.append(form,refs);return box;
}

function openWeekSimulator(key){
 if(!state.enabled||!state.privatePlannerAllowed||!key)return;
 const source=state.available.find(x=>offerKey(x)===key);
 if(!source)return;
 const result=compareOffers({offers:[{...source,source_offer_key:key}]});
 const offer=result.items[0];
 closeComparisonDialog();
 const dialog=node('dialog','apd-comparator-dialog apd-week-simulator');
 dialog.id='apd-comparison-dialog';dialog.setAttribute('aria-label','Simulador de incorporación de cargo');
 const head=node('div','apd-comparator-modal-head');
 head.append(node('h2','','Simular esta oferta'),button('Cerrar simulación',closeComparisonDialog,'apd-comparator-modal-close'));
 dialog.appendChild(head);
 const body=node('div','apd-comparator-modal-body');
 if(!offer){
  body.appendChild(node('p','apd-comparator-hint','La oferta está cerrada o ya no se puede comparar. Verificá ABC.'));
 }else{
  body.appendChild(node('strong','',titleFor(source)));
  const sim=simulateWeek(offer.horario,loadPrivatePlanner());
  const labels={'no-overlap':'Sin cruces detectados','overlap':'Hay cruces de horario','tight-transition':'Traslado a revisar','unverified':'Faltan datos para confirmar'};
  const verdict=node('div','apd-week-verdict apd-week-verdict-'+sim.status);
  verdict.append(node('strong','',labels[sim.status]||'Revisar horario'),node('span','',sim.reason));
  body.appendChild(verdict);
  if(sim.totals){
   const hours=m=>m===null?'—':Math.floor(m/60)+' h '+(m%60?String(m%60).padStart(2,'0')+' min':'');
   const metrics=node('div','apd-week-metrics');
   const occupied=sim.days.reduce((n,d)=>n+d.afternoon.length,0);
   for(const [label,value] of [['Horas actuales',sim.totals.currentMinutes===null?(!sim.declared?'No declarada':occupied+' mód. tarde*'):hours(sim.totals.currentMinutes)],['Nueva oferta',hours(sim.totals.offerMinutes)],['Semana resultante',hours(sim.totals.combinedMinutes)],['Cruce conocido',hours(sim.totals.overlapMinutes)]]){
    const metric=node('div','apd-week-metric');metric.append(node('span','',label),node('strong','',value));metrics.appendChild(metric);
   }
   body.appendChild(metrics);
   const legend=node('div','apd-week-legend');
   for(const [kind,label] of [['current','Mi jornada'],['offer','Oferta nueva'],['overlap','Cruce'],['unknown','Módulo sin hora reloj']])legend.append(node('span','apd-week-key apd-week-key-'+kind,label));
   body.appendChild(legend);
   const days=node('div','apd-week-days apd-week-visual-days');
   const all=sim.days.flatMap(day=>[...day.current,...day.offer]);
   const lo=Math.min(420,...all.map(v=>v[0])),hi=Math.max(1200,...all.map(v=>v[1]));
   for(const day of sim.days){
    const section=node('section','apd-week-day apd-week-visual-day');
    section.appendChild(node('h3','',day.name));
    const ruler=node('div','apd-week-ruler');ruler.append(node('span','',intervalText([[lo,hi]])));
    section.appendChild(ruler);
    for(const [kind,intervals] of [['current',day.current],['offer',day.offer],['overlap',day.overlaps]]){
     const row=node('div','apd-week-bar-row');
     const track=node('div','apd-week-track');
     track.setAttribute('role','img');track.setAttribute('aria-label',({current:'Mi jornada',offer:'Oferta nueva',overlap:'Cruces'})[kind]+': '+intervalText(intervals));
     for(const [a,b] of intervals){
      const segment=node('span','apd-week-segment apd-week-segment-'+kind);
      segment.style.left=((a-lo)/(hi-lo)*100)+'%';segment.style.width=((b-a)/(hi-lo)*100)+'%';
      segment.title=intervalText([[a,b]]);track.appendChild(segment);
     }
     row.append(track,node('span','apd-week-clock',intervalText(intervals)));section.appendChild(row);
    }
    if(day.afternoon.length){
     const pending=node('div','apd-week-unknown');
     for(const module of day.afternoon)pending.append(node('span','apd-week-module-chip',module));
     section.appendChild(pending);
    }
    days.appendChild(section);
   }
   body.appendChild(days);
   if(occupied)body.appendChild(node('p','apd-comparator-hint','* Tarde: '+occupied+' módulos marcados, sin hora reloj confirmada. No se suman a horas exactas.'));
  }
  const details=node('details','apd-week-explanation');
  details.append(node('summary','','Cómo se interpreta'),node('p','apd-comparator-hint','Simulación informativa; no modifica tu carga horaria ni realiza postulaciones. No acredita compatibilidad normativa o traslados.'));
  if(!sim.declared)details.append(node('p','','Todavía no declaraste tu jornada.'));
  if(sim.referenceMorning)details.append(node('p','','Mañana: módulos de 60 minutos desde 07:20 como referencia. Confirmá el horario de cada escuela.'));
  body.appendChild(details);
  body.appendChild(createSalaryComparison());
  body.appendChild(createOfferEconomics({schedule:offer.horario}));
 }
 dialog.appendChild(body);document.body.appendChild(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.showModal();
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
function currentWorkSchoolKeys(){
 if(!state.privatePlannerAllowed)return [];
 return [...new Set((loadPrivatePlanner().jobs||[])
  .map(job=>verifiedSchoolKey(job.schoolKey)).filter(Boolean))];
}
function schoolGeoSignature(){
 return JSON.stringify({selected:selectedSchoolKeys(),current:currentWorkSchoolKeys()});
}
// ABC receives only public school keys, never the saved home coordinates.
function hasSavedVerifiedHome(){
 if(!window.APD_accountHome?.ready?.())return false;
 const home=loadPrivatePlanner().homeLocation;
 return home?.source==='GEOREF_AR_V2'&&
  (home.reviewed===true||home.scope==='exacta');
}
function maybeAutoVerifySchools(){
 if(!state.enabled||!state.privatePlannerAllowed||!state.selected.size||
    state.geoWorking||state.geoRequested||!hasSavedVerifiedHome()||
    !selectedSchoolKeys().length)return;
 const signature=schoolGeoSignature();
 if(signature===state.autoGeoSignature)return;
 state.autoGeoSignature=signature;
 queueMicrotask(()=>{
  if(state.enabled&&state.privatePlannerAllowed&&
     state.autoGeoSignature===signature&&!state.geoWorking&&!state.geoRequested&&
     schoolGeoSignature()===signature&&hasSavedVerifiedHome()){
   void verifySchoolDistances({automatic:true});
  }
 });
}
function invalidateGeo(){
 state.geoRunId++;
 state.geoAbort?.abort();
 state.geoAbort=null;state.geoWorking=false;state.geoRequested=false;
 state.geoStatus='';state.geoByKey=Object.create(null);state.anchor='';
 state.geoSignature='';state.autoGeoSignature='';
 if(state.sort==='distancia')state.sort='cierre';
}
async function verifySchoolDistances({automatic=false}={}){
 if(!state.enabled||state.geoWorking)return;
 const codes=selectedSchoolKeys();
 const workCodes=currentWorkSchoolKeys();
 if(codes.length<1){
  state.geoStatus='Seleccioná una escuela con clave provincial válida.';
  render();return;
 }
 const reopenAutomaticModal=automatic&&
  !!document.getElementById('apd-comparison-dialog');
 invalidateGeo();
 // Do not repeat an automatic request after partial/failed ABC responses.
 // The manual official retry button remains available.
 state.autoGeoSignature=schoolGeoSignature();
 const run=state.geoRunId;
 const controller=new AbortController();
 state.geoAbort=controller;
 state.geoRequested=true;state.geoWorking=true;
 state.geoStatus='Consultando el Mapa Escolar ABC...';
 state.geoSignature=schoolGeoSignature();
 render();
 if(reopenAutomaticModal&&state.enabled&&state.selected.size>=2)
  focusComparison();
 try{
  // Explicit click only; at most 5 offers + 5 current jobs.
  // Deduplicate keys and respect the WFS resolver cap of 5 per batch.
  const all=[...new Set([...codes,...workCodes])];
  const groups=[all.slice(0,5),all.slice(5,10)].filter(x=>x.length);
  const responses=await Promise.all(groups.map(group=>
   fetchSelectedSchools(group,{signal:controller.signal})));
  if(run!==state.geoRunId||!state.enabled||controller.signal.aborted)return;
  state.geoByKey=Object.assign(Object.create(null),...responses.map(x=>x.verified));
  const count=codes.filter(key=>!!state.geoByKey[key]).length;
  const workCount=workCodes.filter(key=>!!state.geoByKey[key]).length;
  state.anchor=codes.find(key=>state.geoByKey[key])||'';
  state.geoStatus=count+' de '+codes.length+
   ' escuelas de ofertas verificadas en ABC.'+
   (workCodes.length?' '+workCount+' de '+workCodes.length+
    ' escuelas de tus jornadas verificadas.':'');
  if(count>=2)state.sort='distancia';
 }catch(_){
  if(run===state.geoRunId)state.geoStatus='No se pudieron verificar las escuelas.';
 }finally{
  if(run===state.geoRunId){
   const modalStillOpen=automatic&&
    !!document.getElementById('apd-comparison-dialog');
   state.geoWorking=false;state.geoAbort=null;render();
   if(modalStillOpen&&state.enabled&&state.selected.size>=2)
    focusComparison();
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
  const blocks=pair.matches?.length?pair.matches:[pair];
  const match=blocks.filter(x=>x.days?.length).map(x=>
   x.days.join(', ')+', '+x.from+' a '+x.to+
   (x.status==='possible-overlap'?' (vigencia sin confirmar)':'')
  ).join('; ');
  item.textContent='Ofertas '+pair.firstOffer+' y '+pair.secondOffer+': '+pair.label+
   (match?' · '+match:'');
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
 if(items.some(x=>x.distancia_km!==null)){
  // ABC distance is school-to-school. It is NOT from the saved domicile.
  // Show the exact origin to make a legitimate 0 km self-distance clear.
  const schoolOrigin=state.anchor;
  data.push(['Desde escuela de referencia ('+schoolOrigin+')',x=>
   x.distancia_km===null?'No verificada':
   x.distancia_km===0&&String(x.escuela||'').trim().toUpperCase()===schoolOrigin?
    '0 km (misma escuela)':x.distancia_km+' km en línea recta']);
 }
 const privateProfile=state.privatePlannerAllowed?loadPrivatePlanner():null;
 if(privateProfile?.homeLocation){
  data.push(['Desde mi domicilio',x=>{
   const school=state.geoByKey[String(x.escuela||'').trim().toUpperCase()];
   const km=straightLineHomeSchoolKm(privateProfile.homeLocation,school);
   const origin=privateProfile.homeLocation;
   return !state.geoRequested?
    'Pendiente de consulta: usá «Consultar ABC» arriba para medir la distancia':
    state.geoWorking?'Consultando ubicación oficial de la escuela...':
    km===null?'Ubicación de la escuela no verificada en ABC; revisá su clave o reintentá':
    km+' km en línea recta (no es distancia de viaje)'+
    (origin.scope&&origin.scope!=='exacta'?
     ' · Revisar localidad elegida en el mapa':'');
  }]);
 }
 if(privateProfile?.jobs.some(job=>job.schoolKey)&&state.geoRequested){
  data.push(['Desde mis escuelas actuales',x=>{
   const km=workToOfferSchoolDistances(privateProfile.jobs,x.escuela,state.geoByKey);
   return km.length?km.map(item=>item.school+' ('+item.schoolKey+'): '+
    item.km_linea_recta+' km en línea recta').join('; '):
    'Falta verificar la ubicación ABC de ambas escuelas';
  }]);
 }
 if(privateProfile?.jobs.length||privateProfile?.moduleSchedule?.length){
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
  'Cruce con mi jornada actual','Desde mi domicilio','Desde mis escuelas actuales']);
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
function renderPermanentFavorites(){
 const section=node('details','apd-favorites');section.open=favoritesOpen;
 const record=favoriteRecord();
 section.appendChild(node('summary','apd-work-summary','Mis favoritos de la cuenta'+(record?' ('+record.keys.length+')':'')));
 section.appendChild(node('p','apd-comparator-hint','Se guardan en tu cuenta. El estado de una oferta ausente del carrusel no está verificado. Los avisos automáticos aún no están habilitados.'));
 const reload=button('Cargar / actualizar favoritos',()=>{if(section.isConnected)void favoriteOperation('reload');});
 reload.disabled=!accountFavorites||favoriteBusy;section.appendChild(reload);
 const status=node('p','apd-favorite-status',favoriteBusy?'Consultando tu cuenta…':favoriteMessage||(!accountFavorites?'Conexión no disponible':!record?'Cargá tus favoritos para empezar.':record.keys.length?'':'Todavía no guardaste ofertas.'));
 status.setAttribute('role','status');section.appendChild(status);
 const list=node('div','apd-favorites-list');
 for(const key of record?.keys||[]){
  const offer=state.available.find(x=>offerKey(x)===key);
  const row=node('article','apd-favorite-row');
  row.appendChild(node('strong','',offer?[offer.descripcioncargo||offer.cargo||'Oferta',offer.distrito].filter(Boolean).join(' · '):'Oferta '+key));
  row.appendChild(node('p','apd-favorite-status',offer?'Verificá estado y cierre en ABC':'No visible en los filtros actuales · Vigencia sin verificar'));
  const remove=button('Quitar favorito',()=>{if(section.isConnected)void favoriteOperation('remove',key);});
  remove.disabled=favoriteBusy;row.appendChild(remove);list.appendChild(row);
 }
 section.appendChild(list);section.addEventListener('toggle',()=>{if(section.isConnected)favoritesOpen=section.open;});
 return section;
}
function renderFavorites(){
 if(permanentFavorites)return renderPermanentFavorites();
 const section=node('details','apd-favorites');
 section.open=favoritesOpen;
 const summary=node('summary','apd-work-summary','Mis favoritos de esta sesión ('+favorites.count()+')');
 section.appendChild(summary);
 section.appendChild(node('p','apd-comparator-hint','Guardados solo mientras esté abierta esta sesión de la página. No se sincronizan ni envían avisos. La ausencia de una oferta del carrusel no demuestra que esté cerrada.'));
 if(favoriteMessage){const status=node('p','',favoriteMessage);status.setAttribute('role','status');section.appendChild(status);}
 const list=node('div','apd-favorites-list');section.appendChild(list);
 const draw=()=>{
  list.replaceChildren();
  const items=favorites.list(favoriteVisible);
  if(!items.length)list.appendChild(node('p','apd-comparator-hint','Todavía no guardaste ofertas.'));
  for(const item of items){
   const row=node('article','apd-favorite-row');
   row.appendChild(node('strong','',[item.cargo||'Cargo sin descripción',item.distrito].filter(Boolean).join(' · ')));
   row.appendChild(node('p','apd-comparator-hint',[item.escuela,item.turno].filter(Boolean).join(' · ')));
   row.appendChild(node('p','apd-favorite-status',item.label+(item.visible?'':' · No visible en los filtros actuales')));
   if(item.deadline!==null)row.appendChild(node('p','apd-comparator-hint',new Date(item.deadline).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})));
   row.appendChild(button('Quitar favorito',()=>{
    if(!state.enabled||!state.privatePlannerAllowed||!section.isConnected)return;
    favorites.remove(item.source_offer_key);favoriteMessage='';syncCurrentButton();render();
   }));
   list.appendChild(row);
  }
 };
 section.addEventListener('toggle',()=>{if(section.isConnected){favoritesOpen=section.open;if(section.open)draw();}});
 draw();return section;
}

function renderRecommendations(){
 const section=node('details','apd-recommendations');section.open=recommendOpen;
 section.appendChild(node('summary','apd-work-summary','Ofertas recomendadas para vos'));
 section.appendChild(node('p','apd-comparator-hint','Orden orientativo de tus alertas visibles. Primero coincidencias observadas de horario y PID; después datos por revisar; al final cruces detectados. No certifica elegibilidad, traslado, sueldo ni adjudicación.'));
 const tools=node('div','apd-recommendation-tools');
 const options=field=>[...new Set(state.available.map(x=>String(x[field]||'').trim()).filter(Boolean))].sort().map(v=>[v,v]);
 if(recommendDistrict&&!options('distrito').some(([v])=>v===recommendDistrict))recommendDistrict='';
 if(recommendTurn&&!options('turno').some(([v])=>v===recommendTurn))recommendTurn='';
 const list=node('div','apd-recommendation-list');
 const result=node('p','apd-comparator-hint');result.setAttribute('role','status');
 const draw=()=>{
  list.replaceChildren();
  if(!state.enabled||!state.privatePlannerAllowed)return;
  const offers=state.available.map(x=>({...x,source_offer_key:offerKey(x)}));
  const data=recommendOffers({offers,profile:loadPrivatePlanner(),preferredDistricts:recommendDistrict?[recommendDistrict]:[],preferredTurns:recommendTurn?[recommendTurn]:[],sort:recommendSort,verifiedGeoByKey:state.geoByKey,applicantSummaries:readApplicantSummaries(offers)});
  result.textContent=data.counts.observed+' coincidencias observadas · '+data.counts.review+' por revisar · '+data.counts.conflict+' con cruces · '+data.excluded.length+' excluidas';
  const labels={observed:'Coincidencias observadas',review:'Datos por revisar',conflict:'Cruces detectados'};
  const filtered=data.items.filter(x=>!recommendGroup||x.group===recommendGroup);
  for(const item of filtered.slice(0,recommendLimit)){
   const row=node('article','apd-recommendation-row apd-recommendation-'+item.group);
   row.append(node('strong','',[item.cargo,item.distrito].filter(Boolean).join(' · ')),node('p','apd-favorite-status',labels[item.group]));
   const why=node('ul','apd-offer-fit-reasons');for(const reason of item.reasons)why.appendChild(node('li','',reason));row.appendChild(why);
   if(item.horas_hasta_cierre!==null)row.appendChild(node('p','apd-comparator-hint','Cierre informado en '+item.horas_hasta_cierre+' h'));
   if(item.pid_puntaje_panel!==null)row.appendChild(node('p','apd-comparator-hint','Tu puntaje informado: '+item.pid_puntaje_panel+' · '+(item.pid_listado||'Listado sin confirmar')));
   if(item.km!==null)row.appendChild(node('p','apd-comparator-hint',item.km+' km en línea recta desde domicilio verificado; no es distancia de viaje.'));
   row.appendChild(button('Simular oferta',()=>{if(section.isConnected&&state.privatePlannerAllowed)openWeekSimulator(item.source_offer_key);}));
   list.appendChild(row);
  }
  if(!filtered.length)list.appendChild(node('p','apd-comparator-hint','No hay ofertas en este grupo.'));
  if(filtered.length>recommendLimit)list.appendChild(button('Mostrar más ('+(filtered.length-recommendLimit)+' restantes)',()=>{recommendLimit+=10;draw();}));
 };
 for(const [label,opts,current,change] of [
 ['Distrito',[['','Cualquiera'],...options('distrito')],recommendDistrict,v=>{recommendDistrict=v;}],
 ['Turno',[['','Cualquiera'],...options('turno')],recommendTurn,v=>{recommendTurn=v;}],
 ['Orden dentro de cada grupo',[['cierre','Próximo cierre'],['distancia','Distancia conocida en línea recta']],recommendSort,v=>{recommendSort=v;}],
 ['Mostrar',[['','Todas'],['observed','Coincidencias observadas'],['review','Por revisar'],['conflict','Cruces detectados']],recommendGroup,v=>{recommendGroup=v;}]])
  tools.appendChild(makeSelect(label,opts,current,v=>{change(v);recommendLimit=10;draw();}));
 section.append(tools,result,list);
 section.addEventListener('toggle',()=>{if(section.isConnected){recommendOpen=section.open;if(section.open)draw();}});
 if(section.open)draw();return section;
}

function render(){
 if(!root)return;
 // Editing an existing job invalidates previously verified distances.
 if(state.geoRequested&&state.geoSignature!==schoolGeoSignature())invalidateGeo();
 closeComparisonDialog();
 root.replaceChildren();
 const careerHost=document.getElementById('apd-career-tools-host');
 const careerCard=careerHost?.closest('#apd-career-tools-card');
 const careerAllowed=state.enabled&&state.privatePlannerAllowed;
 if(careerHost){careerHost.replaceChildren();careerHost.hidden=!careerAllowed;}
 if(careerCard)careerCard.hidden=!careerAllowed;
 const toolsRoot=careerHost||root;
 root.hidden=!state.enabled||(!state.available.length&&!(state.privatePlannerAllowed&&(permanentFavorites||favorites.count()||applicationDiary.client||applicationDiary.record.entries.length)));
 if(root.hidden&&!careerAllowed)return;
 if(careerAllowed){
  const hub=node('section','apd-career-tools');
  hub.append(node('h3','',careerHost?'Gestión de cargos y postulaciones':'Herramientas para elegir cargos'));
  if(careerHost)hub.append(node('p','apd-comparator-hint','Guardá oportunidades, registrá tus postulaciones y analizá alternativas en un solo lugar. Las postulaciones oficiales se realizan en ABC.'));
  const grid=node('div','apd-career-tools-grid');
  const count=state.available.length;
  for(const [title,detail,target,enabled] of [
   ['Recomendaciones',count?count+' alertas para analizar':'Sin alertas para analizar','.apd-recommendations',count>0],
   ['Optimizar ofertas',count?'Combinar hasta 12':'Esperando nuevas ofertas','.apd-week-optimizer',count>0],
   ['Mis favoritos','Ofertas guardadas en tu cuenta','.apd-favorites',true],
   ['Mis postulaciones',applicationDiary.client?'Registro manual en tu cuenta':'Registro manual de esta sesión','.apd-application-diary',true],
   ['Historial','Oportunidades anteriores','#apd-personal-history',true]
  ]){
   const control=button('',()=>{
    const destination=target.startsWith('#')?document.querySelector(target):toolsRoot.querySelector(target);
    if(!destination||destination.hidden)return;
    if(destination.tagName==='DETAILS')destination.open=true;
    destination.scrollIntoView?.({block:'start'});
    destination.querySelector('summary,button,select')?.focus();
   },'apd-career-tool');
   control.disabled=!enabled;
   control.append(node('strong','',title),node('span','',detail));grid.append(control);
  }
  const session=applicationDiary;
  const diary=createApplicationDiarySection({
   offers:state.available.map(offer=>({key:offerKey(offer),title:[offer.descripcioncargo||offer.cargo||'Oferta',offer.escuela,offer.distrito].filter(Boolean).join(' · ')})),
   session,onChanged:render,
   isCurrent:()=>state.enabled&&state.privatePlannerAllowed&&session===applicationDiary
  });
  hub.append(grid);toolsRoot.append(hub,renderFavorites(),diary);
  if(careerHost&&!root.hidden){
   const nav=node('div','apd-career-nav');
   nav.append(node('p','apd-comparator-hint','Favoritos, postulaciones, recomendaciones e historial ahora están juntos en Herramientas.'));
   nav.append(button('Ir a Herramientas · Gestión de cargos',()=>{
    window.APD_activatePanelTab?.('repo',true);
    careerHost.scrollIntoView?.({block:'start'});
    careerHost.querySelector('button')?.focus({preventScroll:true});
   },'btn btn-secondary'));
   root.append(nav);
  }
 }
 if(careerAllowed&&state.available.length){toolsRoot.appendChild(renderRecommendations());toolsRoot.appendChild(createWeekOptimizerSection({offers:state.available.map(o=>({...o,source_offer_key:offerKey(o)})),loadProfile:loadPrivatePlanner,isCurrent:()=>state.enabled&&state.privatePlannerAllowed}));}
 if(root.hidden||!state.available.length)return;
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
  root.appendChild(createPrivatePlannerForm({onChanged:()=>{refreshAlertSchedule();refreshProfileSchedule();render()}}));
 else root.appendChild(node('p','apd-comparator-insigne-locked',
  'Comparación con domicilio y jornadas actuales: exclusiva del Plan Insigne. '+
  'Revisá Mi plan si querés acceder a esta función.'));
 if(state.selected.size){
  const selected=selectedOffers();
  const codes=selectedSchoolKeys();
  const verifiedCount=codes.filter(key=>!!state.geoByKey[key]).length;
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
  if(codes.length>=1){
   const geoButton=button(state.geoWorking?'Consultando ABC...':
     state.geoRequested?'Actualizar ubicaciones oficiales':'Consultar distancias oficiales',
     ()=>{void verifySchoolDistances()},'btn btn-secondary apd-comparator-geobutton');
   geoButton.disabled=state.geoWorking;
   root.appendChild(geoButton);
  }
  if(hasSavedVerifiedHome()&&!state.geoRequested&&codes.length)
   root.appendChild(node('p','apd-comparator-hint',
    'Con tu domicilio guardado, Insigne consulta automáticamente en ABC '+
    'la ubicación de las escuelas seleccionadas. No envía tu domicilio a ABC.'));
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
   const fit=assessOfferDecisionSignals(row);
   const fitPanel=node('section','apd-offer-fit apd-offer-fit-'+fit.kind);
   fitPanel.setAttribute('aria-label','Indicadores orientativos de esta oferta');
   fitPanel.appendChild(node('strong','apd-offer-fit-title',fit.label));
   const evidence=node('ul','apd-offer-fit-reasons');
   for(const reason of fit.reasons)
    evidence.appendChild(node('li','',reason));
   fitPanel.appendChild(evidence);
   fitPanel.appendChild(node('p','apd-offer-fit-note',fit.note));
   entry.appendChild(fitPanel);
   if(state.geoRequested){
    const verified=state.geoByKey[row.escuela.toUpperCase()];
    const distance=state.anchor && verified && origin ?
      row.distancia_km : null;
    const geographic=distance===null?
     'Ubicación sin verificar o escuela sin clave válida':
     'A '+distance+' km en línea recta de '+state.anchor;
    entry.appendChild(node('p','apd-comparator-distance',geographic));
    if(verified){
     const profile=state.privatePlannerAllowed?loadPrivatePlanner():null;
     const workDistances=profile?.jobs?.some(job=>job.schoolKey)?
      workToOfferSchoolDistances(profile.jobs,row.escuela,state.geoByKey):[];
     for(const item of workDistances){
      entry.appendChild(node('p','apd-comparator-work-distance',
       'Desde '+item.school+' ('+item.schoolKey+'): '+
       item.km_linea_recta+' km en línea recta entre escuelas, no recorrido ni tiempo.'));
     }
     entry.appendChild(node('p','apd-comparator-geo-detail',
      [verified.domicilio,verified.cue?'CUE '+verified.cue:'']
       .filter(Boolean).join(' · ')));
     const home=state.privatePlannerAllowed?loadPrivatePlanner().homeLocation:null;
     const homeDistance=straightLineHomeSchoolKm(home,verified);
     if(homeDistance!==null){
      entry.appendChild(node('p','apd-comparator-home-distance',
       'Desde tu domicilio seleccionado: '+homeDistance+
       ' km en línea recta (no es el recorrido por calles).'+
       (home.scope&&home.scope!=='exacta'?
        ' La localidad ingresada no pudo confirmarse; verificá el mapa.':'')));
      entry.appendChild(button('Ver recorrido desde domicilio en Maps',()=>{
       const url='https://www.google.com/maps/dir/?'+new URLSearchParams({
        api:'1',origin:home.lat+','+home.lon,
        destination:verified.lat+','+verified.lon
       });
       window.open(url,'_blank','noopener,noreferrer');
      },'btn btn-secondary apd-comparator-home-map'));
     }
    }
   }
   const activeHome=state.privatePlannerAllowed?loadPrivatePlanner().homeLocation:null;
   if(activeHome&&!state.geoRequested){
    entry.appendChild(node('p','apd-comparator-hint',
     'Para ver la distancia desde tu domicilio, consultá la ubicación oficial de la escuela.'));
   }else if(activeHome&&state.geoRequested&&!state.geoByKey[row.escuela.toUpperCase()]){
    entry.appendChild(node('p','apd-comparator-hint',
     'No se pudo verificar en ABC la ubicación de esta escuela.'));
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
  // Display the available travel options directly below the offers.
  // External third-party services still require an explicit button/link.
  if(state.privatePlannerAllowed){
   const profile=loadPrivatePlanner();
   if(profile.domicile||profile.homeLocation){
    const mobility=createMobilitySection({
     home:profile.homeLocation,offers:result.items,verifiedBySchool:state.geoByKey
    });
    mobility.classList.add('apd-mobility-inline');
    root.appendChild(mobility);
   }
  }
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
 maybeAutoVerifySchools();
}
function refresh({offers=[],index=0,enabled=false,planInfo=null,historyContext=null,favoriteMode=false,favoriteClient=null,diaryClient=null}={}) {
 const entitled=hasInsignePlannerAccess(planInfo);
 // A downgrade, expiration or unverified subscription wipes previous personal
 // information from this browser tab before any new DOM can read it.
 if(!entitled)clearPrivatePlanner();
 const nextDiaryClient=entitled&&enabled?diaryClient:null;
 if(!entitled||applicationDiary.client!==nextDiaryClient)resetDiary(nextDiaryClient);
 if(!entitled){favorites.clear();favoritesOpen=false;favoriteMessage='';recommendOpen=false;recommendDistrict='';recommendTurn='';recommendSort='cierre';recommendGroup='';recommendLimit=10;}
 const nextMode=entitled&&favoriteMode===true;
 const nextClient=nextMode?favoriteClient:null;
 if(nextMode!==permanentFavorites||nextClient!==accountFavorites){clearAccountFavorites();favorites.clear();favoritesOpen=false;favoriteMessage='';permanentFavorites=nextMode;accountFavorites=nextClient;}
 state.privatePlannerAllowed=entitled;
 const historyHost=document.getElementById('apd-personal-history');
 if(!entitled||!enabled)clearPersonalHistory();
 else if(historyHost&&historyContext&&!disposePersonalHistory)disposePersonalHistory=mountPersonalHistory(historyHost,{fetchSummary:historyContext.fetchSummary,isCurrent:()=>state.privatePlannerAllowed&&state.enabled&&historyContext.isCurrent()});
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
 favoriteVisible=entitled?favorites.refresh(state.available,offerKey):new Set();
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
   schoolGeoSignature()!==state.geoSignature)invalidateGeo();
 syncCurrentButton();
 watchVisibleApplicants();
 render();
}
function reset() {
 resetDiary();
 clearAccountFavorites();
 profileScheduleClient=null;
 clearPersonalHistory();
 document.getElementById('apd-perfil-horarios')?.replaceChildren();
 window.APD_renderAlertScheduleControls?.({total:0});
 // Auth/session ownership changes must not expose a former account's local
 // home address or work timetable to the next account in the same tab.
 clearPrivatePlanner();
 applicantObserver?.disconnect();
 observedApplicants.clear();
 favorites.clear();favoriteVisible=new Set();favoritesOpen=false;favoriteMessage='';
 recommendOpen=false;recommendDistrict='';recommendTurn='';recommendSort='cierre';recommendGroup='';recommendLimit=10;
 closeComparisonDialog();
 invalidateGeo();
 state.enabled=false;state.privatePlannerAllowed=false;
 state.available=[];state.current=null;state.selected.clear();
 state.sort='cierre';state.district='';state.turn='';
 state.autoGeoSignature='';
 document.querySelectorAll('#apd-comparar-oferta,#apd-ver-comparacion,#apd-simular-oferta,#apd-favorite-oferta')
  .forEach(control=>control.remove());
 if(root){root.hidden=true;root.replaceChildren();}
 const careerHost=document.getElementById('apd-career-tools-host');
 if(careerHost){careerHost.hidden=true;careerHost.replaceChildren();}
 const careerCard=document.getElementById('apd-career-tools-card');
 if(careerCard)careerCard.hidden=true;
}
document.getElementById('btn-logout')?.addEventListener('click',clearPrivatePlanner,true);
window.addEventListener('APD_accountHomeUpdated',()=>{
 if(!state.enabled||!state.privatePlannerAllowed)return;
 const modalOpen=!!document.getElementById('apd-comparison-dialog');
 render();
 if(modalOpen&&state.selected.size>=2)focusComparison();
});
window.APD_comparatorRefresh=refresh;
window.APD_comparatorReset=reset;
// Core app may have rendered before module import was completed.
if(root){root.hidden=true;}

const scheduleControls=document.getElementById('apd-alert-schedule-controls');
let scheduleFilterActive=false;

function refreshAlertSchedule(){
 window.APD_setAlertScheduleFilter?.(scheduleFilterActive);
}

window.APD_filterAlertsBySchedule=(offers,planInfo)=>{
 if(!hasInsignePlannerAccess(planInfo))return null;
 const profile=loadPrivatePlanner();
 if(!profile.jobs.length&&!profile.moduleSchedule?.length)return null;
 return offers.filter(offer=>
  checkScheduleOverlap(offer.dias_horarios||offer.horario,profile).status==='no-overlap'
 );
};

window.APD_renderAlertScheduleControls=({planInfo,total,visible,active})=>{
 scheduleFilterActive=active===true;
 if(!scheduleControls)return;
 scheduleControls.replaceChildren();
 scheduleControls.hidden=!total||!hasInsignePlannerAccess(planInfo);
 scheduleControls.classList.toggle('apd-comparator-head',!scheduleControls.hidden);
 if(scheduleControls.hidden)return;

 const profile=loadPrivatePlanner();
 const hasJobs=profile.jobs.length>0||!!profile.moduleSchedule?.length;
 const openPlanner=()=>{
  const planner=document.querySelector('#apd-perfil-horarios details');
  if(!planner)return;
  planner.open=true;
  planner.scrollIntoView?.({block:'center'});
  planner.querySelector('summary')?.focus();
 };
 const card=node('div','apd-schedule-filter-card');
 const toggle=button('',()=>{
  window.APD_setAlertScheduleFilter?.(!active);
  scheduleControls.querySelector('.apd-schedule-switch')?.focus();
 },'apd-schedule-switch');
 const symbol=node('span','apd-schedule-symbol','✓');symbol.setAttribute('aria-hidden','true');
 const copy=node('span','apd-schedule-copy');
 copy.append(node('strong','','Compatibilidad horaria'),node('span','apd-schedule-subtitle',
  !hasJobs?'Cargá tus horarios para filtrar':active?'Filtro activo · sin superposiciones verificadas':'Mostrando todas las ofertas'));
 const track=node('span','apd-schedule-track');track.setAttribute('aria-hidden','true');
 track.appendChild(node('span','apd-schedule-thumb'));
 toggle.append(symbol,copy,track);
 toggle.setAttribute('aria-label','Solo compatibles con mi horario');
 toggle.setAttribute('role','switch');
 toggle.setAttribute('aria-checked',String(hasJobs&&scheduleFilterActive));
 toggle.disabled=!hasJobs;
 const footer=node('div','apd-schedule-filter-footer');
 const count=node('span','apd-schedule-filter-count',
  active&&hasJobs?visible+' de '+total+' ofertas compatibles':total+' '+(total===1?'oferta disponible':'ofertas disponibles'));
 count.setAttribute('role','status');
 footer.append(count,button(hasJobs?'Mi carga horaria':'Cargar mis horarios',openPlanner,'apd-schedule-edit'));
 card.append(toggle,footer);scheduleControls.appendChild(card);
};

window.APD_renderProfileSchedule=(planInfo,accountClient=undefined,accountRequired=undefined)=>{
 const host=document.getElementById('apd-perfil-horarios');
 if(!host)return;
 if(!hasInsignePlannerAccess(planInfo)){
  profileScheduleClient=null;
  host.replaceChildren();
  return;
 }
 // The existing core app calls with one argument. Only the authenticated
 // bootstrap supplies the optional opaque client; no bearer reaches this UI.
 if((accountClient!==undefined&&accountClient!==profileScheduleClient)||(accountRequired!==undefined&&accountRequired!==profileScheduleRequired)){
  if(accountClient!==undefined)profileScheduleClient=accountClient;
  if(accountRequired!==undefined)profileScheduleRequired=accountRequired;
  host.replaceChildren();
 }
 if(!host.firstElementChild)mountProfileSchedule(host);
};

function refreshProfileSchedule(){
 const host=document.getElementById('apd-perfil-horarios');
 if(!host)return;
 host.replaceChildren();
 if(state.privatePlannerAllowed)mountProfileSchedule(host);
}

function mountProfileSchedule(host){
 host.appendChild(createWeeklyScheduleForm({accountClient:profileScheduleClient,accountRequired:profileScheduleRequired,onChanged:()=>{
  refreshAlertSchedule();
  render();
 }}));
}
