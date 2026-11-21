/* Public APDocentePBA static entrypoint measurement. READ ONLY.
 * Only up to 8 unauthenticated GETs to one pinned origin, no cookies/tokens.
 * Measures public HTML + selected scripts/CSS, NOT logged-in alert latency.
 */
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {pathToFileURL} from "node:url";

const ORIGIN="https://alertasapd.com.ar";
const ALLOWED=[
 {name:"document",path:"/",type:/text\/html/i,maxBytes:400_000},
 {name:"app_v2.js",type:/(?:javascript|ecmascript)/i,maxBytes:1_000_000},
 {name:"auth_session_patch.js",type:/(?:javascript|ecmascript)/i,maxBytes:400_000},
 {name:"styles.css",type:/text\/css/i,maxBytes:600_000}
];
const CACHE_TRIALS=2,MAX_BODY=1_000_000;
function extractAssetHref(html,name){
 const pattern=name.endsWith(".css")
  ? /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi
  : /<script\b[^>]*src=["'][^"']+["'][^>]*><\/script>/gi;
 const found=[];
 for(const result of html.matchAll(pattern)){
  const attrs=result[0];
  const m=attrs.match(name.endsWith(".css")
   ? /\bhref=["']([^"']+)["']/i : /\bsrc=["']([^"']+)["']/i);
  if(!m)continue;
  const raw=m[1];
  if(raw.split(/[?#]/)[0].replace(/^\.\//,"")===name)found.push(raw);
 }
 if(found.length!==1)throw Error("Critical static asset missing or ambiguous: "+name);
 const parsed=new URL(found[0],ORIGIN+"/");
 if(parsed.origin!==ORIGIN || parsed.protocol!=="https:" ||
    parsed.username || parsed.password || !parsed.pathname.endsWith("/"+name) ||
    parsed.pathname.slice(1).includes("/") || parsed.hash)
  throw Error("Critical asset URL outside pinned public origin: "+name);
 return parsed;
}
async function download({name,url,type,maxBytes},fetchImpl,now){
 const started=now();
 let response;
 try{
  response=await fetchImpl(url.href,{
   method:"GET",headers:{Accept:name==="document"?"text/html":
    name.endsWith(".css")?"text/css":"text/javascript,application/javascript"},
   redirect:"error",cache:"no-store",credentials:"omit",
   referrerPolicy:"no-referrer",signal:AbortSignal.timeout(12_000)
  });
 }catch(error){
  throw Error("Public GET failed for "+name+" (network/redirect/timeout)");
 }
 const ttfb=now()-started;
 if(response.status!==200||!response.ok)
  throw Error("Public "+name+" HTTP "+response.status+"; no false success");
 const mime=response.headers.get("content-type")||"";
 if(!type.test(mime))throw Error("Unexpected MIME for "+name);
 const len=Number(response.headers.get("content-length"));
 if(Number.isFinite(len)&&len>maxBytes)throw Error("Asset too large: "+name);
 if(!response.body||typeof response.body.getReader!=="function")
  throw Error("Missing response stream for "+name);
 const reader=response.body.getReader();
 let size=0;
 const parts=[];
 try{
  while(true){
   const item=await reader.read();
   if(item.done)break;
   size+=item.value.byteLength;
   if(size>maxBytes){await reader.cancel();throw Error("Asset too large: "+name);}
   if(name==="document")parts.push(item.value);
  }
 }finally{reader.releaseLock();}
 const elapsed=now()-started;
 const html=name==="document"?new TextDecoder().decode(
  Uint8Array.from(parts.flatMap(bytes=>Array.from(bytes)))):null;
 if(name==="document"&&(!html.includes("APDocentePBA")||
   !/id=["']login["']/.test(html)))throw Error("Public landing markup unrecognized");
 return {name,ttfb_ms:Math.round(ttfb*10)/10,
  total_ms:Math.round(elapsed*10)/10,bytes:size,html};
}
export async function probePublicEntrypoint({
 fetchImpl=fetch,now=()=>performance.now(),trials=CACHE_TRIALS
}={}){
 if(trials!==2)throw Error("Exactly two bounded public measurements required");
 const readings=Object.fromEntries(ALLOWED.map(x=>[x.name,[]]));
 const checked=[];
 for(let trial=0;trial<trials;trial++){
  const page=await download({...ALLOWED[0],url:new URL("/",ORIGIN)},fetchImpl,now);
  readings.document.push(page);
  // The page itself determines the three critical pinned same-origin asset URLs.
  for(const item of ALLOWED.slice(1)){
   const url=extractAssetHref(page.html,item.name);
   const metric=await download({...item,url},fetchImpl,now);
   readings[item.name].push(metric);
  }
  checked.push(trial+1);
 }
 const assets=Object.fromEntries(ALLOWED.map(({name})=>{
  const samples=readings[name];
  return [name,{
   trials:samples.length,bytes_min:Math.min(...samples.map(s=>s.bytes)),
   bytes_max:Math.max(...samples.map(s=>s.bytes)),
   ttfb_min_ms:Math.min(...samples.map(s=>s.ttfb_ms)),
   ttfb_max_ms:Math.max(...samples.map(s=>s.ttfb_ms)),
   total_min_ms:Math.min(...samples.map(s=>s.total_ms)),
   total_max_ms:Math.max(...samples.map(s=>s.total_ms))
  }];
 }));
 return {
  proof:"public_entrypoint_static_network_baseline",
  origin:ORIGIN,method:"GET",public_only:true,
  request_count:checked.length*ALLOWED.length,
  assets,
  user_authentication_used:false,no_cookies_or_tokens:true,
  no_browser_paint_measured:true,
  no_authenticated_alert_endpoint_measured:true,
  production_modified:false
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await probePublicEntrypoint();
 console.log(JSON.stringify(result));
}
