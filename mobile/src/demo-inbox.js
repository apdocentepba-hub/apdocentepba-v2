"use strict";
/**
 * APDocentePBA Android — versioned, offline-only inbox synchronization lab.
 * No network, session, provider, person, district address or external IDs.
 * This module allows ONLY four hard-coded fictional event/offer references.
 * AsyncStorage is unencrypted: never persist personal data or live messages.
 */
const {DEMO_OFFERS}=require("./demo-state.js");
const VERSION=1;
const MAX_ITEMS=4;
const STORAGE_KEY="apd.demo.inbox.v1";
const ALLOWLIST=Object.freeze(DEMO_OFFERS.map((offer,i)=>Object.freeze({
 id:"DEMO-AVISO-"+String(i+1).padStart(3,"0"),offerId:offer.id
})));
const allow=new Map(ALLOWLIST.map(item=>[item.id,item.offerId]));
const STATUSES=new Set(["active","cancelled"]);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const emptyInbox=()=>({version:VERSION,cursor:0,items:[]});
function exactKeys(record,keys){
 return record&&typeof record==="object"&&!Array.isArray(record)&&
  Object.keys(record).length===keys.length&&
  keys.every(key=>own(record,key));
}
function validItem(item){
 return exactKeys(item,["id","offerId","revision","status","read"])&&
  allow.get(item.id)===item.offerId&&
  Number.isSafeInteger(item.revision)&&item.revision>=1&&
  item.revision<=100000&&STATUSES.has(item.status)&&
  typeof item.read==="boolean";
}
function validateInbox(state){
 if(!exactKeys(state,["version","cursor","items"])||
    state.version!==VERSION||!Number.isSafeInteger(state.cursor)||
    state.cursor<0||state.cursor>100000||!Array.isArray(state.items)||
    state.items.length>MAX_ITEMS)throw Error("invalid_demo_inbox_snapshot");
 const seen=new Set();
 for(const item of state.items){
  if(!validItem(item)||seen.has(item.id))
   throw Error("invalid_demo_inbox_snapshot");
  seen.add(item.id);
 }
 if(state.cursor===0&&state.items.length)
  throw Error("invalid_demo_inbox_snapshot");
 return state;
}
function restoreInbox(text){
 if(text===null)return emptyInbox();
 if(typeof text!=="string"||text.length>4096)
  throw Error("invalid_demo_inbox_snapshot");
 let parsed;
 try{parsed=JSON.parse(text);}catch{throw Error("invalid_demo_inbox_snapshot");}
 const valid=validateInbox(parsed);
 // Reconstruct exact fields: never carry injected properties to UI/storage.
 return {
  version:VERSION,cursor:valid.cursor,
  items:valid.items.map(i=>({
   id:i.id,offerId:i.offerId,revision:i.revision,
   status:i.status,read:i.read
  }))
 };
}
function freezeView(state){
 return Object.freeze({
  version:state.version,cursor:state.cursor,
  items:Object.freeze(state.items.map(i=>Object.freeze({...i})))
 });
}
function applyServerDemoBatch(state,batch){
 validateInbox(state);
 if(!exactKeys(batch,["cursor","events"])||
    !Number.isSafeInteger(batch.cursor)||batch.cursor<1||
    !Array.isArray(batch.events)||batch.events.length>MAX_ITEMS)
  throw Error("invalid_demo_sync_batch");
 if(batch.cursor<=state.cursor)return state; // replay or stale update
 if(batch.cursor!==state.cursor+1)throw Error("missing_demo_sync_cursor");
 const next=state.items.map(i=>({...i}));
 const seen=new Set();
 for(const event of batch.events){
  if(!exactKeys(event,["id","offerId","revision","status"])||
     !allow.has(event.id)||allow.get(event.id)!==event.offerId||
     !Number.isSafeInteger(event.revision)||event.revision<1||
     event.revision>100000||!STATUSES.has(event.status)||
     seen.has(event.id))
   throw Error("invalid_demo_sync_event");
  seen.add(event.id);
  const ix=next.findIndex(x=>x.id===event.id);
  if(ix===-1){
   if(next.length>=MAX_ITEMS)throw Error("demo_inbox_full");
   // A cancellation received before an arrival remains a tombstone.
   next.push({...event,read:event.status==="cancelled"});
  }else{
   const old=next[ix];
   // Cancellation is terminal: later or stale "active" events do not revive.
   if(old.status==="cancelled"||event.revision<=old.revision)continue;
   next[ix]={...old,
    revision:event.revision,status:event.status,
    read:event.status==="cancelled"?true:old.read
   };
  }
 }
 return {version:VERSION,cursor:batch.cursor,items:next};
}
function markDemoInboxRead(state,id){
 validateInbox(state);
 if(!allow.has(id))throw Error("invalid_demo_inbox_id");
 if(!state.items.some(item=>item.id===id))return state;
 return {...state,items:state.items.map(item=>
  item.id===id?{...item,read:true}:item
 )};
}
function nextDemoBatch(state,type){
 validateInbox(state);
 if(type!=="arrival"&&type!=="cancellation")
  throw Error("invalid_demo_sync_action");
 let ref,revision,status;
 if(type==="arrival"){
  ref=ALLOWLIST.find(x=>!state.items.some(item=>item.id===x.id));
  status="active";revision=1;
 }else{
  const active=state.items.find(item=>item.status==="active");
  if(active){
   ref=allow.has(active.id)?{id:active.id,offerId:active.offerId}:null;
   revision=active.revision+1;status="cancelled";
  }
 }
 if(!ref)return null;
 return {cursor:state.cursor+1,events:[{
  id:ref.id,offerId:ref.offerId,revision,status
 }]};
}
function inboxCounters(state){
 validateInbox(state);
 return {
  demoAlerts:state.items.length,
  demoUnread:state.items.filter(item=>item.status==="active"&&!item.read).length,
  demoCancelled:state.items.filter(item=>item.status==="cancelled").length,
  remotePushReceived:0
 };
}
function createDemoInboxStore({storage}={}){
 if(!storage||typeof storage.getItem!=="function"||
    typeof storage.setItem!=="function")
  throw Error("demo_local_storage_required");
 let state=emptyInbox(),loaded=false,locked=false;
 let serial=Promise.resolve();
 const queue=work=>{
  const result=serial.then(work);
  serial=result.catch(()=>{});
  return result;
 };
 const persist=async next=>{
  const raw=JSON.stringify(validateInbox(next));
  if(raw.length>4096)throw Error("demo_snapshot_too_large");
  await storage.setItem(STORAGE_KEY,raw);
  state=next;return freezeView(state);
 };
 return Object.freeze({
  async load(){
   return queue(async()=>{
    if(loaded)return {state:freezeView(state),locked,recovered:state.cursor>0};
    try{
     const raw=await storage.getItem(STORAGE_KEY);
     state=restoreInbox(raw);loaded=true;locked=false;
     return {state:freezeView(state),locked:false,recovered:raw!==null};
    }catch{
     // Corrupted or unreadable storage: do NOT overwrite evidence silently.
     locked=true;loaded=true;state=emptyInbox();
     return {state:freezeView(state),locked:true,recovered:false};
    }
   });
  },
  async applyDemoBatch(batch){
   return queue(async()=>{
    if(!loaded||locked)throw Error("demo_inbox_unavailable");
    const next=applyServerDemoBatch(state,batch);
    return next===state?freezeView(state):persist(next);
   });
  },
  async applyServerPage(page){
   return queue(async()=>{
    if(!loaded||locked)throw Error("demo_inbox_unavailable");
    // No transport exists in this client: this applies an injected page
    // which is validated atomically before the ONLY persistence write.
    const {applyServerDemoPage}=require("./demo-inbox-sync-protocol.js");
    const next=applyServerDemoPage(state,page);
    return next===state?freezeView(state):persist(next);
   });
  },
  async simulate(type){
   return queue(async()=>{
    if(!loaded||locked)throw Error("demo_inbox_unavailable");
    const batch=nextDemoBatch(state,type);
    if(!batch)return {state:freezeView(state),applied:false};
    const next=applyServerDemoBatch(state,batch);
    const saved=await persist(next);
    return {state:saved,applied:true};
   });
  },
  async markRead(id){
   return queue(async()=>{
    if(!loaded||locked)throw Error("demo_inbox_unavailable");
    const next=markDemoInboxRead(state,id);
    return next===state?freezeView(state):persist(next);
   });
  },
  async reset(){
   return queue(async()=>{
    // Explicit user-only reset is allowed even after invalid local data.
    const next=emptyInbox();await persist(next);locked=false;loaded=true;
    return freezeView(next);
   });
  },
  snapshot(){return freezeView(state);}
 });
}
module.exports={
 VERSION,STORAGE_KEY,ALLOWLIST,emptyInbox,restoreInbox,
 applyServerDemoBatch,markDemoInboxRead,nextDemoBatch,inboxCounters,
 createDemoInboxStore
};
