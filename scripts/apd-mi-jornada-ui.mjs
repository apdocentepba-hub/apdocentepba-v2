/*
 * Insigne work schedules and a temporary address copy remain in sessionStorage.
 * After an explicit save with an authenticated account, a changed home reference
 * (text and optional Georef point) is persisted via APD_accountHome.
 * Address suggestions contact Georef Argentina only by user action/opt-in.
 */
import {WEEKDAYS,sanitizeWorkProfile,TRAVEL_GAP_OPTIONS,MAX_WORK_BLOCKS} from './apd-mi-jornada-comparador.mjs?v=20261124-grilla';
import {lookupHomeAddressesDetailed} from './apd-home-georef.mjs?v=20261110-home4';
import {resolvePlannerAccountHomeWrite} from './apd-account-home-write-policy.mjs?v=20261112-keepgeo1';
const STORE='apd_comparador_jornada_solo_pestana_v1';
let ephemeral=null;
// Revokes old forms, including autocomplete timers not fired before logout.
let privacyGeneration=0;
const activeHomeLookups=new Set();
const element=(tag,cls='',value)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(value!==undefined)el.textContent=String(value);
 return el;
};
const key=()=>{try{return window.sessionStorage}catch{return null}};
function withAccountHome(profile){
 const bridge=window.APD_accountHome;
 if(!bridge?.ready?.())return profile;
 const home=bridge.peek();
 // The authenticated account is authoritative for the home. Jobs and
 // commuting margin remain ephemeral and never reach the account server.
 try{return sanitizeWorkProfile({...profile,
  domicile:home?.address_text||'',homeLocation:home?.georef||null})}
 catch{return profile}
}
export function loadPrivatePlanner(){
 if(ephemeral)return withAccountHome(ephemeral);
 try{
  const raw=key()?.getItem(STORE);
  if(!raw)return withAccountHome({domicile:'',jobs:[]});
  const profile=sanitizeWorkProfile(JSON.parse(raw));
  ephemeral=profile;
  return withAccountHome(profile);
 }catch{return withAccountHome({domicile:'',jobs:[]})}
}
export function savePrivatePlanner(profile){
 const clean=sanitizeWorkProfile(profile);
 const storage=key();
 if(!storage)throw Error('El navegador no permite guardar datos en esta pestaña');
 try{storage.setItem(STORE,JSON.stringify(clean))}
 catch{throw Error('No se pudo guardar en esta pestaña')}
 ephemeral=clean;
 return clean;
}
export function clearPrivatePlanner(){
 privacyGeneration++;
 for(const controller of activeHomeLookups)controller.abort();
 activeHomeLookups.clear();
 ephemeral=null;
 try{key()?.removeItem(STORE)}catch{}
}
function line(label,input){
 const block=element('label','apd-work-field');
 block.appendChild(element('span','',label));block.appendChild(input);
 return block;
}
function input(type,value='',maxLength){
 const el=element('input','apd-work-input');
 el.type=type;el.value=value;
 if(maxLength)el.maxLength=maxLength;
 return el;
}
function makeWorkRow(initial={},remove){
 const row=element('fieldset','apd-work-shift');
 const name=element('legend','','Jornada actual');
 row.appendChild(name);
 const school=input('text',initial.school||'',120);
 school.placeholder='Ej.: E.E.S.T. N.º 6';school.autocomplete='off';
 school.required=true;
 row.appendChild(line('Escuela donde trabajás',school));
 const schoolKey=input('text',initial.schoolKey||'',10);
 schoolKey.placeholder='Ej.: 0005MS0004';schoolKey.autocomplete='off';
 schoolKey.setAttribute('aria-description',
  'Clave provincial opcional de diez caracteres tomada del Mapa Escolar ABC.');
 row.appendChild(line('Clave provincial de la escuela (opcional)',schoolKey));
 row.appendChild(element('p','apd-comparator-hint',
  'La clave se verifica en ABC solo cuando pedís consultar distancias. '+
  'Sin clave no se deduce la ubicación por el nombre. Revisá que la clave coincida con tu escuela.'));
 const days=element('div','apd-work-weekdays');
 days.setAttribute('role','group');
 days.setAttribute('aria-label','Días de trabajo');
 for(const day of WEEKDAYS){
  const label=element('label','apd-work-day');
  const check=input('checkbox');
  check.checked=(initial.days||[]).includes(day.id);
  check.value=String(day.id);
  label.append(check,document.createTextNode(day.name.slice(0,3)));
  days.appendChild(label);
 }
 row.appendChild(element('span','apd-work-days-title','Días de trabajo'));
 row.appendChild(days);
 const hours=element('div','apd-work-hours');
 const start=input('time',initial.start||'07:20');
 const end=input('time',initial.end||'11:50');
 start.required=end.required=true;
 hours.append(line('Desde',start),line('Hasta',end));
 row.appendChild(hours);
 const removeBtn=element('button','btn btn-secondary','Quitar jornada');
 removeBtn.type='button';
 removeBtn.addEventListener('click',()=>remove(row));
 row.appendChild(removeBtn);
 row._apdInputs={school,schoolKey,days,start,end,period:initial.period};
 return row;
}
export function createPrivatePlannerForm({onChanged}={}){
 const saved=loadPrivatePlanner();
 const generation=privacyGeneration;
 const isCurrent=()=>generation===privacyGeneration;
 const details=element('details','apd-work-planner');
 // The public comparison remains compact; users open this optional editor explicitly.
 details.open=false;
 const summary=element('summary','apd-work-summary',
  saved.jobs.length?'Mis jornadas · '+saved.jobs.length+' guardadas (Insigne)':
   saved.domicile?'Domicilio recuperado de mi cuenta (Insigne)':
   'Configurar mis jornadas y domicilio (Insigne)');
 details.appendChild(summary);
 const form=element('form','apd-work-form');
 form.noValidate=true;
 const help=element('p','apd-comparator-hint',
  'Cargá tus horarios para detectar cruces y poco margen entre clases. '+
  'Los horarios y escuelas se guardan solo en esta pestaña. El domicilio '+
  'de referencia se recupera de Datos personales y se guarda en tu cuenta al confirmar.');
 form.appendChild(help);
 const domicile=input('text',saved.domicile,180);
 domicile.placeholder='Ej.: Rondeau 319, Wilde, Avellaneda, Buenos Aires';
 domicile.autocomplete='off';
 form.appendChild(line('Domicilio de referencia (opcional)',domicile));
 // Never transmit a private address while typing. The lookup is a one-off
 // request to the official Georef service after explicit user interaction.
 let homeLocation=saved.homeLocation||null,homeRequest=null,homeAutoTimer=null;
 const homeCandidates=element('div','apd-home-candidates');
 homeCandidates.setAttribute('role','group');
 homeCandidates.setAttribute('aria-label','Direcciones posibles para seleccionar');
 const homeStatus=element('p','apd-home-status');
 homeStatus.setAttribute('role','status');
 const homeCheck=element('p','apd-home-chosen');
 const reviewCheck=element('input','apd-home-review-check');
 reviewCheck.type='checkbox';
 reviewCheck.checked=saved.homeLocation?.reviewed===true;
 const reviewRow=element('label','apd-home-review-row');
 reviewRow.append(reviewCheck,document.createTextNode(
  ' Revisé el punto en Maps y acepto usar esta ubicación aproximada para las distancias.'));
 const homeMap=element('button','btn btn-secondary apd-home-map','Ver domicilio elegido en el mapa');
 homeMap.type='button';
 const showChosen=()=>{
  const uncertain=!!homeLocation&&homeLocation.scope!=='exacta';
  const warning=uncertain?
   ' La búsqueda no confirmó tu localidad de manera exacta. '+
   'Verificá el punto en el mapa antes de aceptar las distancias.':'';
  homeCheck.textContent=homeLocation?
   'Dirección elegida: '+homeLocation.label+
   ' (ubicación aproximada, no la puerta exacta).'+warning:
   'Sin dirección georreferenciada seleccionada.';
  reviewRow.hidden=!uncertain;
  if(!uncertain)reviewCheck.checked=false;
  homeMap.hidden=!homeLocation;
 };
 homeMap.addEventListener('click',()=>{
  if(!isCurrent()||!homeLocation)return;
  const url='https://www.google.com/maps/search/?'+new URLSearchParams({
   api:'1',query:homeLocation.lat+','+homeLocation.lon
  });
  window.open(url,'_blank','noopener,noreferrer');
 });
 const homeLookup=element('button','btn btn-secondary apd-home-lookup',
  'Buscar direcciones coincidentes');
 homeLookup.type='button';
 homeLookup.addEventListener('click',async()=>{
  if(!details.isConnected||!isCurrent())return;
  homeRequest?.abort();
  const controller=new AbortController();
  homeRequest=controller;
  activeHomeLookups.add(controller);
  homeCandidates.replaceChildren();
  homeLocation=null;
  showChosen();
  homeLookup.disabled=true;
  homeStatus.textContent='Consultando direcciones de Georef Argentina...';
  try{
   const query=domicile.value.trim();
   const lookup=await lookupHomeAddressesDetailed(query,{signal:controller.signal});
   const matches=lookup.candidates;
   if(controller.signal.aborted||!details.isConnected||!isCurrent()||
      domicile.value.trim()!==query)return;
   if(!matches.length){
    homeStatus.textContent='Sin coincidencias con esa calle y altura. '+
     'Probá incluyendo localidad, partido y provincia.';
    return;
   }
   const advisory={
    partido:'La localidad exacta no devolvió coincidencias. '+
     'Se muestran direcciones del partido; verificá la ubicación en el mapa.',
    provincia:'El partido indicado no devolvió coincidencias. '+
     'Se muestran opciones de la provincia; confirmá que sea la localidad correcta.',
    pais:'La provincia indicada no devolvió coincidencias. '+
     'Se muestran alternativas de otras zonas: verificá antes de guardar.'
   };
   homeStatus.textContent=(advisory[lookup.scope]||'Elegí la localidad correcta.')+
    ' La posición de Georef es aproximada.';
   matches.forEach(candidate=>{
    const choose=element('button','btn btn-secondary apd-home-candidate',candidate.label);
    choose.type='button';
    choose.addEventListener('click',()=>{
     if(controller.signal.aborted||!isCurrent())return;
     homeLocation=candidate;
     reviewCheck.checked=false;
     domicile.value=candidate.label;
     homeCandidates.replaceChildren();
     homeStatus.textContent='Ubicación seleccionada. Guardá para usarla en las distancias.';
     showChosen();
    });
    homeCandidates.appendChild(choose);
   });
  }catch(error){
   if(!controller.signal.aborted&&isCurrent()){
    const message=String(error?.message||'');
    homeStatus.textContent=/^(?:Ingresá|Dirección demasiado)/.test(message)?
     message:'No se pudo consultar Georef. '+
      'Revisá la conexión o ingresá una dirección más específica.';
   }
  }finally{
   activeHomeLookups.delete(controller);
   if(homeRequest===controller){
    homeRequest=null;
    if(isCurrent())homeLookup.disabled=false;
   }
  }
 });
 const homeAuto=element('input','apd-home-auto-toggle');
 homeAuto.type='checkbox';
 homeAuto.checked=false;
 const homeAutoLabel=element('label','apd-home-auto-label');
 homeAutoLabel.append(homeAuto,document.createTextNode(
  ' Sugerir mientras escribo (usa Georef Argentina)'));
 homeAuto.addEventListener('change',()=>{
  if(!isCurrent())return;
  if(!homeAuto.checked){
   clearTimeout(homeAutoTimer);
   // Consent withdrawn: stop an in-flight autocomplete too.
   homeRequest?.abort();
   return;
  }
  if(/[\p{L}]/u.test(domicile.value)&&/\b[1-9]\d{0,4}\b/.test(domicile.value))
   homeAutoTimer=setTimeout(()=>homeLookup.click(),700);
 });
 domicile.addEventListener('input',()=>{
  if(!isCurrent())return;
  clearTimeout(homeAutoTimer);
  homeRequest?.abort();homeRequest=null;homeLookup.disabled=false;
  homeLocation=null;
  homeCandidates.replaceChildren();
  homeStatus.textContent='';
  showChosen();
  if(homeAuto.checked&&details.isConnected&&
     /[\p{L}]/u.test(domicile.value)&&/\b[1-9]\d{0,4}\b/.test(domicile.value))
   homeAutoTimer=setTimeout(()=>homeLookup.click(),700);
 });
 showChosen();
 form.append(homeAutoLabel,homeLookup,homeStatus,homeCandidates,homeCheck,homeMap,reviewRow);
 form.appendChild(element('p','apd-comparator-hint',
  'Georef Argentina recibe la dirección si elegís buscar coincidencias o activás '+
  '«Sugerir mientras escribo». Con tu sesión activa, «Guardar jornadas y domicilio» '+
  'envía la dirección y la ubicación aproximada elegida (si existe) al servidor '+
  'de AlertasAPD para guardarlas en tu cuenta. Tus horarios quedan solo en esta '+
  'pestaña. No usamos GPS. Las distancias geográficas son en línea recta.' ));
 const travelGap=element('select','apd-work-input');
 for(const minutes of TRAVEL_GAP_OPTIONS){
  const option=element('option','',minutes?minutes+' minutos':'Desactivado');
  option.value=String(minutes);
  travelGap.appendChild(option);
 }
 travelGap.value=String(saved.travelGapMinutes??30);
 form.appendChild(line('Avisarme cuando queden menos de...',travelGap));
 form.appendChild(element('p','apd-comparator-hint',
  'Advertencia según los minutos libres entre clases; no calcula viajes reales '+
  'ni determina compatibilidad legal.'));
 const rows=element('div','apd-work-shifts');
 const status=element('p','apd-work-status');
 status.setAttribute('role','status');
 const addRow=initial=>{
  if(rows.children.length>=MAX_WORK_BLOCKS){status.textContent='Máximo '+MAX_WORK_BLOCKS+' bloques horarios.';return}
  rows.appendChild(makeWorkRow(initial,row=>row.remove()));
 };
 saved.jobs.forEach(addRow);
 form.appendChild(rows);
 const add=element('button','btn btn-secondary','Agregar escuela y horario');
 add.type='button';add.addEventListener('click',()=>addRow());
 form.appendChild(add);
 const buttons=element('div','apd-work-actions');
 const save=element('button','btn btn-primary','Guardar jornadas y domicilio');
 save.type='submit';
 const erase=element('button','btn btn-secondary','Borrar datos de esta pestaña');
 erase.type='button';
 erase.addEventListener('click',()=>{
  if(!isCurrent())return;
  // Clear values from *this rendered form* before repainting. If the host
  // callback fails, sensitive text must not remain on screen.
  clearTimeout(homeAutoTimer);
  homeRequest?.abort();
  homeLocation=null;reviewCheck.checked=false;
  homeCandidates.replaceChildren();homeStatus.textContent='';
  showChosen();
  clearPrivatePlanner();
  domicile.value='';
  travelGap.value='30';
  rows.replaceChildren();
  status.textContent='';
  details.open=false;
  homeAuto.checked=false;
  summary.textContent='Configurar mis jornadas y domicilio (Insigne)';
  onChanged?.();
 });
 buttons.append(save,erase);
 form.append(buttons,element('p','apd-comparator-hint',
  'Borrar datos de esta pestaña no elimina el domicilio guardado en tu cuenta. '+
  'Para eliminarlo de tu cuenta, ingresá a Datos personales.'),status);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!isCurrent())return;
  save.disabled=true;
  try{
   clearTimeout(homeAutoTimer);
   const jobs=[...rows.children].map(row=>{
    const {school,schoolKey,days,start,end,period}=row._apdInputs;
    const selected=[...days.querySelectorAll('input:checked')].map(x=>Number(x.value));
    return {school:school.value,schoolKey:schoolKey.value,days:selected,
     start:start.value,end:end.value,period};
   });
   if(homeLocation&&homeLocation.scope!=='exacta'&&!reviewCheck.checked)
    throw Error('Revisá el punto en Maps y marcá la confirmación antes de guardar.');
   const reviewedHome=homeLocation&&reviewCheck.checked?
    {...homeLocation,reviewed:true}:homeLocation;
   const bridge=window.APD_accountHome;
   const accountLoaded=!!bridge?.ready?.();
   const currentAccountHome=accountLoaded?bridge.peek():null;
   const targetHome=resolvePlannerAccountHomeWrite(
    currentAccountHome,domicile.value,reviewedHome);
   // A schedule-only save must not replace an already verified location
   // with null. A different typed address can still clear the old point.
   savePrivatePlanner({domicile:domicile.value,jobs,
    travelGapMinutes:Number(travelGap.value),homeLocation:targetHome.georef});
   if(accountLoaded&&targetHome.address_text){
    try{
     if(targetHome.needsWrite){
      await bridge.persist({address_text:targetHome.address_text,
       georef:targetHome.georef});
      if(!isCurrent())return;
      status.textContent='Domicilio actualizado en tu cuenta. Jornadas guardadas en esta pestaña.';
     }else{
      status.textContent='Domicilio ya guardado en tu cuenta, sin cambios. '+
       'Jornadas guardadas en esta pestaña.';
     }
    }catch(error){
     status.textContent='Jornadas guardadas en la pestaña, pero no el domicilio en la cuenta: '+
      String(error.message||'Servicio no disponible');
    }
   }else{
    status.textContent='Jornadas guardadas en esta pestaña. '+
     (accountLoaded?'Para borrar el domicilio de tu cuenta, usá Datos personales.':
      'La cuenta todavía no confirmó su domicilio.');
   }
   if(isCurrent())onChanged?.();
  }catch(error){status.textContent=String(error.message||'Datos inválidos')}
  finally{save.disabled=false;}
 });
 details.appendChild(form);
 return details;
}

export function createWeeklyScheduleForm({onChanged}={}){
 const profile=loadPrivatePlanner();
 const generation=privacyGeneration;
 const labels=['Prehora','1.ª hora','2.ª hora','3.ª hora','4.ª hora','5.ª hora'];
 const details=element('details','apd-work-planner');
 details.appendChild(element('summary','apd-work-summary','Mi carga horaria'));
 const form=element('form','apd-work-form');
 form.appendChild(element('p','apd-comparator-hint',
  'Marcá las horas ocupadas y cargá su horario real. Si un bloque cambia según el día o el turno, agregá otra fila. Se conserva en esta pestaña.'));
 const scroll=element('div','apd-schedule-grid-scroll');
 const table=element('table','apd-schedule-grid');
 const head=table.createTHead().insertRow();
 for(const label of ['Hora','Desde','Hasta','Escuela',...WEEKDAYS.map(day=>day.name.slice(0,3))]){
  const cell=element('th','',label);
  cell.scope='col';
  head.appendChild(cell);
 }
 const body=table.createTBody();
 const fields=[];
 const status=element('p','');
 status.setAttribute('role','status');

 function addBlock(job={}){
  if(fields.length>=MAX_WORK_BLOCKS){
   status.textContent='Máximo '+MAX_WORK_BLOCKS+' bloques horarios.';
   return;
  }
  const label=labels[fields.length]||'Bloque '+(fields.length+1);
  const row=body.insertRow();
  const heading=element('th','',label);
  heading.scope='row';
  row.appendChild(heading);
  const start=input('time',job.start||'');
  const end=input('time',job.end||'');
  const school=input('text',job.school||'',120);
  school.placeholder='Opcional';
  for(const [field,name] of [[start,'Desde'],[end,'Hasta'],[school,'Escuela']]){
   field.setAttribute('aria-label',label+' · '+name);
   row.insertCell().appendChild(field);
  }
  const checks=WEEKDAYS.map(day=>{
   const check=input('checkbox',String(day.id));
   check.checked=job.days?.includes(day.id)??false;
   check.setAttribute('aria-label',label+' · '+day.name);
   row.insertCell().appendChild(check);
   return check;
  });
  fields.push({start,end,school,checks,originalSchool:job.school,schoolKey:job.schoolKey});
 }
 const blocks=[];
 for(const job of profile.jobs){
  const period=job.period;
  if(Number.isInteger(period)&&!blocks[period])blocks[period]=job;
 }
 for(const job of profile.jobs){
  if(blocks.includes(job))continue;
  const free=Array.from({length:MAX_WORK_BLOCKS},(_,index)=>index).find(index=>!blocks[index]);
  blocks[free]=job;
 }
 for(let index=0;index<Math.max(labels.length,blocks.length);index++)addBlock(blocks[index]);
 scroll.appendChild(table);
 form.appendChild(scroll);
 const add=element('button','btn btn-secondary','Agregar bloque');
 add.type='button';
 add.addEventListener('click',()=>addBlock());
 const save=element('button','btn btn-primary','Guardar horarios');
 save.type='submit';
 form.append(add,save,status);
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(generation!==privacyGeneration)return;
  const jobs=fields.flatMap(({start,end,school,checks,originalSchool,schoolKey},period)=>{
   const days=checks.filter(check=>check.checked).map(check=>Number(check.value));
   if(!days.length)return [];
   const name=school.value.trim()||'Ocupado';
   return [{start:start.value,end:end.value,school:name,days,period,
    schoolKey:name===originalSchool?schoolKey:undefined}];
  });
  try{
   savePrivatePlanner({...loadPrivatePlanner(),jobs});
  }catch(error){
   status.textContent=error.message;
   return;
  }
  status.textContent='Horarios guardados.';
  onChanged?.();
 });
 details.appendChild(form);
 return details;
}
