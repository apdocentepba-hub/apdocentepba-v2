/**
 * Cloudflare Worker-compatible API route contract for mobile device management.
 * LAB ONLY: no actual Worker import, database, FCM, Supabase or live writes.
 * Inject strict auth, plan and device repository. Sessions must come from server.
 */
import {verifyStrictMobileSession} from "./mobile-push-strict-session-lab.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(value,status=200)=>Response.json(value,{
 status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
const noTokenFields=o=>o?{
 id:o.id,platform:o.platform,transport:o.transport,
 enabled:o.enabled===true,opted_in:o.opted_in===true
}:null;

export function createMobilePushDeviceHandlerLab({
 loadSessionByToken,loadUserById,loadPlanByUserId,registry
}={}){
 if(typeof loadSessionByToken!=="function"||
    typeof loadUserById!=="function"||
    typeof loadPlanByUserId!=="function"||
    !registry||typeof registry.register!=="function"||
    typeof registry.revoke!=="function"||
    typeof registry.listForUser!=="function")
  throw Error("missing_server_dependencies");
 return async function handle(request){
  try{
   if(!request||typeof request.method!=="string"||!request.url)
    return json({ok:false,error:"invalid_request"},400);
   const url=new URL(request.url);
   const root="/api/mobile/devices";
   if(url.pathname!==root&&!url.pathname.startsWith(root+"/"))
    return json({ok:false,error:"not_found"},404);
   if(!["GET","POST","DELETE"].includes(request.method))
    return json({ok:false,error:"method_not_allowed"},405);
   const actor=await verifyStrictMobileSession({
    authorization:request.headers.get("Authorization"),
    loadSessionByToken,loadUserById
   });
   if(!actor)return json({ok:false,error:"unauthenticated"},401);
   const nested=url.pathname.startsWith(root+"/");
   if(request.method==="GET"&&!nested){
    const rows=registry.listForUser({actor});
    return json({ok:true,devices:rows.map(noTokenFields)});
   }
   if(request.method==="POST"&&!nested){
    const plan=await loadPlanByUserId(actor.userId);
    if(!plan||plan.access_active!==true)
     return json({ok:false,error:"plan_not_verified"},403);
    const contentLength=Number(request.headers.get("content-length")??0);
    if(!Number.isFinite(contentLength)||contentLength>4096||contentLength<0)
     return json({ok:false,error:"invalid_payload"},413);
    const text=await request.text();
    if(new TextEncoder().encode(text).length>4096)
     return json({ok:false,error:"invalid_payload"},413);
    let body;
    try{body=JSON.parse(text);}catch{return json({ok:false,error:"invalid_json"},400);}
    if(!body||typeof body!=="object"||Array.isArray(body))
     return json({ok:false,error:"invalid_payload"},400);
    if("user_id" in body&&body.user_id!==actor.userId)
     return json({ok:false,error:"invalid_payload"},400);
    try{
     const device=registry.register({actor,request:body});
     return json({ok:true,device:noTokenFields(device)},201);
    }catch{
     return json({ok:false,error:"invalid_device"},400);
    }
   }
   if(request.method==="DELETE"&&nested){
    const id=url.pathname.slice(root.length+1);
    if(!UUID.test(id)||id.includes("/"))
     return json({ok:false,error:"not_found"},404);
    // Revoke only owned device; do not reveal presence of foreign IDs.
    if(typeof registry.getForUser!=="function"||
       !registry.getForUser({actor,deviceId:id}))
     return json({ok:false,error:"not_found"},404);
    try{
     registry.revoke({actor,deviceId:id});
     return json({ok:true,revoked:true});
    }catch{
     return json({ok:false,error:"not_found"},404);
    }
   }
   return json({ok:false,error:"method_not_allowed"},405);
  }catch{
   // Never echo bearer, push token, SQL errors or internal exception details.
   return json({ok:false,error:"service_unavailable"},503);
  }
 };
}
