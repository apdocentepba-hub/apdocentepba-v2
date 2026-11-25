// Temporary Cloudflare QA only. Never deploy this guard to the production account.
const diary='/api/account/application-diary';
const hex=/^[a-f0-9]{64}$/;
const tunnel=/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;
const deny=(status,stage)=>new Response(null,{status,headers:{'Cache-Control':'no-store','X-APD-QA-Stage':stage}});
function eq(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let mismatch=0;
 for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 return mismatch===0;
}
export function wrapDiaryQA(worker,{now=Date.now}={}){
 if(typeof worker?.fetch!=='function')throw Error('Missing Worker');
 return Object.freeze({
  async fetch(request,env){
   const expires=Number(env.APD_QA_EXPIRES_MS),started=Number(env.APD_QA_START_MS),current=now();
   if(!Number.isSafeInteger(started)||!Number.isSafeInteger(expires)||expires<=current||
      started>current||expires-started>15*60*1000||expires<=started||
      !hex.test(env.APD_QA_ACCESS_KEY||'')||!hex.test(env.APD_QA_DB_KEY||'')||
      env.APD_QA_ACCESS_KEY===env.APD_QA_DB_KEY||!tunnel.test(env.APD_QA_DB_URL||''))return deny(503,'configuration');
   if(!eq(request.headers.get('X-APD-QA-Key'),env.APD_QA_ACCESS_KEY))return deny(404,'guard');
   const url=new URL(request.url);
   if(url.pathname!==diary||url.search||!['GET','PUT','OPTIONS'].includes(request.method))return deny(404,'guard');
   const headers=new Headers(request.headers);
   headers.delete('X-APD-QA-Key');
   const req=new Request(request,{headers});
   // Explicitly reconstruct the environment. No production bindings, cron or ctx delegation.
   const isolated=Object.freeze({SUPABASE_URL:env.APD_QA_DB_URL,SUPABASE_SERVICE_ROLE_KEY:env.APD_QA_DB_KEY});
   const response=await worker.fetch(req,isolated,{waitUntil(){throw Error('Background execution prohibited in QA');}});
   const responseHeaders=new Headers(response.headers);
   responseHeaders.set('X-APD-QA-Stage','application');
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers:responseHeaders});
  }
 });
}
