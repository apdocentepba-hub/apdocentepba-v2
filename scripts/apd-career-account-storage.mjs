/** Worker-only adapter; service credential never leaves backend. */
import {cleanCareer,validateCareerRecord} from './apd-career-account-core.mjs';

function createAccountRest({base,serviceKey,fetcher=(url,init)=>globalThis.fetch(url,init)}){
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||typeof serviceKey!=='string'||!serviceKey)throw Error('Invalid storage configuration');
 const owner=id=>{if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid owner');return id.toLowerCase();};
 const headers={apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
 // workerd accepts manual redirects. The status check rejects every 3xx.
 const opts={headers,redirect:'manual',cache:'no-store',signal:undefined};
 async function rows(path,init){
  const response=await fetcher(url.origin+'/rest/v1/'+path,{...opts,...init,signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Storage unavailable');
  const data=await response.json();if(!Array.isArray(data)||data.length>1)throw Error('Unexpected storage response');return data;
 }
 return {owner,rows};
}

export function createCareerStorage(options){
 const {owner,rows}=createAccountRest(options);
 return Object.freeze({
  async read(id){
   id=owner(id);
   const q=new URLSearchParams({select:'user_id,profile,revision',user_id:'eq.'+id,limit:'2'});
   const [row]=await rows('user_career_profile?'+q,{method:'GET'});
   if(!row)return null;
   if(row.user_id!==id)throw Error('Owner mismatch');
   return validateCareerRecord({profile:row.profile,revision:row.revision});
  },
  async compareAndSet(id,{profile,revision}){
   id=owner(id);profile=cleanCareer(profile);
   if(!Number.isInteger(revision)||revision<0||revision>=2147483647)throw Error('Invalid revision');
   const [row]=await rows('rpc/apd_career_profile_cas',{method:'POST',body:JSON.stringify({p_user:id,p_profile:profile,p_revision:revision})});
   if(!row)return null;
   const result=validateCareerRecord(row);
   if(result.revision!==revision+1||JSON.stringify(result.profile)!==JSON.stringify(profile))throw Error('Unconfirmed storage');
   return result;
  }
 });
}
