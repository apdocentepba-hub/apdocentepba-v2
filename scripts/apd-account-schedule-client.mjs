import {validateModuleSchedule,validateScheduleRow} from './apd-account-schedule-core.mjs';
/** Explicit session-scoped bridge. No localStorage, no automatic uploads. */
export function createScheduleClient({getToken,fetcher,base}){
 let owner='',epoch=0,record=null,busy=false;
 function scope(){const next=String(getToken()||'');if(next!==owner){owner=next;epoch++;record=null;busy=false;}return owner;}
 async function request(method,body){
  const token=scope(),generation=epoch;
  if(!token)throw Error('Ingresá a tu cuenta');
  const response=await fetcher(base+'/api/account/schedule',{method,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(scope()!==token||epoch!==generation)throw Error('La sesión cambió');
  const result=await response.json();
  if(scope()!==token||epoch!==generation)throw Error('La sesión cambió');
  if(!response.ok||result.ok!==true){if(response.status===409)record=null;throw Error(result.message||'No disponible');}
  const value=result.schedule;
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Respuesta de horarios inválida');
  if(value.revision===0){
   if(!Array.isArray(value.modules)||value.modules.length!==0)throw Error('Respuesta de horarios inválida');
   return {modules:[],revision:0};
  }
  return validateScheduleRow(value);
 }
 async function perform(fn){scope();if(busy)throw Error('Operación en curso');busy=true;const generation=epoch;try{return await fn();}finally{if(generation===epoch)busy=false;}}
 return Object.freeze({
  peek(){scope();return record?{modules:[...record.modules],revision:record.revision}:null;},
  reload(){return perform(async()=>{record=null;record=await request('GET');return this.peek();});},
  persist(modules){return perform(async()=>{
   if(!record)throw Error('Cargá primero los horarios de tu cuenta');
   const expected=validateModuleSchedule(modules),revision=record.revision;
   // Invalidate cached revision before an ambiguous write.
   record=null;
   const saved=await request('PUT',{modules:expected,revision});
   if(saved.revision!==revision+1||JSON.stringify(saved.modules)!==JSON.stringify(expected))throw Error('Guardado no confirmado');
   const confirmed=await request('GET');
   if(confirmed.revision!==saved.revision||JSON.stringify(confirmed.modules)!==JSON.stringify(expected))throw Error('La cuenta cambió después del guardado');
   record=confirmed;return this.peek();
  });}
 });
}
