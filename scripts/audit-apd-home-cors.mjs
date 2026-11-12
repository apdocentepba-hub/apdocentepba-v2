/**
 * HTTP-level CORS preflight auditor for the APD account/home endpoint.
 * Only GET with an invalid bearer and OPTIONS requests: never writes data.
 * Explicitly reports whether a browser can issue PUT and DELETE requests.
 */
const WORKER='https://ancient-wildflower-cd37.apdocentepba.workers.dev';
const ORIGIN='https://alertasapd.com.ar';
const PATH='/api/account/home';
const methods=['GET','PUT','DELETE'];
const attempts=[];
for(const method of methods){
 const response=await fetch(WORKER+PATH,{
  method:'OPTIONS',headers:{
   Origin:ORIGIN,
   'Access-Control-Request-Method':method,
   'Access-Control-Request-Headers':method==='GET'?'authorization':'authorization,content-type'
  },redirect:'manual',signal:AbortSignal.timeout(18000)
 });
 const origin=response.headers.get('access-control-allow-origin')||'';
 const allowed=(response.headers.get('access-control-allow-methods')||'')
  .split(',').map(s=>s.trim().toUpperCase());
 const headers=(response.headers.get('access-control-allow-headers')||'')
  .split(',').map(s=>s.trim().toLowerCase());
 const passed=response.ok&&(origin==='*'||origin===ORIGIN)&&
  allowed.includes(method)&&headers.includes('authorization')&&
  (method==='GET'||headers.includes('content-type'));
 const item={method,status:response.status,origin,allowed,headers,passed};
 attempts.push(item);
 console.log('APD_ACCOUNT_HOME_CORS_PREFLIGHT '+JSON.stringify(item));
 await response.body?.cancel();
}
const get=await fetch(WORKER+PATH,{
 method:'GET',headers:{Origin:ORIGIN,Authorization:'Bearer invalid-qa-only'},
 redirect:'manual',signal:AbortSignal.timeout(18000)
});
const getOrigin=get.headers.get('access-control-allow-origin')||'';
console.log('APD_ACCOUNT_HOME_CORS_GET '+JSON.stringify({
 status:get.status,allowOrigin:getOrigin,
 passed:get.status===401&&(getOrigin==='*'||getOrigin===ORIGIN)
}));
await get.body?.cancel();
const failed=attempts.filter(x=>!x.passed).map(x=>x.method);
console.log('APD_ACCOUNT_HOME_CORS_SUMMARY '+JSON.stringify({
 missingMethods:failed,
 noUserDataAccess:true,accessType:'public anonymous CORS preflight diagnostics',
 writeMethodsExecuted:false
}));
if(process.argv.includes('--require-correct')&&
  (failed.length||get.status!==401||(getOrigin!=='*'&&getOrigin!==ORIGIN)))
 throw Error('Browser account/home CORS is not ready for required methods');
