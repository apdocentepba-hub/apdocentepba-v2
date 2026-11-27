/** Fixed-origin transport for the future Android pilot. Explicitly injected fetch.
 * Native redirect behavior must be verified on device before real credentials.
 * Not enabled in the offline App.js or any build configuration.
 */
const ORIGIN="https://ancient-wildflower-cd37.apdocentepba.workers.dev";
const permitted=(method,path)=>
 (method==="POST"&&["/api/login","/api/account/logout"].includes(path))||
 (method==="GET"&&["/api/account/profile","/api/account/preferences","/api/mis-alertas","/api/mobile/devices"].includes(path))||
 (method==="POST"&&path==="/api/mobile/devices")||
 (method==="DELETE"&&/^\/api\/mobile\/devices\/[0-9a-f-]{36}$/i.test(path));
function createNativeWorkerTransport({fetchImpl,enabled=false}={}){
 if(typeof fetchImpl!=="function"||enabled!==true)throw Error("pilot_not_enabled");
 return async function request({method="GET",path,bearer,body}={}){
  if(!permitted(method,path))throw Error("route_not_allowed");
  const login=path==="/api/login";
  if(login?bearer!==undefined:typeof bearer!=="string"||!/^[a-f0-9]{64}$/i.test(bearer))throw Error("invalid_session");
  if((method==="POST")!==!!body)throw Error("invalid_body");
  const headers={Accept:"application/json",...(body?{"Content-Type":"application/json"}:{}),...(bearer?{Authorization:"Bearer "+bearer}:{})};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetchImpl(ORIGIN+path,{method,headers,credentials:"omit",redirect:"error",cache:"no-store",signal:controller.signal,...(body?{body:JSON.stringify(body)}:{})});
   if(response.redirected===true||response.url!==ORIGIN+path)throw Error("unexpected_response_origin");
   if(response.status===401)return {status:401,data:null};
   if(!response.ok)return {status:response.status,data:null};
   const mime=response.headers?.get("content-type")||"";
   if(!/^application\/json(?:\s*;|$)/i.test(mime))throw Error("invalid_response");
   const raw=await response.text();if(raw.length>4000000)throw Error("response_too_large");
   return {status:response.status,data:JSON.parse(raw)};
  }finally{clearTimeout(timer);}
 };
}
module.exports={createNativeWorkerTransport,ORIGIN};
