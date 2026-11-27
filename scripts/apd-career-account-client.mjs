/** Account scoped client. No browser storage, no automatic writes. */
import {cleanCareer,validateCareerRecord} from './apd-career-account-core.mjs';
export function createCareerClient({getToken,fetcher,base}){
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('API inválida');
 const endpoint=url.origin+'/api/account/career';
 let owner='',epoch=0,record=null,busy=false;
 function scope(){const next=String(getToken()||'');if(next!==owner){owner=next;epoch++;record=null;busy=false;}return owner;}
 const peek=()=>{scope();return record===null?null:structuredClone(record);};
 async function request(method,body,session){
  const {token,generation}=session;
  if(!token)throw Error('Ingresá a tu cuenta');
  if(scope()!==token||generation!==epoch)throw Error('La sesión cambió');
  const res=await fetcher(endpoint,{method,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(scope()!==token||generation!==epoch)throw Error('La sesión cambió');
  const payload=await res.json();
  if(scope()!==token||generation!==epoch)throw Error('La sesión cambió');
  if(!res.ok||payload.ok!==true)throw Error(payload.message||'No se pudo consultar la cuenta');
  const value=payload.career;
  if(value?.revision===0&&value.profile===null&&Object.keys(value).length===2)return {profile:null,revision:0};
  return validateCareerRecord(value);
 }
 async function perform(fn){const token=scope();if(busy)throw Error('Operación en curso');busy=true;const generation=epoch;const session={token,generation};try{return await fn(session);}finally{if(generation===epoch)busy=false;}}
 return Object.freeze({
  peek,
  captureSession(){const token=scope(),generation=epoch;return ()=>!!token&&scope()===token&&generation===epoch;},
  reload(){return perform(async session=>{record=null;const result=await request('GET',undefined,session);if(scope()!==session.token||epoch!==session.generation)throw Error('La sesión cambió');record=result;return peek();});},
  persist(value){return perform(async session=>{
   if(!record)throw Error('Recuperá primero tu carrera');
   const profile=cleanCareer(value),revision=record.revision;record=null;
   const saved=await request('PUT',{profile,revision},session);
   if(saved.revision!==revision+1||JSON.stringify(saved.profile)!==JSON.stringify(profile))throw Error('Guardado no confirmado');
   const confirmed=await request('GET',undefined,session);
   if(confirmed.revision!==saved.revision||JSON.stringify(confirmed.profile)!==JSON.stringify(profile))throw Error('Tu carrera cambió después del guardado');
   if(scope()!==session.token||epoch!==session.generation)throw Error('La sesión cambió');
   record=confirmed;return peek();
  });}
 });
}
