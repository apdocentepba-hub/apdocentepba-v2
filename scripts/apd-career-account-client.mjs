/** Account scoped client. No browser storage, no automatic writes. */
import {cleanCareer,validateCareerRecord} from './apd-career-account-core.mjs';
export function createCareerClient({getToken,fetcher,base}){
 let owner='',epoch=0,record=null,busy=false;
 function scope(){const next=String(getToken()||'');if(next!==owner){owner=next;epoch++;record=null;busy=false;}return owner;}
 const peek=()=>{scope();return record===null?null:structuredClone(record);};
 async function request(method,body){
  const token=scope(),generation=epoch;if(!token)throw Error('Ingresá a tu cuenta');
  const res=await fetcher(base+'/api/account/career',{method,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(scope()!==token||generation!==epoch)throw Error('La sesión cambió');
  const payload=await res.json();
  if(scope()!==token||generation!==epoch)throw Error('La sesión cambió');
  if(!res.ok||payload.ok!==true)throw Error(payload.message||'No se pudo consultar la cuenta');
  const value=payload.career;
  if(value?.revision===0&&value.profile===null&&Object.keys(value).length===2)return {profile:null,revision:0};
  return validateCareerRecord(value);
 }
 async function perform(fn){scope();if(busy)throw Error('Operación en curso');busy=true;const generation=epoch;try{return await fn();}finally{if(generation===epoch)busy=false;}}
 return Object.freeze({
  peek,
  captureSession(){const token=scope(),generation=epoch;return ()=>!!token&&scope()===token&&generation===epoch;},
  reload(){return perform(async()=>{record=null;record=await request('GET');return peek();});},
  persist(value){return perform(async()=>{
   if(!record)throw Error('Recuperá primero tu carrera');
   const profile=cleanCareer(value),revision=record.revision;record=null;
   const saved=await request('PUT',{profile,revision});
   if(saved.revision!==revision+1||JSON.stringify(saved.profile)!==JSON.stringify(profile))throw Error('Guardado no confirmado');
   const confirmed=await request('GET');
   if(confirmed.revision!==saved.revision||JSON.stringify(confirmed.profile)!==JSON.stringify(profile))throw Error('Tu carrera cambió después del guardado');
   record=confirmed;return peek();
  });}
 });
}
