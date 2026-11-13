/**
 * Account home reference in Datos personales.
 * Never writes address to localStorage, analytics or unauthenticated APIs.
 * Session identity always verified by backend; no user_id accepted from UI.
 */
(()=>{
 'use strict';
 const API=window.API_URL||'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
 let ownerToken='',loaded=false,loading=false,home=null,problem='',epoch=0,requestNumber=0;
 const getToken=()=>{
  const raw=typeof window.obtenerAuthBearer==='function'?window.obtenerAuthBearer():
   typeof window.obtenerSessionToken==='function'?window.obtenerSessionToken():
   typeof window.obtenerToken==='function'?window.obtenerToken():
   window.localStorage?.getItem('apd_session_token_v1');
  // A session helper may return null/undefined before login or after logout.
  // String(null) and String(undefined) are not authorization credentials.
  return typeof raw==='string'?raw.trim():'';
 };
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
  // Text persistence alone does not establish that a chosen Georef point
  // survived. Verify all geographic fields against the authenticated GET.
  if(payload.georef){
   const expected=payload.georef,point=confirmed.georef;
   if(!point||point.source!=='GEOREF_AR_V2'||
      point.label!==expected.label||Number(point.height)!==Number(expected.height)||
      Number(point.lat)!==Number(expected.lat)||
      Number(point.lon)!==Number(expected.lon)||
      (point.scope||'exacta')!==(expected.scope||'exacta')||
      (expected.reviewed===true&&point.reviewed!==true))
    throw Error('El domicilio se guardó, pero no se confirmó la ubicación del mapa. Elegí la dirección nuevamente.');
  }
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
   const status=existing.querySelector('#apd-account-home-status');
   const field=existing.querySelector('input');
   // A different login must never inherit the former account's DOM field,
   // including unsaved edits (dataset.dirty).
   if(existing.dataset.ownerEpoch!==String(epoch)){
    existing.dataset.ownerEpoch=String(epoch);
    delete existing.dataset.dirty;
    if(field)field.value='';
    if(status)status.textContent='Cargando domicilio de esta cuenta...';
    existing._resetGeo?.();
    const geoInfo=existing.querySelector('#apd-account-home-georef-status');
    if(geoInfo)geoInfo.textContent='La dirección pertenece a la cuenta actual. Buscá su ubicación solo si querés calcular distancias.';
    void reload();
   }
   if(status&&existing.dataset.busy!=='1'&&existing.dataset.dirty!=='1'){
    status.textContent=problem?'Error al cargar: '+problem:
     loading?'Cargando domicilio de tu cuenta...':
     loaded?(home?(home.georef?'Domicilio y ubicación recuperados de tu cuenta.':
     'Domicilio guardado. Falta seleccionar una ubicación para calcular distancias.'):
       'Todavía no hay un domicilio guardado. Escribí tu dirección y tocá Guardar.'):
     'Comprobando domicilio...';
   }
   const retry=existing.querySelector('#apd-account-home-retry');
   if(retry)retry.hidden=!problem||loading;
   const map=existing.querySelector('#apd-account-home-map');
   if(map&&!existing.dataset.dirty)
    map.hidden=!(home?.georef||existing._getSelectedGeo?.());
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
  let chosenGeo=null,geoController=null,lookupSerial=0;
  const geoLookup=document.createElement('button');
  geoLookup.type='button';geoLookup.className='btn btn-secondary';
  geoLookup.textContent='Buscar calle y localidad';
  geoLookup.style.cssText='margin:0 0 8px';
  const geoStatus=document.createElement('p');
  geoStatus.id='apd-account-home-georef-status';
  geoStatus.setAttribute('role','status');
  geoStatus.style.fontSize='13px';
  geoStatus.textContent='Para calcular distancias, buscá y elegí una ubicación. La consulta a Georef es opcional.';
  const geoCandidates=document.createElement('div');
  geoCandidates.setAttribute('role','group');
  geoCandidates.setAttribute('aria-label','Ubicaciones posibles');
  const geoReviewLabel=document.createElement('label');
  geoReviewLabel.style.cssText='display:block;margin:6px 0;font-size:13px';
  const geoReview=document.createElement('input');
  geoReview.type='checkbox';
  geoReviewLabel.append(geoReview,document.createTextNode(
   ' Revisé la ubicación aproximada en el mapa y acepto usarla para las distancias.'));
  geoReviewLabel.hidden=true;
  const geoMap=document.createElement('button');
  geoMap.id='apd-account-home-map';
  geoMap.type='button';geoMap.className='btn btn-secondary';
  geoMap.textContent='Ver ubicación en el mapa';
  geoMap.hidden=true;geoMap.style.margin='4px 0 8px';
  geoMap.addEventListener('click',()=>{
   const point=chosenGeo||home?.georef;
   if(!point)return;
   window.open('https://www.google.com/maps/search/?'+new URLSearchParams({
    api:'1',query:point.lat+','+point.lon
   }),'_blank','noopener,noreferrer');
  });
  const clearGeo=()=>{
   lookupSerial++;geoController?.abort();geoController=null;
   chosenGeo=null;geoReview.checked=false;geoReviewLabel.hidden=true;
   geoMap.hidden=true;geoCandidates.replaceChildren();
  };
  section._resetGeo=clearGeo;
  section._getSelectedGeo=()=>chosenGeo;
  input.addEventListener('input',()=>{
   section.dataset.dirty='1';
   clearGeo();
   geoStatus.textContent='La dirección cambió. Podés buscarla de nuevo o guardar solamente el texto.';
   status.textContent='Dirección sin guardar. Tocá «Guardar domicilio en mi cuenta».';
  });
  geoLookup.addEventListener('click',async()=>{
   const token=reScope(),owner=epoch;
   if(!token)return;
   clearGeo();
   const request=lookupSerial,query=input.value.trim();
   geoLookup.disabled=true;
   geoStatus.textContent='Buscando direcciones en Georef Argentina...';
   const controller=new AbortController();
   geoController=controller;
   try{
    const {lookupHomeAddressesDetailed}=await import(
     './scripts/apd-home-georef.mjs?v=20261110-home4');
    if(epoch!==owner||request!==lookupSerial||controller.signal.aborted)return;
    const result=await lookupHomeAddressesDetailed(query,{signal:controller.signal});
    if(epoch!==owner||request!==lookupSerial||controller.signal.aborted||
       !section.isConnected||input.value.trim()!==query)return;
    const options=result.candidates||[];
    if(!options.length){
     geoStatus.textContent='No encontré coincidencias. Agregá localidad, partido y provincia para precisar la búsqueda.';
     return;
    }
    geoStatus.textContent='Elegí la dirección y localidad correctas. Los puntos de Georef son aproximados.';
    options.forEach(point=>{
     const item=document.createElement('button');
     item.type='button';item.className='btn btn-secondary';
     item.style.cssText='display:block;white-space:normal;text-align:left;margin:6px 0;width:100%';
     item.textContent=point.label;
     item.addEventListener('click',()=>{
      if(epoch!==owner||request!==lookupSerial||!section.isConnected)return;
      chosenGeo=point;
      input.value=point.label;
      section.dataset.dirty='1';
      geoCandidates.replaceChildren();
      geoMap.hidden=false;
      geoReview.checked=false;
      geoReviewLabel.hidden=point.scope==='exacta';
      geoStatus.textContent='Ubicación seleccionada (aproximada).'+
       (point.scope==='exacta'?' Ya podés guardar.':
        ' Revisá el punto en el mapa y marcá la confirmación antes de guardar.');
      status.textContent='Ubicación elegida, todavía sin guardar en tu cuenta.';
     });
     geoCandidates.appendChild(item);
    });
   }catch(error){
    if(!controller.signal.aborted&&epoch===owner&&request===lookupSerial){
     const message=String(error?.message||'');
     geoStatus.textContent=/^(?:Ingresá|Dirección demasiado|Indicá)/.test(message)?
      message:'No se pudo consultar Georef. Probá incluyendo localidad y partido.';
    }
   }finally{
    if(geoController===controller){
     geoController=null;
     if(epoch===owner)geoLookup.disabled=false;
    }
   }
  });
  const save=document.createElement('button');
  save.type='button';save.className='btn btn-primary';save.textContent='Guardar domicilio en mi cuenta';
  const remove=document.createElement('button');
  remove.type='button';remove.className='btn btn-secondary';remove.textContent='Eliminar domicilio';
  remove.style.marginLeft='8px';
  const status=document.createElement('p');
  status.id='apd-account-home-status';
  status.setAttribute('role','status');status.style.fontSize='13px';
  status.textContent=problem?'Error al cargar: '+problem:
   loading?'Cargando domicilio de tu cuenta...':
   loaded?(home?(home.georef?'Domicilio y ubicación recuperados de tu cuenta.':
     'Domicilio guardado. Falta seleccionar una ubicación para calcular distancias.'):
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
    if(chosenGeo&&chosenGeo.scope!=='exacta'&&!geoReview.checked)
     throw Error('Confirmá el punto aproximado en el mapa antes de guardarlo.');
    const geo=chosenGeo?.label===address_text?
     {...chosenGeo,...(geoReview.checked?{reviewed:true}:{})}:
     home?.address_text===address_text?home.georef||null:null;
    const savedHome=await persist({address_text,georef:geo});
    delete section.dataset.dirty;
    status.textContent=savedHome?.georef?
     'Domicilio y ubicación guardados en tu cuenta.':
     'Domicilio guardado en tu cuenta. Falta elegir la ubicación para calcular distancias.';
    geoStatus.textContent=savedHome?.georef?
     'Punto geográfico guardado y recuperado del servidor.':
     'No hay coordenadas guardadas. Podés buscar calle y localidad cuando quieras.';
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
  section.append(heading,hint,input,geoLookup,geoStatus,geoCandidates,
   geoMap,geoReviewLabel,save,remove,retry,status);
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