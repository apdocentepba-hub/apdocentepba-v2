/** Server-side Expo HTTP transport. Not mounted in production.
 * No implicit fetch, no external URL arguments, no retries or redirect following.
 * Enhanced push security must be enabled separately in the Expo project.
 * The dispatch coordinator is responsible for durable authorization.
 */
const ORIGIN='https://exp.host/--/api/v2/push/';
const TOKEN=/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{16,200}\]$/;
const TICKET=/^[A-Za-z0-9_-]{8,200}$/;
const MAX=16384;
function validateMessage(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join(',')!=='body,channelId,data,priority,sound,title,to,ttl'||
 typeof p.to!=='string'||!TOKEN.test(p.to)||p.title!=='AlertasAPD'||
 p.body!=='Hay una nueva oportunidad docente. Consultá las ofertas vigentes.'||
 p.priority!=='high'||p.channelId!=='apd-alertas'||p.sound!=='default'||
 !Number.isInteger(p.ttl)||p.ttl<1||p.ttl>120||
 !p.data||Object.keys(p.data).join(',')!=='type'||p.data.type!=='apd_refresh')throw Error('invalid_expo_message');
}
export function createExpoHttpTransport({fetchImpl,accessToken,enabled=false,timeoutMs=5000}={}){
 if(enabled!==true||typeof fetchImpl!=='function'||typeof accessToken!=='string'||
 !/^[A-Za-z0-9_.~-]{20,512}$/.test(accessToken)||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)
 throw Error('expo_transport_disabled_or_unconfigured');
 async function post(route,body){
  const url=ORIGIN+route;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const r=await fetchImpl(url,{method:'POST',headers:{Authorization:'Bearer '+accessToken,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});
   if(!r||!Number.isInteger(r.status)||r.redirected===true||(r.url&&r.url!==url))throw Error('response_invalid');
   if(r.status!==200){try{await r.body?.cancel();}catch{}return {httpStatus:r.status,body:null};}
   if(!/^application\/json(?:\s*;|$)/i.test(r.headers?.get('content-type')||''))throw Error('response_invalid');
   const reader=r.body?.getReader();if(!reader)throw Error('response_invalid');
   let n=0;const decoder=new TextDecoder('utf-8',{fatal:true});let text='';
   try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>MAX){await reader.cancel();throw Error('response_too_large');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
   finally{reader.releaseLock();}
   const value=JSON.parse(text);
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error('response_invalid');
   return {httpStatus:200,body:value};
  }catch{throw Error('expo_transport_outcome_unknown');}finally{clearTimeout(timer);}
 }
 return Object.freeze({
  async submit(payload){validateMessage(payload);return post('send',payload);},
  async getReceipts(ids){
   if(!Array.isArray(ids)||ids.length<1||ids.length>10||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'||!TICKET.test(x)))throw Error('invalid_receipt_ids');
   return post('getReceipts',{ids});
  }
 });
}
