/** Private client: no browser persistence and no optimistic mutations. */
import {validateDiaryRow,validateDiaryMutation} from './apd-account-diary-core.mjs';
export function createDiaryClient({getToken,fetcher=(input,init)=>globalThis.fetch(input,init),base}){
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('API inválida');
 const endpoint=url.origin+'/api/account/application-diary';
 let owner='',epoch=0,record=null,busy=false;
 function reset(){epoch++;owner='';record=null;busy=false;}
 function session(){const token=String(getToken()||'');if(token!==owner){reset();owner=token;}return {token,epoch};}
 function ensure(s){const current=session();if(!s.token||s.token!==current.token||s.epoch!==current.epoch)throw Error('La sesión cambió');}
 function clone(){return record?{revision:record.revision,entries:record.entries.map(e=>({...e}))}:null;}
 async function request(s,method,body){
  ensure(s);
  const r=await fetcher(endpoint,{method,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+s.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  ensure(s);const data=await r.json();ensure(s);
  if(!r.ok||data?.ok!==true)throw Error(r.status===409?'El registro cambió. Volvé a cargar.':'No se pudo confirmar la operación. Volvé a consultar.');
  if(data.diary?.revision===0&&Array.isArray(data.diary.entries)&&data.diary.entries.length===0)return {entries:[],revision:0};
  if(!data.diary)throw Error('Respuesta inválida');
  return validateDiaryRow(data.diary);
 }
 async function perform(fn){
  const s=session();if(!s.token)throw Error('Ingresá a tu cuenta');
  if(busy)throw Error('Operación en curso');busy=true;
  try{return await fn(s);}finally{if(s.epoch===epoch)busy=false;}
 }
 return Object.freeze({
  reset,peek(){session();return clone();},
  reload(){return perform(async s=>{record=null;const v=await request(s,'GET');ensure(s);record=v;return clone();});},
  mutate(action,key,status){return perform(async s=>{
   if(!record)throw Error('Cargá primero tus postulaciones');
   const payload=validateDiaryMutation({action,key,revision:record.revision,...(action==='set'?{status}:{})});
   const previous=record,old=previous.entries.find(e=>e.key===key);
   const changed=action==='remove'?!!old:old?.status!==status;
   const expected=new Map(previous.entries.map(e=>[e.key,e]));
   if(action==='remove')expected.delete(key);
   else if(changed)expected.set(key,{key,status,origin:'self_reported'});
   record=null;
   const result=await request(s,'PUT',payload);ensure(s);
   if(result.revision!==previous.revision+(changed?1:0)||result.entries.length!==expected.size)throw Error('Guardado no confirmado');
   for(const e of result.entries){const want=expected.get(e.key);if(!want||want.status!==e.status||want.origin!==e.origin||want.updatedAt&&want.updatedAt!==e.updatedAt)throw Error('Guardado no confirmado');}
   const confirmed=await request(s,'GET');ensure(s);
   if(confirmed.revision!==result.revision||JSON.stringify(confirmed.entries)!==JSON.stringify(result.entries))throw Error('El registro cambió después del guardado');
   record=confirmed;return clone();
  });}
 });
}
