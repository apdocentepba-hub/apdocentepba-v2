/** Candidate UI: injected account client, no automatic migration or network. */
import {cleanCareer,combineCareerWithSchedule} from './apd-career-account-core.mjs';
import {validateModuleSchedule} from './apd-account-schedule-core.mjs';
const days=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const palette=['#3669a4','#137b67','#8756a7','#ac6228','#526f83','#a24168'];
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const button=(text,click)=>{const n=el('button',text,'btn btn-secondary');n.type='button';n.addEventListener('click',click);return n;};
const field=(text,input)=>{const n=el('label',undefined,'apd-work-field');n.append(el('span',text),input);return n;};
const input=(type,value='',max)=>{const n=el('input',undefined,'apd-work-input');n.type=type;n.value=value;if(max)n.maxLength=max;return n;};
const select=(values,value)=>{const n=el('select',undefined,'apd-work-input');for(const [v,t] of values){const o=el('option',t);o.value=v;n.append(o);}n.value=value;return n;};
export function mountCareerEditor(host,{client,legacyModules=[],isCurrent=()=>false,onConfirmed=()=>{}}){
 const legacy=validateModuleSchedule(legacyModules),root=el('section',undefined,'apd-career-editor');
 const heading=el('h3','Mi carrera docente');const note=el('p','Cargos con horarios exactos. La grilla anterior se conserva; los módulos sin asignar quedan señalados.','apd-comparator-hint');
 const status=el('p','Recuperando carrera…');status.setAttribute('role','status');
 const form=el('form'),years=input('number');years.min='0';years.max='80';years.step='1';years.required=true;
 const rows=el('div'),grid=el('div',undefined,'apd-career-grid'),summary=el('p');
 const add=button('Agregar cargo',()=>{if(current()&&!busy){addRow();dirty=true;preview();}});
 const reload=button('Recuperar carrera',()=>void load(false));
 const discard=button('Descartar borrador y recuperar',()=>void load(true));discard.hidden=true;
 const save=el('button','Guardar carrera','btn btn-primary');save.type='submit';
 form.append(field('Antigüedad reconocida (años)',years),rows,add,summary,grid,save);root.append(heading,note,reload,discard,form,status);host.replaceChildren(root);
 let busy=false,dirty=false,loaded=false,serial=0;
 const session=client?.captureSession?.()||(()=>false);
 const current=()=>root.isConnected&&isCurrent()&&session();
 function read(){
  return cleanCareer({schema:1,seniorityYears:years.value===''?-1:Number(years.value),positions:[...rows.children].map(n=>n.read())});
 }
 function setBusy(v){busy=v;for(const n of form.querySelectorAll('input,select,button'))n.disabled=v||!loaded;reload.disabled=v||!current();discard.disabled=v||!current();}
 function preview(){
  grid.replaceChildren();
  const positions=[...rows.children].map(n=>n.read());
  const assigned=new Map();positions.forEach((p,i)=>p.modules.forEach(m=>{const a=assigned.get(m)||[];a.push(i);assigned.set(m,a);}));
  summary.textContent=positions.length+' cargos · '+legacy.filter(m=>!assigned.has(m)).length+' módulos anteriores sin asignar';
  const table=el('table',undefined,'apd-schedule-grid');table.setAttribute('aria-label','Módulos por cargo');
  const h=table.createTHead().insertRow();for(const t of ['Turno / módulo',...days])h.append(el('th',t));
  const body=table.createTBody();
  for(const [shift,count] of [['M',5],['T',6]])for(let i=0;i<count;i++){
   const m=shift+(shift==='M'?i+1:i),row=body.insertRow();row.append(el('th',shift==='M'?'M '+(i+1):i===0?'T Prehora':'T '+i));
   for(let j=1;j<=7;j++){
    const key=m+'-'+j,cell=row.insertCell(),owners=assigned.get(key)||[];
    cell.textContent=owners.length>1?'Cruce':owners.length?'C'+(owners[0]+1):legacy.includes(key)?'Sin asignar':'—';
    if(owners.length){cell.style.background=owners.length>1?'#a53030':palette[owners[0]%palette.length];cell.style.color='#fff';}
    else if(legacy.includes(key)){cell.style.background='#fae8b8';cell.style.color='#654815';}
   }
  }
  grid.append(table);
 }
 function addRow(p){
  if(rows.children.length>=42)return;
  const row=el('fieldset',undefined,'apd-work-shift'),id=p?.id||'cargo-'+(++serial)+'-'+crypto.randomUUID();
  row.append(el('legend','Cargo docente'));
  const school=input('text',p?.school||'',120),schoolKey=input('text',p?.schoolKey||'',10),role=input('text',p?.role||'',100),level=input('text',p?.level||'',80);
  schoolKey.pattern='[0-9]{4}[A-Z]{2}[0-9]{4}';
  for(const x of [school,schoolKey,role,level])x.required=true;
  const kind=select([['cargo','Cargo'],['modulo','Módulos'],['hora_catedra','Horas cátedra']],p?.kind||'modulo');
  const situation=select([['titular','Titular'],['provisional','Provisional'],['suplente','Suplente'],['otro','Otra']],p?.status||'titular');
  const quantity=input('number',p?.quantity||1);quantity.min='1';quantity.max='77';quantity.step='1';quantity.required=true;
  row.append(field('Escuela',school),field('Clave provincial (Mapa Escolar ABC)',schoolKey),el('p','Desfavorabilidad: sin verificar.','apd-comparator-hint'),field('Materia o función',role),field('Nivel',level),field('Unidad de liquidación',kind),field('Cantidad remunerativa (no horas reloj)',quantity),field('Situación de revista',situation));
  const blocks=el('div');
  function block(initial={}){
   if(blocks.children.length>=42)return;
   const line=el('div',undefined,'apd-career-clock-row'),day=select(days.map((v,i)=>[String(i+1),v]),String(initial.day||1)),start=input('time',initial.start||''),end=input('time',initial.end||'');start.required=end.required=true;
   line.append(field('Día',day),field('Desde',start),field('Hasta',end),button('Quitar bloque',()=>{line.remove();dirty=true;preview();}));line.read=()=>({day:Number(day.value),start:start.value,end:end.value});blocks.append(line);
  }
  for(const value of p?.blocks||[{}])block(value);
  row.append(el('h4','Horarios reloj'),blocks,button('Agregar día y horario',()=>{block();dirty=true;preview();}));
  const modules=el('details');modules.append(el('summary','Asignar módulos de la grilla'));
  const checks=[];
  for(const shift of ['M','T']){
   const section=el('div',undefined,'apd-career-module-choices');
   for(let m=shift==='M'?1:0;m<=5;m++)for(let d=1;d<=7;d++){
    const key=shift+m+'-'+d,check=input('checkbox',key);check.checked=p?.modules?.includes(key)||false;checks.push(check);
    const label=el('label');label.append(check,el('span',days[d-1]+' '+shift+(m===0?' Pre':m)+(legacy.includes(key)?' · ocupado':'')));section.append(label);
   }
   modules.append(section);
  }
  row.append(modules,button('Quitar cargo',()=>{row.remove();dirty=true;preview();}));
  row.read=()=>({id,schoolKey:schoolKey.value.trim(),school:school.value,role:role.value,level:level.value,kind:kind.value,status:situation.value,quantity:Number(quantity.value),modules:checks.filter(x=>x.checked).map(x=>x.value),blocks:[...blocks.children].map(n=>n.read())});
  rows.append(row);
 }
 function apply(record){rows.replaceChildren();years.value=record.profile?String(record.profile.seniorityYears):'';for(const p of record.profile?.positions||[])addRow(p);dirty=false;loaded=true;discard.hidden=true;preview();}
 async function load(force){
  if(!current()||busy)return;
  if(dirty&&!force){status.textContent='Hay cambios sin guardar. Guardalos o descartá expresamente el borrador.';discard.hidden=false;return;}
  setBusy(true);
  try{const record=await client.reload();if(!current())return;apply(record);status.textContent=record.revision?'Carrera recuperada de tu cuenta.':'Todavía no declaraste tus cargos.';onConfirmed(record);}
  catch(e){if(current())status.textContent=e.message||'No se pudo recuperar la carrera.';}
  finally{if(current())setBusy(false);}
 }
 form.addEventListener('input',()=>{dirty=true;discard.hidden=true;preview();});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(!current()||busy||!loaded||!client.peek())return;
  let profile;try{profile=read();}catch(err){status.textContent=err.message;return;}
  setBusy(true);
  try{const saved=await client.persist(profile);if(!current())return;apply(saved);status.textContent='Carrera guardada en tu cuenta.';onConfirmed(saved);}
  catch(err){if(current()){status.textContent=(err.message||'No se confirmó el guardado')+' Tu borrador se conserva.';discard.hidden=false;}}
  finally{if(current()){setBusy(false);save.disabled=!client.peek();}}
 });
 setBusy(false);queueMicrotask(()=>void load(false));
 return ()=>{root.remove();};
}
