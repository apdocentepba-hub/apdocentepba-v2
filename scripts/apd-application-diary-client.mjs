import {normalizeApplicationEntries} from './apd-application-diary.mjs';

export function createApplicationDiaryClient({base,fetcher=fetch,getToken}){
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('API inválida');
 const endpoint=url.origin+'/api/account/application-diary';
 let generation=0;
 async function request(mutation){
  const token=getToken(),epoch=generation;
  if(!token)throw Error('La sesión cambió');
  const response=await fetcher(endpoint,{
   method:mutation?'PUT':'GET',credentials:'omit',cache:'no-store',redirect:'error',
   referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000),
   headers:{Authorization:'Bearer '+token,...(mutation?{'Content-Type':'application/json'}:{})},
   ...(mutation?{body:JSON.stringify(mutation)}:{})
  });
  if(response.status===409)throw Error('El registro cambió. Volvé a cargarlo.');
  if(!response.ok)throw Error('No se pudo confirmar la operación. Volvé a cargar el registro.');
  const data=await response.json();
  if(epoch!==generation||getToken()!==token)throw Error('La sesión cambió');
  const row=data?.diary;
  if(data?.ok!==true||!row||!Number.isInteger(row.revision)||row.revision<0||row.revision>2147483647||
    (row.revision===0&&row.entries?.length!==0))throw Error('Respuesta inválida');
  const entries=[...normalizeApplicationEntries(row.entries).values()];
  if(mutation){
   const found=entries.find(entry=>entry.key===mutation.key);
   if(row.revision<mutation.revision||row.revision>mutation.revision+1||
     (mutation.action==='set'&&found?.status!==mutation.status)||(mutation.action==='remove'&&found))
    throw Error('Guardado sin confirmar. Volvé a cargar el registro.');
  }
  return {revision:row.revision,entries};
 }
 return Object.freeze({reload:()=>request(),mutate:request,reset(){generation++;}});
}
