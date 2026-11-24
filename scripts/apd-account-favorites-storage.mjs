/** Server-only candidate. Inject service-role credentials from Worker bindings, never browser. */
import {validateFavoriteRow} from './apd-account-favorites-core.mjs';
export function createFavoriteStorage({base,serviceKey,fetcher=(input,init)=>globalThis.fetch(input,init)}){
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||typeof serviceKey!=='string'||!serviceKey)throw Error('Storage configuration invalid');
 const endpoint=url.origin+'/rest/v1/user_favorite_offers';
 const headers={apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',Prefer:'return=representation'};
 function owner(id){
  if(typeof id!=='string'||id.length!==36||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw Error('Invalid owner');
  return id.toLowerCase();
 }
 function query(id,revision){
  const p=new URLSearchParams({select:'user_id,keys,revision'});
  if(id!==null)p.set('user_id','eq.'+id);
  if(revision!==undefined)p.set('revision','eq.'+revision);
  return endpoint+'?'+p;
 }
 async function rows(res,id){
  if(!res.ok)throw Error('Storage error');
  const values=await res.json();
  if(!Array.isArray(values)||values.length>1)throw Error('Invalid storage response');
  if(!values.length)return null;
  if(values[0]?.user_id!==id)throw Error('Owner mismatch');
  return validateFavoriteRow(values[0]);
 }
 const opts={headers,redirect:'manual',cache:'no-store'};
 return Object.freeze({
  async read(id){id=owner(id);return rows(await fetcher(query(id),{...opts,method:'GET'}),id);},
  async compareAndSet(id,{keys,revision}){
   id=owner(id);
   if(!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER)throw Error('Invalid revision');
   const next=validateFavoriteRow({keys,revision:revision+1});
   const insert=revision===0;
   const body={...next,updated_at:new Date().toISOString(),...(insert?{user_id:id}:{})};
   const res=await fetcher(insert?query(null):query(id,revision),{...opts,method:insert?'POST':'PATCH',body:JSON.stringify(body)});
   if(insert&&res.status===409){
    const err=await res.json();
    if(err?.code==='23505')return null;
    throw Error('Storage conflict not confirmed');
   }
   // A zero-row UPDATE is stale CAS; no automatic retry or merge.
   const result=await rows(res,id);
   if(insert&&result===null)throw Error('Insert not confirmed');
   if(result&&(result.revision!==next.revision||JSON.stringify(result.keys)!==JSON.stringify(next.keys)))throw Error('Write mismatch');
   return result;
  }
 });
}
