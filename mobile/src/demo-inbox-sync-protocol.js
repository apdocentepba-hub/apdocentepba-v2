"use strict";
/**
 * APDocentePBA — validated server-page → offline demo inbox adapter.
 * No fetch, auth token, connection, push provider or user data. A real
 * account-bound inbox must NOT use AsyncStorage or this demo allowlist.
 */
const {
 applyServerDemoBatch,markDemoInboxRead,ALLOWLIST
}=require("./demo-inbox.js");
const valid=new Map(ALLOWLIST.map(x=>[x.id,x.offerId]));
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const keys=(x,fields)=>x&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).length===fields.length&&fields.every(k=>own(x,k));
const number=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000;
function applyServerDemoPage(state,page){
 if(!keys(page,["version","fromCursor","nextCursor","hasMore","events"])||
    page.version!==1||!number(page.fromCursor)||!number(page.nextCursor)||
    !Array.isArray(page.events)||page.events.length>20||
    typeof page.hasMore!=="boolean")
  throw Error("invalid_demo_inbox_page");
 // We NEVER skip a missing cursor because it might contain a cancellation.
 if(page.fromCursor!==state.cursor)
  throw Error("demo_inbox_cursor_mismatch");
 let draft=state,position=state.cursor;
 for(const event of page.events){
  if(!keys(event,["cursor","kind","id","offerId","revision","status","read"])||
     !number(event.cursor)||event.cursor!==position+1||
     !valid.has(event.id)||valid.get(event.id)!==event.offerId||
     !number(event.revision)||event.revision<1||
     !["active","cancelled"].includes(event.status)||
     typeof event.read!=="boolean"||
     !["event","read"].includes(event.kind))
   throw Error("invalid_demo_inbox_page_event");
  if(event.kind==="read"){
   const existing=draft.items.find(x=>x.id===event.id);
   if(!existing||existing.status!=="active"||
      event.status!=="active"||event.read!==true||
      existing.revision!==event.revision)
    throw Error("invalid_demo_remote_read_event");
   const changed=markDemoInboxRead(draft,event.id);
   draft={...changed,cursor:event.cursor};
  }else{
   if(event.status==="cancelled"&&event.read!==true)
    throw Error("invalid_demo_remote_cancel");
   // New active events are not proof of a mobile push delivery.
   draft=applyServerDemoBatch(draft,{
    cursor:event.cursor,
    events:[{id:event.id,offerId:event.offerId,
     revision:event.revision,status:event.status}]
   });
   if(event.read&&event.status==="active")
    draft=markDemoInboxRead(draft,event.id);
  }
  position=event.cursor;
 }
 if(page.nextCursor!==position||
    (page.events.length===0&&page.hasMore))
  throw Error("invalid_demo_inbox_page_termination");
 return draft;
}
module.exports={applyServerDemoPage};
