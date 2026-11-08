/**
 * APDocentePBA — strict HTTP inbox sync contract (offline Worker LAB).
 * There is NO live router import or deploy. Auth/session is always checked
 * server-side, user/account ID is NEVER accepted from request parameters.
 */
import {verifyStrictMobileSession}
 from './mobile-push-strict-session-lab.mjs';
const BASE='/api/mobile/inbox';
const json=(body,status=200)=>Response.json(body,{status,headers:{
 'Cache-Control':'no-store','Vary':'Authorization',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'
}});
const int=(s,min,max)=>typeof s==='string'&&/^(0|[1-9][0-9]{0,5})$/.test(s)&&
 Number.isSafeInteger(Number(s))&&Number(s)>=min&&Number(s)<=max?
 Number(s):null;
const exact=(x,fields)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).length===fields.length&&
 fields.every(k=>Object.prototype.hasOwnProperty.call(x,k));
export function createMobileInboxSyncHandlerLab({
 loadSessionByToken,loadUserById,repository
}={}){
 if(typeof loadSessionByToken!=='function'||typeof loadUserById!=='function'||
    typeof repository?.listPage!=='function'||
    typeof repository?.acknowledgeRead!=='function')
  throw Error('missing_inbox_sync_dependencies');
 return async function handle(request){
  try{
   if(!request||typeof request.method!=='string'||!request.url||
      typeof request.headers?.get!=='function')
    return json({ok:false,error:'invalid_request'},400);
   const url=new URL(request.url);
   const isBase=url.pathname===BASE;
   const isRead=url.pathname===BASE+'/read';
   if(!isBase&&!isRead)return json({ok:false,error:'not_found'},404);
   if((isBase&&request.method!=='GET')||
      (isRead&&request.method!=='POST'))
    return json({ok:false,error:'method_not_allowed'},405);
   const actor=await verifyStrictMobileSession({
    authorization:request.headers.get('Authorization'),
    loadSessionByToken,loadUserById
   });
   if(!actor)return json({ok:false,error:'unauthenticated'},401);
   if(isBase){
    if([...url.searchParams.keys()].some(k=>!['after','limit'].includes(k))||
       url.searchParams.getAll('after').length>1||
       url.searchParams.getAll('limit').length>1)
     return json({ok:false,error:'invalid_page'},400);
    const after=int(url.searchParams.get('after')??'0',0,100000);
    const limit=int(url.searchParams.get('limit')??'5',1,20);
    if(after===null||limit===null)
     return json({ok:false,error:'invalid_page'},400);
    let page;
    try{page=await repository.listPage({actor,after,limit});}
    catch(error){
     if(error?.message==='invalid_inbox_page')
      return json({ok:false,error:'invalid_page'},400);
     return json({ok:false,error:'service_unavailable'},503);
    }
    // Exact fields are deliberately synthetic (no name, token, IDs or PII).
    if(!exact(page,['version','fromCursor','nextCursor','hasMore','events'])||
       page.version!==1||page.fromCursor!==after||
       !Number.isSafeInteger(page.nextCursor)||
       !Array.isArray(page.events)||page.events.length>limit||
       typeof page.hasMore!=='boolean')
     return json({ok:false,error:'service_unavailable'},503);
    return json({ok:true,...page});
   }
   if(url.search)return json({ok:false,error:'invalid_request'},400);
   if(!/^application\/json(?:;|$)/i.test(
      request.headers.get('Content-Type')??''))
    return json({ok:false,error:'invalid_payload'},415);
   const length=request.headers.get('Content-Length');
   if(length!==null&&(int(length,0,512)===null))
    return json({ok:false,error:'invalid_payload'},413);
   const raw=await request.text();
   if(new TextEncoder().encode(raw).length>512)
    return json({ok:false,error:'invalid_payload'},413);
   let payload;
   try{payload=JSON.parse(raw);}
   catch{return json({ok:false,error:'invalid_json'},400);}
   if(!exact(payload,['id','revision'])||
      typeof payload.id!=='string'||
      !/^DEMO-AVISO-00[1-4]$/.test(payload.id)||
      !Number.isInteger(payload.revision)||
      payload.revision<1||payload.revision>100000)
    return json({ok:false,error:'invalid_payload'},400);
   const result=await repository.acknowledgeRead({
    actor,id:payload.id,revision:payload.revision
   });
   if(!result||typeof result!=='object')
    return json({ok:false,error:'service_unavailable'},503);
   if(result.accepted!==true){
    if(result.reason==='stale_revision')
     return json({ok:false,error:'stale_revision'},409);
    return json({ok:false,error:'not_found'},404);
   }
   if(typeof result.alreadyRead!=='boolean'||result.read!==true||
      !Number.isSafeInteger(result.cursor))
    return json({ok:false,error:'service_unavailable'},503);
   return json({
    ok:true,ack:{
     id:payload.id,revision:payload.revision,read:true,
     alreadyRead:result.alreadyRead,cursor:result.cursor
    }
   });
  }catch{
   // Never expose server errors or session token.
   return json({ok:false,error:'service_unavailable'},503);
  }
 };
}
