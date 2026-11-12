/**
 * Account home reference in Datos personales.
 * Never writes address to localStorage, analytics or unauthenticated APIs.
 * Session identity always verified by backend; no user_id accepted from UI.
 */
(()=>{
 'use strict';
 const API=window.API_URL||'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
 let ownerToken='',loaded=false,loading=false,home=null,problem='',epoch=0;
 const getToken=()=>String(
  typeof window.obtenerAuthBearer==='function'?window.obtenerAuthBearer():
  typeof window.obtenerSessionToken==='function'?window.obtenerSessionToken():''
 ).trim();
 function reScope(){
  const token=getToken();
  if(token!==ownerToken){
   ownerToken=token;loaded=false;loading=false;home=null;problem='';epoch++;
  }
  return token;
 }
 function broadcast(){
  window.dispatchEvent(new Event('APD_accountHomeUpdated'));
  paint();
 }
 async function call(method,payload){
  const token=reScope();
  if(!token)throw Error('Ingresá a tu cuenta');
  const requestId=epoch;
  const response=await fetch(API+'/api/account/home',{
   method,mode:'cors',credentials:'omit',cache:'no-store',
   headers:{Authorization:'Bearer '+token,...(payload!==undefined?{'Content-Type':'application/json'}:{})},
   ...(payload!==undefined?{body:JSON.stringify(payload)}:{})
  });
  const result=await response.json().catch(()=>({}));
  if(requestId!==epoch||getToken()!==token)throw Error('La sesión cambió');
  if(!response.ok||result.ok!==true)
   throw Error(result.message||'El domicilio no se pudo guardar');
  return result.home||null;
 }
 async function reload(){
  const token=reScope();
  if(!token||loading||loaded)return;
  loading=true;const current=epoch;
  try{
   const next=await call('GET');
   if(epoch!==current)return;
   home=next;loaded=true;problem='';
  }catch(error){
   if(epoch===current){problem=String(error.message||'No disponible');}
  }finally{
   if(epoch===current){loading=false;broadcast();}
  }
 }
 function peek(){
  return reScope()&&loaded?home:null;
 }
 async function persist(payload){
  reScope();
  const current=epoch;
  const updated=await call('PUT',payload);
  if(epoch!==current)throw Error('La sesión cambió');
  home=updated;loaded=true;problem='';broadcast();
  return updated;
 }
 async function erase(){
  reScope();
  const current=epoch;
  await call('DELETE');
  if(epoch!==current)throw Error('La sesión cambió');
  home=null;loaded=true;problem='';broadcast();
 }
 window.APD_accountHome=Object.freeze({peek,reload,persist,erase});
 function paint(){
  const box=document.getElementById('panel-datos-docente');
  if(!box)return;
  const token=reScope();
  if(!token){box.querySelector('#apd-account-home')?.remove();return;}
  const existing=box.querySelector('#apd-account-home');
  if(existing){
   const status=existing.querySelector('[role=status]');
   const field=existing.querySelector('input');
   if(status&&problem)status.textContent='El domicilio no está disponible: '+problem;
   if(field&&document.activeElement!==field&&!existing.dataset.dirty)
    field.value=home?.address_text||'';
   return;
  }
  const section=document.createElement('section');
  section.id='apd-account-home';
  section.style.cssText='margin-top:16px;padding:14px;border:1px solid #cbd8ee;border-radius:12px';
  const heading=document.createElement('h3');
  heading.textContent='Domicilio de referencia';
  const hint=document.createElement('p');
  hint.textContent='Opcional. Se guarda en tu cuenta para reutilizarlo en el comparador Insigne. '+
   'La ubicación es aproximada: se confirma por separado en el mapa. '+
   'Tus escuelas y horarios siguen guardándose solo en la pestaña.';
  hint.style.fontSize='13px';
  const input=document.createElement('input');
  input.id='mi-cuenta-domicilio';input.type='text';input.maxLength=180;
  input.placeholder='Calle y altura, localidad, partido, provincia';
  input.autocomplete='street-address';
  input.style.cssText='box-sizing:border-box;width:100%;padding:10px;margin:4px 0 10px;border:1px solid #aac4df;border-radius:8px';
  input.value=home?.address_text||'';
  input.addEventListener('input',()=>{section.dataset.dirty='1'});
  const save=document.createElement('button');
  save.type='button';save.className='btn btn-primary';save.textContent='Guardar domicilio en mi cuenta';
  const remove=document.createElement('button');
  remove.type='button';remove.className='btn btn-secondary';remove.textContent='Eliminar domicilio';
  remove.style.marginLeft='8px';
  const status=document.createElement('p');
  status.setAttribute('role','status');status.style.fontSize='13px';
  status.textContent=problem?'El domicilio no está disponible: '+problem:
   loading?'Cargando domicilio de tu cuenta...':
   loaded?'Podés editarlo cuando cambies de dirección.':'Preparando domicilio...';
  const busy=value=>{save.disabled=value;remove.disabled=value;};
  save.addEventListener('click',async()=>{
   if(!reScope())return;
   const address_text=input.value.trim();
   busy(true);status.textContent='Guardando...';
   try{
    await persist({address_text,georef:
     home?.address_text===address_text?home.georef||null:null});
    delete section.dataset.dirty;
    status.textContent='Domicilio guardado en tu cuenta.';
   }catch(e){status.textContent=String(e.message||'No se pudo guardar');}
   finally{busy(false);}
  });
  remove.addEventListener('click',async()=>{
   if(!window.confirm('¿Eliminar el domicilio guardado en tu cuenta?'))return;
   busy(true);status.textContent='Eliminando...';
   try{
    await erase();input.value='';delete section.dataset.dirty;
    status.textContent='Domicilio eliminado de tu cuenta.';
   }catch(e){status.textContent=String(e.message||'No se pudo eliminar');}
   finally{busy(false);}
  });
  section.append(heading,hint,input,save,remove,status);
  box.appendChild(section);
  void reload();
 }
 function observe(){
  const box=document.getElementById('panel-datos-docente');
  if(!box)return;
  new MutationObserver(()=>paint()).observe(box,{childList:true});
  paint();
 }
 if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',observe,{once:true});
 else observe();
 document.getElementById('btn-logout')?.addEventListener('click',()=>{
  ownerToken='';epoch++;loaded=false;loading=false;home=null;problem='';
 },true);
})();