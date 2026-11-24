/** Candidate browser bridge; no automatic reads, migrations or storage. */
import {validateFavoriteMutation,validateFavoriteRow} from './apd-account-favorites-core.mjs';
export function createFavoriteClient({getToken,fetcher=fetch,base}){
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('API inválida');
 const endpoint=url.origin+'/api/account/favorites';
 let owner='',generation=0,record=null,busy=false;
 function reset(){generation++;record=null;busy=false;owner='';}
 function session(){const token=String(getToken()||'');if(token!==owner){reset();owner=token;}return {token,epoch:generation};}
 function ensure(s){const current=session();if(!s.token||current.token!==s.token||current.epoch!==s.epoch)throw Error('La sesión cambió');}
 function clone(){return record?{keys:[...record.keys],revision:record.revision}:null;}
 async function request(s,method,body){
  ensure(s);
  const r=await fetcher(endpoint,{method,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+s.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  ensure(s);
  const data=await r.json();ensure(s);
  if(!r.ok||data?.ok!==true)throw Error(r.status===409?'Los favoritos cambiaron. Volvé a cargar.':'No se pudo confirmar la operación. Volvé a consultar.');
  const value=data.favorites;
  if(value?.revision===0&&Array.isArray(value.keys)&&value.keys.length===0)return {keys:[],revision:0};
  if(!value)throw Error('Respuesta inválida');
  return validateFavoriteRow(value);
 }
 async function perform(fn){
  const s=session();if(!s.token)throw Error('Ingresá a tu cuenta');
  if(busy)throw Error('Operación en curso');
  busy=true;try{return await fn(s);}finally{if(s.epoch===generation)busy=false;}
 }
 return Object.freeze({
  reset,
  peek(){session();return clone();},
  reload(){return perform(async s=>{record=null;const value=await request(s,'GET');ensure(s);record=value;return clone();});},
  mutate(action,key){return perform(async s=>{
   if(!record)throw Error('Cargá primero tus favoritos');
   const payload=validateFavoriteMutation({action,key,revision:record.revision});
   const keys=new Set(record.keys);
   const changed=action==='add'?!keys.has(key):keys.has(key);
   if(action==='add')keys.add(key);else keys.delete(key);
   const expected=[...keys].sort(),revision=payload.revision+(changed?1:0);
   record=null; // Never retry ambiguous mutation with cached revision.
   const result=await request(s,'PUT',payload);ensure(s);
   if(result.revision!==revision||JSON.stringify(result.keys)!==JSON.stringify(expected))throw Error('Guardado no confirmado');
   const confirmed=await request(s,'GET');ensure(s);
   if(confirmed.revision!==result.revision||JSON.stringify(confirmed.keys)!==JSON.stringify(expected))throw Error('Los favoritos cambiaron después del guardado');
   record=confirmed;return clone();
  });}
 });
}
