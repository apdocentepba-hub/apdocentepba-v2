"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {
 STORAGE_KEY,ALLOWLIST,emptyInbox,restoreInbox,applyServerDemoBatch,
 markDemoInboxRead,nextDemoBatch,inboxCounters,createDemoInboxStore
}=require("./demo-inbox.js");
const evt=(ix,revision=1,status="active")=>({
 id:ALLOWLIST[ix].id,offerId:ALLOWLIST[ix].offerId,revision,status
});
const batch=(cursor,events)=>({cursor,events});
function memory(initial){
 const data=new Map(Object.entries(initial||{}));
 const calls={read:0,write:0};
 return {
  data,calls,
  async getItem(key){calls.read++;return data.get(key)??null;},
  async setItem(key,value){calls.write++;data.set(key,value);}
 };
}

test("all inbox event IDs and offer IDs are fictitious and allowlisted",()=>{
 assert.equal(ALLOWLIST.length,4);
 assert.equal(new Set(ALLOWLIST.map(x=>x.id)).size,4);
 assert.ok(ALLOWLIST.every(x=>x.id.startsWith("DEMO-AVISO-")&&
  x.offerId.startsWith("DEMO-APD-")));
});
test("ordered synthetic delivery increments cursor without claiming remote push",()=>{
 const first=applyServerDemoBatch(emptyInbox(),batch(1,[evt(0)]));
 assert.deepEqual(first,{
  version:1,cursor:1,items:[{...evt(0),read:false}]
 });
 assert.deepEqual(inboxCounters(first),{
  demoAlerts:1,demoUnread:1,demoCancelled:0,remotePushReceived:0
 });
});
test("reading is local and duplicate remote sync cannot reset it",()=>{
 const incoming=batch(1,[evt(0)]);
 const first=applyServerDemoBatch(emptyInbox(),incoming);
 const read=markDemoInboxRead(first,evt(0).id);
 assert.equal(read.items[0].read,true);
 assert.deepEqual(applyServerDemoBatch(read,incoming),read);
 assert.equal(inboxCounters(read).demoUnread,0);
});
test("a newer active revision preserves read state",()=>{
 const first=markDemoInboxRead(
  applyServerDemoBatch(emptyInbox(),batch(1,[evt(0)])),
  evt(0).id
 );
 const result=applyServerDemoBatch(first,batch(2,[evt(0,2)]));
 assert.equal(result.items[0].read,true);
 assert.equal(result.items[0].revision,2);
});
test("cancellation takes priority over read/unread and is terminal",()=>{
 let state=applyServerDemoBatch(emptyInbox(),batch(1,[evt(0)]));
 state=applyServerDemoBatch(state,batch(2,[evt(0,2,"cancelled")]));
 assert.equal(state.items[0].status,"cancelled");
 assert.equal(state.items[0].read,true);
 assert.equal(inboxCounters(state).demoCancelled,1);
 const newer=applyServerDemoBatch(state,batch(3,[evt(0,999,"active")]));
 assert.equal(newer.items[0].status,"cancelled");
 assert.equal(newer.items[0].read,true);
 assert.equal(newer.items[0].revision,2);
});
test("cancellation before arrival persists tombstone and prevents resurrection",()=>{
 let state=applyServerDemoBatch(
  emptyInbox(),batch(1,[evt(0,2,"cancelled")])
 );
 state=applyServerDemoBatch(state,batch(2,[evt(0,1,"active")]));
 assert.equal(state.items[0].status,"cancelled");
 assert.equal(state.items[0].read,true);
});
test("a missing server cursor fails closed rather than skipping unknown cancellation",()=>{
 const state=applyServerDemoBatch(emptyInbox(),batch(1,[evt(0)]));
 assert.throws(()=>applyServerDemoBatch(state,batch(3,[evt(1)])),
  /missing_demo_sync_cursor/);
 assert.equal(state.cursor,1);
});
test("old or repeated batch is idempotent even after newer cancellation",()=>{
 let state=applyServerDemoBatch(emptyInbox(),batch(1,[evt(0)]));
 state=applyServerDemoBatch(state,batch(2,[evt(0,2,"cancelled")]));
 assert.deepEqual(applyServerDemoBatch(state,batch(1,[evt(0)])),state);
 assert.deepEqual(applyServerDemoBatch(state,batch(2,[evt(0,2,"cancelled")])),state);
});
test("duplicate event IDs inside one batch are rejected atomically",()=>{
 assert.throws(()=>applyServerDemoBatch(emptyInbox(),batch(1,[
  evt(0),evt(0,2,"cancelled")
 ])),/invalid_demo_sync_event/);
});
test("out-of-scope, malformed or non-demo event fields fail closed",()=>{
 const invalid=[
  {...evt(0),token:"FAKE_TOKEN"},
  {...evt(0),offerId:"REAL-ABC-123"},
  {...evt(0),status:"delivered"},
  {...evt(0),revision:0},
  {...evt(0),id:"USER-123"},
  {...evt(0),read:false},
  null
 ];
 for(const item of invalid){
  assert.throws(()=>applyServerDemoBatch(emptyInbox(),batch(1,[item])),
   /invalid_demo_sync_event/);
 }
});
test("unknown IDs can never be marked read or inserted",()=>{
 assert.throws(()=>markDemoInboxRead(emptyInbox(),"REAL-UNKNOWN"),
  /invalid_demo_inbox_id/);
 assert.deepEqual(markDemoInboxRead(emptyInbox(),evt(0).id),emptyInbox());
});
test("restore allows only valid compact versioned snapshots",()=>{
 const state=applyServerDemoBatch(emptyInbox(),batch(1,[evt(0)]));
 const restored=restoreInbox(JSON.stringify(state));
 assert.deepEqual(restored,state);
 assert.deepEqual(restoreInbox(null),emptyInbox());
});
test("restore rejects corrupted, oversized, foreign-account or injected snapshots",()=>{
 const first=applyServerDemoBatch(emptyInbox(),batch(1,[evt(0)]));
 for(const raw of [
  "{",JSON.stringify({...first,version:2}),
  JSON.stringify({...first,cursor:-2}),
  JSON.stringify({...first,items:[{...first.items[0],userId:"PRIVATE"}]}),
  JSON.stringify({...first,items:[first.items[0],first.items[0]]}),
  JSON.stringify({...first,actor:"someone"}),
  JSON.stringify({...first,items:[{...first.items[0],offerId:"APD-LIVE"}]}),
  "X".repeat(4097)
 ]){
  assert.throws(()=>restoreInbox(raw),/invalid_demo_inbox_snapshot/);
 }
});
test("arrival and cancellation fixtures strictly sequence and stop at four",()=>{
 let state=emptyInbox();
 for(let i=0;i<ALLOWLIST.length;i++){
  const next=nextDemoBatch(state,"arrival");
  assert.equal(next.events[0].id,ALLOWLIST[i].id);
  state=applyServerDemoBatch(state,next);
 }
 assert.equal(nextDemoBatch(state,"arrival"),null);
 const cancel=nextDemoBatch(state,"cancellation");
 assert.equal(cancel.events[0].status,"cancelled");
 state=applyServerDemoBatch(state,cancel);
 assert.equal(state.items[0].status,"cancelled");
 assert.equal(nextDemoBatch(state,"arrival"),null);
});
test("persisted demo inbox reloads from storage on a NEW app instance",async()=>{
 const disk=memory(),old=createDemoInboxStore({storage:disk});
 assert.equal((await old.load()).recovered,false);
 const arrived=await old.simulate("arrival");
 assert.equal(arrived.applied,true);
 await old.markRead(ALLOWLIST[0].id);
 await old.simulate("cancellation");
 const restored=createDemoInboxStore({storage:disk});
 const value=await restored.load();
 assert.equal(value.recovered,true);
 assert.equal(value.locked,false);
 assert.equal(value.state.items[0].status,"cancelled");
 assert.equal(value.state.items[0].read,true);
 assert.equal(value.state.cursor,2);
 assert.equal(disk.calls.write,3);
 assert.ok(disk.data.has(STORAGE_KEY));
 assert.doesNotMatch(disk.data.get(STORAGE_KEY),/token|dni|Bearer|fcm|apns/i);
});
test("serialized concurrent local writes cannot lose reading or cancellation",async()=>{
 const disk=memory();
 const store=createDemoInboxStore({storage:disk});
 await store.load();await store.simulate("arrival");
 const [read,cancel]=await Promise.all([
  store.markRead(ALLOWLIST[0].id),store.simulate("cancellation")
 ]);
 assert.equal(read.items[0].read,true);
 assert.equal(cancel.state.items[0].status,"cancelled");
 const restore=createDemoInboxStore({storage:disk});
 assert.equal((await restore.load()).state.items[0].status,"cancelled");
});
test("persistence failure does not pretend a change was saved",async()=>{
 const disk=memory();let fail=true;
 const storage={
  getItem:disk.getItem,
  async setItem(key,value){
   if(fail)throw Error("PRIVATE_IO_ERROR");
   return disk.setItem(key,value);
  }
 };
 const store=createDemoInboxStore({storage});
 await store.load();
 await assert.rejects(()=>store.simulate("arrival"),/PRIVATE_IO_ERROR/);
 assert.equal(store.snapshot().items.length,0);
 fail=false;
 const saved=await store.simulate("arrival");
 assert.equal(saved.applied,true);
 assert.equal(store.snapshot().items.length,1);
});
test("corrupt local snapshot locks updates instead of silently destroying evidence",async()=>{
 const disk=memory({[STORAGE_KEY]:'{"user":"different-user"}'});
 const store=createDemoInboxStore({storage:disk});
 const load=await store.load();
 assert.equal(load.locked,true);
 await assert.rejects(()=>store.simulate("arrival"),/demo_inbox_unavailable/);
 assert.equal(disk.calls.write,0);
 assert.equal(disk.data.get(STORAGE_KEY),'{"user":"different-user"}');
 await store.reset();
 assert.equal((await store.simulate("arrival")).applied,true);
});
test("successful user reset clears fictional inbox and its local cursor",async()=>{
 const disk=memory(),store=createDemoInboxStore({storage:disk});
 await store.load();await store.simulate("arrival");await store.simulate("cancellation");
 const empty=await store.reset();
 assert.deepEqual(empty,emptyInbox());
 assert.deepEqual(restoreInbox(disk.data.get(STORAGE_KEY)),emptyInbox());
 assert.equal((await store.simulate("arrival")).applied,true);
});
test("serialized persistence and returned snapshots cannot be mutated by caller",async()=>{
 const disk=memory(),store=createDemoInboxStore({storage:disk});
 await store.load();await store.simulate("arrival");
 const exposed=store.snapshot();
 assert.ok(Object.isFrozen(exposed));
 assert.ok(Object.isFrozen(exposed.items));
 assert.ok(Object.isFrozen(exposed.items[0]));
 assert.throws(()=>{exposed.items[0].status="active-but-untrusted";},TypeError);
 assert.equal(store.snapshot().items[0].status,"active");
});
