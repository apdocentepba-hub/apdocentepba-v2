import {updateApplicationDiary} from './apd-application-diary.mjs';

const labels={
 postulada:'Postulada',en_evaluacion:'En evaluación',adjudicada:'Adjudicada',
 no_adjudicada:'No adjudicada',retirada:'Retirada',sin_confirmar:'Sin confirmar'
};

export function createApplicationDiarySection({offers,session,isCurrent,onChanged}){
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const section=el('details');
 section.className='apd-application-diary';
 section.open=session.open;
 const client=session.client;
 const account=!!client;
 const heading=account?'Mis postulaciones de mi cuenta':'Mis postulaciones de esta sesión';
 const summary=el('summary',heading);
 summary.className='apd-work-summary';
 section.append(summary,el('p',account
  ?'Registro manual guardado en tu cuenta. Consultá ABC para confirmar el estado oficial.'
  :'Registro manual de esta sesión. Se borra al recargar o cambiar de cuenta. Consultá ABC para confirmar el estado oficial.'));
 const reload=el('button','Cargar / actualizar postulaciones');
 reload.type='button';
 reload.addEventListener('click',()=>runAccount(()=>client.reload(),'Registro de tu cuenta actualizado.'));
 const status=el('p');
 status.setAttribute('role','status');
 const list=el('ul');
 const form=el('form');
 const offer=el('select');
 const selectLabel=el('label','Oferta ');
 selectLabel.append(offer);
 const stage=el('select');
 const stageLabel=el('label','Estado ');
 stageLabel.append(stage);
 for(const [value,label] of Object.entries(labels)){
  const option=el('option',label);
  option.value=value;
  stage.append(option);
 }
 const save=el('button','Registrar estado');
 save.className='btn btn-secondary';
 const visible=new Map(offers.map(({key,title})=>[key,title]));
 const active=()=>section.isConnected&&isCurrent();
 function draw(preferredKey=''){
  const entries=session.record.entries;
  summary.textContent=heading+' ('+entries.length+')';
  reload.disabled=session.busy;
  status.textContent=session.message||'';
  save.disabled=session.busy;
  list.replaceChildren();
  offer.replaceChildren();
  const options=new Map(visible);
  for(const entry of entries)options.set(entry.key,options.get(entry.key)||session.titles.get(entry.key)||entry.key);
  for(const [key,title] of options){
   const option=el('option',title);
   option.value=key;
   offer.append(option);
  }
  if(options.has(preferredKey))offer.value=preferredKey;
  stage.value=entries.find(entry=>entry.key===offer.value)?.status||'sin_confirmar';
  form.hidden=options.size===0||(account&&!session.loaded);
  if(!entries.length)list.append(el('li',account&&!session.loaded
   ?'Cargá el registro de tu cuenta para empezar.':'Todavía no registraste postulaciones.'));
  for(const entry of entries){
   const title=options.get(entry.key);
   const item=el('li',title+' · '+labels[entry.status]+' ');
   const remove=el('button','Quitar');
   remove.type='button';
   remove.disabled=session.busy;
   remove.setAttribute('aria-label','Quitar registro de '+title);
   remove.addEventListener('click',()=>mutate('remove',entry.key));
   item.append(remove);
   list.append(item);
  }
 }
 async function runAccount(operation,message,key){
  if(!active()||session.busy)return;
  session.busy=true;session.message='Consultando tu cuenta…';
  draw(key);
  try{
   const record=await operation();
   if(!isCurrent())return;
   session.record=record;session.loaded=true;session.message=message;
  }catch(error){
   if(!isCurrent())return;
   session.loaded=false;session.record={entries:[],revision:0};
   session.message=error.message;
  }finally{
   if(isCurrent()){
    session.busy=false;
    if(section.isConnected)draw(key);
    else onChanged?.();
   }
  }
 }
 function mutate(action,key){
  if(!active()||session.busy||(account&&!session.loaded))return;
  if(account){
   const revision=session.record.revision;
   const mutation=action==='set'?{action,key,revision,status:stage.value}:{action,key,revision};
   if(action==='set'&&visible.has(key))session.titles.set(key,visible.get(key));
   if(action==='remove')session.titles.delete(key);
   return runAccount(()=>client.mutate(mutation),action==='remove'?'Registro quitado.':'Estado guardado en tu cuenta.',key);
  }
  try{
   const result=updateApplicationDiary(session.record,{action,key,status:stage.value,revision:session.record.revision});
   if(!result.ok)throw Error('No se pudo confirmar el estado');
   session.record=result.record;
   if(action==='remove')session.titles.delete(key);
   else if(visible.has(key))session.titles.set(key,visible.get(key));
   draw(key);
   status.textContent=action==='remove'?'Registro quitado.':'Estado registrado en esta sesión.';
  }catch(error){status.textContent=error.message;}
 }
 offer.addEventListener('change',()=>{stage.value=session.record.entries.find(entry=>entry.key===offer.value)?.status||'sin_confirmar';});
 form.addEventListener('submit',event=>{event.preventDefault();mutate('set',offer.value);});
 section.addEventListener('toggle',()=>{if(active())session.open=section.open;});
 form.append(selectLabel,stageLabel,save);
 if(account)section.append(reload);
 section.append(form,status,list);
 draw();
 return section;
}
