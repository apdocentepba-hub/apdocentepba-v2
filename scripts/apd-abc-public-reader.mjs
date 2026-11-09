// Official ABC APD public JSON reader for an EXPLICIT, bounded, read-only test.
// Not a production Worker route. No credentials, persistence, users or notifications.
import {ABC_PUBLIC_FIELDS} from './apd-scanner-compact-adapter.mjs';

const ENDPOINT='https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select';
const FIELD_LIST=ABC_PUBLIC_FIELDS.join(',');
const SORT='ult_movimiento desc,iddetalle asc';
const MAX_BYTES=1024*1024;

export function createAPDABCPublicPageReader({
 enabled=false,fetchImpl=globalThis.fetch,timeoutMs=12000
}={}){
 if(enabled!==true)throw Error('Public ABC live-read adapter disabled');
 if(typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>20000)
  throw Error('Invalid read-only transport configuration');
 return async function readPublicPage({
  district,query,sort,fields,start,rows,mode
 }={}){
  if(typeof district!=='string'||!/^[A-ZÁÉÍÓÚÑ ]{2,100}$/.test(district)||
     query!=='descdistrito:"'+district+'" AND estado:"Publicada"'||
     sort!==SORT||fields!==FIELD_LIST||mode!=='current_published'||
     !Number.isSafeInteger(start)||start<0||start>1500||
     !Number.isSafeInteger(rows)||rows<1||rows>150)
   throw Error('Unapproved ABC public query');
  const url=new URL(ENDPOINT);
  for(const [key,val] of Object.entries({
   q:query,sort,rows:String(rows),start:String(start),wt:'json',fl:fields
  }))url.searchParams.set(key,val);
  let response;
  try{
   response=await fetchImpl(url.toString(),{
    method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
    headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(timeoutMs)
   });
  }catch{
   throw Error('ABC public read request failed or timed out');
  }
  if(!response||response.ok!==true||response.redirected===true)
   throw Error('ABC public read refused by origin');
  const type=String(response.headers?.get?.('content-type')||'');
  if(!/^(application\/json|application\/[a-z0-9.+-]+\+json|text\/plain)(?:;|$)/i.test(type))
   throw Error('ABC returned an unexpected content type');
  if(!response.body||typeof response.body.getReader!=='function')
   throw Error('ABC response has no bounded stream');
  const reader=response.body.getReader();
  let total=0;
  const chunks=[];
  try {
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.byteLength;
    if(total>MAX_BYTES)throw Error('ABC public response over size limit');
    chunks.push(value);
   }
  }catch{
   await reader.cancel().catch(()=>{});
   throw Error('ABC public response incomplete or over size limit');
  }
  let packet;
  try{packet=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw Error('ABC public response not valid JSON');}
  if(!packet||typeof packet!=='object'||
     !packet.responseHeader||!packet.response)
   throw Error('ABC public response missing Solr envelope');
  // The scanner adapter independently checks every query parameter,
  // total, offset, field and repeated offer across both source passes.
  return packet;
 };
}
