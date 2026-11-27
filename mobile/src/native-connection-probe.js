/** Credential-free connectivity diagnostic. Never authenticates, reads personal
 * data, or enables login. Explicit caller action only; fixed GET routes.
 */
const ORIGIN="https://ancient-wildflower-cd37.apdocentepba.workers.dev";
const routes=Object.freeze([["/api/version",200],["/api/account/profile",401],["/api/account/preferences",401],["/api/mis-alertas",401]]);
async function runNativeConnectionProbe({fetchImpl,enabled=false}={}){
 if(enabled!==true||typeof fetchImpl!=="function")throw Error("probe_disabled");
 const checks=[];
 for(const [path,expected] of routes){
  const url=ORIGIN+path;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await fetchImpl(url,{method:"GET",headers:{Accept:"application/json"},credentials:"omit",redirect:"error",cache:"no-store",signal:controller.signal});
   const ok=response?.url===url&&response.redirected!==true&&response.status===expected;
   // Never read or expose the body, even if an endpoint is accidentally public.
   try{await response?.body?.cancel();}catch{}
   checks.push({path,expected,status:Number.isInteger(response?.status)?response.status:null,ok});
  }catch{checks.push({path,expected,status:null,ok:false});}
  finally{clearTimeout(timer);}
 }
 return {ok:checks.every(c=>c.ok),checks,credentialsSent:false,redirectRejectionCertified:false,loginEnabled:false};
}
module.exports={runNativeConnectionProbe};
