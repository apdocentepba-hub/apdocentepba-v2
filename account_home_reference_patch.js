/**
 * Account home reference in Datos personales.
 * Never writes address to localStorage, analytics or unauthenticated APIs.
 * Session identity always verified by backend; no user_id accepted from UI.
 */
(()=>{
 'use strict';
 const API=window.API_URL||'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
 let ownerToken='',loaded=false,loading=false,home=null,problem='',epoch=0,requestNumber=0;
 const getToken=()=>String(
  typeof window.obtenerAuthBearer==='function'?window.obtenerAuthBearer():
  typeof window.obtenerSessionToken==='function'?window.obtenerSessionToken():
  typeof window.obtenerToken==='function'?window.obtenerToken():
  (window.localStorage?.getItem('apd_session_token_v1')||'')
 ).trim();
 function reScope(){
  const token=getToken();
  if(token!==ownerToken){
   ownerToken=token;loaded=false;loading=false;home=null;problem='';epoch++;requestNumber++;
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
   signal:AbortSignal.timeout(15000),
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
  loading=true;problem='';
  const current=epoch,request=++requestNumber;
  broadcast();
  try{
   const next=await call('GET');
   if(epoch!==current||request!==requestNumber)return;
   home=next;loaded=true;problem='';
  }catch(error){
   if(epoch===current&&request===requestNumber)
    problem=String(error.message||'No disponible');
  }finally{
   if(epoch===current&&request===requestNumber){
    loading=false;broadcast();
   }
  }
 }
 function peek(){
  return reScope()&&loaded?home:null;
 }
 async function persist(payload){
  reScope();
  const current=epoch,request=++requestNumber;
  loading=false;
  const updated=await call('PUT',payload);
  // Confirm storage by reading it from the same authenticated account.
  const confirmed=await call('GET');
  if(epoch!==current||request!==requestNumber)throw Error('La sesión cambió');
  if(!confirmed||confirmed.address_text!==updated?.address_text)
   throw Error('El servidor no confirmó el domicilio guardado. Volvé a comprobarlo.');
  home=confirmed;loaded=true;problem='';broadcast();
  return confirmed;
 }
 async function erase(){
  reScope();
  const current=epoch,request=++requestNumber;
  loading=false;
  await call('DELETE');
  const confirmed=await call('GET');
  if(epoch!==current||request!==requestNumber)throw Error('La sesión cambió');
  if(confirmed!==null)
   throw Error('El servidor no confirmó que el domicilio se eliminó.');
  home=null;loaded=true;problem='';broadcast();
 }
 window.APD_accountHome=Object.freeze({peek,reload,persist,erase,
  ready:()=>!!reScope()&&loaded});
 function paint(){
  const box=document.getElementById('panel-datos-docente');
  if(!box)return;
  const token=reScope();
  if(!token){box.querySelector('#apd-account-home')?.remove();return;}
  const existing=box.querySelector('#apd-account-home');
  if(existing){
   const status=existing.querySelector('[role=status]');
   const field=existing.querySelector('input');
   // A different login must never inherit the former account's DOM field,
   // including unsaved edits (dataset.dirty).
   if(existing.dataset.ownerEpoch!==String(epoch)){
    existing.dataset.ownerEpoch=String(epoch);
    delete existing.dataset.dirty;
    if(field)field.value='';
    if(status)status.textContent='Cargando domicilio de esta cuenta...';
    void reload();
   }
   if(status&&existing.dataset.busy!=='1'&&existing.dataset.dirty!=='1'){
    status.textContent=problem?'Error al cargar: '+problem:
     loading?'Cargando domicilio de tu cuenta...':
     loaded?(home?'Domicilio recuperado de tu cuenta.':
       'Todavía no hay un domicilio guardado. Escribí tu dirección y tocá Guardar.'):
     'Comprobando domicilio...';
   }
   const retry=existing.querySelector('#apd-account-home-retry');
   if(retry)retry.hidden=!problem||loading;
   if(field&&document.activeElement!==field&&!existing.dataset.dirty)
    field.value=home?.address_text||'';
   return;
  }
  const section=document.createElement('section');
  section.id='apd-account-home';
  section.dataset.ownerEpoch=String(epoch);
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
  input.addEventListener('input',()=>{
   section.dataset.dirty='1';
   status.textContent='Dirección sin guardar. Tocá «Guardar domicilio en mi cuenta».';
  });
  const save=document.createElement('button');
  save.type='button';save.className='btn btn-primary';save.textContent='Guardar domicilio en mi cuenta';
  const remove=document.createElement('button');
  remove.type='button';remove.className='btn btn-secondary';remove.textContent='Eliminar domicilio';
  remove.style.marginLeft='8px';
  const status=document.createElement('p');
  status.setAttribute('role','status');status.style.fontSize='13px';
  status.textContent=problem?'Error al cargar: '+problem:
   loading?'Cargando domicilio de tu cuenta...':
   loaded?(home?'Domicilio recuperado de tu cuenta.':
    'Todavía no hay un domicilio guardado. Escribí tu dirección y tocá Guardar.'):
   'Comprobando domicilio...';
  const retry=document.createElement('button');
  retry.type='button';retry.id='apd-account-home-retry';
  retry.className='btn btn-secondary';retry.textContent='Reintentar carga';
  retry.hidden=!problem;retry.style.marginLeft='8px';
  retry.addEventListener('click',()=>{
   if(!reScope()||loading)return;
   loaded=false;problem='';void reload();
  });
  const busy=value=>{
   if(value)section.dataset.busy='1';else delete section.dataset.busy;
   save.disabled=value;remove.disabled=value;retry.disabled=value;
  };
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
  section.append(heading,hint,input,save,remove,retry,status);
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
  ownerToken='';epoch++;requestNumber++;
  loaded=false;loading=false;home=null;problem='';
 },true);
})();