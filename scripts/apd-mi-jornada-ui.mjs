/*
 * APD optional home/work schedule form. User chooses to save to sessionStorage
 * (same browser tab only); never fetches, uploads, geocodes or logs these values.
 */
import {WEEKDAYS,sanitizeWorkProfile,TRAVEL_GAP_OPTIONS} from './apd-mi-jornada-comparador.mjs?v=20261109-gap1';
const STORE='apd_comparador_jornada_solo_pestana_v1';
let ephemeral=null;
const element=(tag,cls='',value)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(value!==undefined)el.textContent=String(value);
 return el;
};
const key=()=>{try{return window.sessionStorage}catch{return null}};
export function loadPrivatePlanner(){
 if(ephemeral)return ephemeral;
 try{
  const raw=key()?.getItem(STORE);
  if(!raw)return {domicile:'',jobs:[]};
  const profile=sanitizeWorkProfile(JSON.parse(raw));
  ephemeral=profile;
  return profile;
 }catch{return {domicile:'',jobs:[]}}
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
 const days=element('div','apd-work-weekdays');
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
 row._apdInputs={school,days,start,end};
 return row;
}
export function createPrivatePlannerForm({onChanged}={}){
 const saved=loadPrivatePlanner();
 const details=element('details','apd-work-planner');
 details.open=!saved.jobs.length&&!saved.domicile;
 const summary=element('summary','apd-work-summary',
  saved.jobs.length?'Mi domicilio y jornadas · '+saved.jobs.length+' cargadas':
   'Mi domicilio y jornadas actuales (opcional)');
 details.appendChild(summary);
 const form=element('form','apd-work-form');
 form.noValidate=true;
 const help=element('p','apd-comparator-hint',
  'Ingresá tu domicilio de referencia y tus horarios actuales para comparar superposiciones. '+
  'Se guarda solo en esta pestaña, no en tu cuenta ni en nuestros servidores. '+
  'Borrá los datos antes de compartir el equipo.');
 form.appendChild(help);
 const domicile=input('text',saved.domicile,180);
 domicile.placeholder='Calle, altura y localidad (opcional)';
 domicile.autocomplete='off';
 form.appendChild(line('Domicilio de referencia (opcional)',domicile));
 form.appendChild(element('p','apd-comparator-hint',
  'El domicilio no se geolocaliza ni calcula viajes automáticamente. '+
  'Un enlace de mapas externo solo se abrirá si vos lo elegís.'));
 const travelGap=element('select','apd-work-input');
 for(const minutes of TRAVEL_GAP_OPTIONS){
  const option=element('option','',minutes?minutes+' minutos':'Desactivado');
  option.value=String(minutes);
  travelGap.appendChild(option);
 }
 travelGap.value=String(saved.travelGapMinutes??30);
 form.appendChild(line('Avisarme cuando queden menos de...',travelGap));
 form.appendChild(element('p','apd-comparator-hint',
  'Es el margen entre horarios que vos elegís. No es el tiempo real de traslado '+
  'ni demuestra compatibilidad legal. Con Desactivado solo se detectan cruces exactos.'));
 const rows=element('div','apd-work-shifts');
 const status=element('p','apd-work-status');
 status.setAttribute('role','status');
 const addRow=initial=>{
  if(rows.children.length>=5){status.textContent='Máximo cinco jornadas.';return}
  rows.appendChild(makeWorkRow(initial,row=>row.remove()));
 };
 saved.jobs.forEach(addRow);
 form.appendChild(rows);
 const add=element('button','btn btn-secondary','Agregar escuela y horario');
 add.type='button';add.addEventListener('click',()=>addRow());
 form.appendChild(add);
 const buttons=element('div','apd-work-actions');
 const save=element('button','btn btn-primary','Guardar en esta pestaña');
 save.type='submit';
 const erase=element('button','btn btn-secondary','Borrar mis datos de esta pestaña');
 erase.type='button';
 erase.addEventListener('click',()=>{clearPrivatePlanner();onChanged?.()});
 buttons.append(save,erase);
 form.append(buttons,status);
 form.addEventListener('submit',event=>{
  event.preventDefault();
  try{
   const jobs=[...rows.children].map(row=>{
    const {school,days,start,end}=row._apdInputs;
    const selected=[...days.querySelectorAll('input:checked')].map(x=>Number(x.value));
    return {school:school.value,days:selected,start:start.value,end:end.value};
   });
   savePrivatePlanner({domicile:domicile.value,jobs,travelGapMinutes:Number(travelGap.value)});
   onChanged?.();
  }catch(error){status.textContent=String(error.message||'Datos inválidos')}
 });
 details.appendChild(form);
 return details;
}
