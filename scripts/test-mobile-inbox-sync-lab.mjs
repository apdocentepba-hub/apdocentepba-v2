import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobileInboxEventLogLab}
 from './mobile-inbox-event-log-lab.mjs';
import {createMobileInboxSyncHandlerLab}
 from './mobile-inbox-sync-endpoint-lab.mjs';
import inboxPage from '../mobile/src/demo-inbox-sync-protocol.js';
import inboxState from '../mobile/src/demo-inbox.js';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const T_A='lab_session_user_a_012345678901234567890';
const T_B='lab_session_user_b_012345678901234567890';
const URL='https://offline.invalid/api/mobile/inbox';
const entry=(i,revision=1,status='active')=>({
 id:'DEMO-AVISO-00'+i,offerId:'DEMO-APD-00'+i,
 revision,status
});
function setup(options={}){
 const log=createMobileInboxEventLogLab();
 const sessions=new Map([
  [T_A,{token:T_A,user_id:A,activo:true,expires_at:'2099-01-01T00:00:00Z'}],
  [T_B,{token:T_B,user_id:B,activo:true,expires_at:'2099-01-01T00:00:00Z'}]
 ]);
 const handler=createMobileInboxSyncHandlerLab({
  repository:options.repository||log,
  loadSessionByToken:async token=>options.sessionDown?
   Promise.reject(Error('FAKE_SESSION_ERROR')):sessions.get(token)??null,
  loadUserById:async id=>({id,activo:options.inactiveUser?false:true})
 });
 const request=(method='GET',{auth=T_A,path=URL,body,headers={}}={})=>
  new Request(path,{method,headers:{
   ...(auth?{Authorization:'Bearer '+auth}:{}),
   ...(body!==undefined?{'Content-Type':'application/json'}:{}),
   ...headers
  },...(body!==undefined?{body:typeof body==='string'?body:
   JSON.stringify(body)}:{})});
 return {log,handler,request,sessions};
}
const actor=id=>({userId:id,sessionVerified:true});
const get=async(h,r)=>{const response=await h(r);return {
 status:response.status,headers:response.headers,value:await response.json()
};};

test('strict account-scoped cursor pages can never cross tenants',async()=>{
 const x=setup();
 x.log.injectServerEvent({userId:A,event:entry(1)});
 x.log.injectServerEvent({userId:A,event:entry(2)});
 x.log.injectServerEvent({userId:B,event:entry(3)});
 const a=await get(x.handler,x.request('GET',{
  path:URL+'?after=0&limit=1'}));
 const b=await get(x.handler,x.request('GET',{
  auth:T_B,path:URL+'?after=0&limit=5'}));
 assert.equal(a.status,200);
 assert.equal(a.value.events.length,1);
 assert.equal(a.value.events[0].id,'DEMO-AVISO-001');
 assert.equal(a.value.fromCursor,0);
 assert.equal(a.value.nextCursor,1);
 assert.equal(a.value.hasMore,true);
 assert.equal(b.status,200);
 assert.equal(b.value.events.length,1);
 assert.equal(b.value.events[0].id,'DEMO-AVISO-003');
 assert.equal(b.value.nextCursor,1);
 for(const v of [A,B,T_A,T_B,'user_id','token','FAKE_SESSION_ERROR']){
  assert.ok(!JSON.stringify(a.value).includes(v));
  assert.ok(!JSON.stringify(b.value).includes(v));
 }
 assert.equal(a.headers.get('cache-control'),'no-store');
 assert.equal(a.headers.get('vary'),'Authorization');
});
test('client-supplied account identity is rejected in all query shapes',async()=>{
 const x=setup();
 x.log.injectServerEvent({userId:B,event:entry(3)});
 for(const path of [
  URL+'?user_id='+B,URL+'?uid='+B,
  URL+'?after=0&after=1',URL+'?limit=1&limit=2',
  URL+'?after=0&cursor=1000'
 ]){
  const result=await get(x.handler,x.request('GET',{path}));
  assert.equal(result.status,400);
  assert.equal(result.value.error,'invalid_page');
 }
});
test('unknown, expired, revoked and bare-UUID sessions have no read or write',async()=>{
 const x=setup();
 x.log.injectServerEvent({userId:A,event:entry(1)});
 x.sessions.get(T_A).activo=false;
 for(const auth of [null,A,'unknown_session_123456789012345678',T_A]){
  assert.equal((await x.handler(x.request('GET',{auth}))).status,401);
  assert.equal((await x.handler(x.request('POST',{
   auth,path:URL+'/read',body:{id:'DEMO-AVISO-001',revision:1}
  }))).status,401);
 }
 x.sessions.get(T_A).activo=true;
 x.sessions.get(T_A).expires_at='2000-01-01T00:00:00Z';
 assert.equal((await x.handler(x.request('GET'))).status,401);
 assert.equal(x.log.stats({actor:actor(A)}).cursor,1);
});
test('inactive account fails closed and session backend exceptions never leak',async()=>{
 for(const options of [{inactiveUser:true},{sessionDown:true}]){
  const x=setup(options);
  const result=await get(x.handler,x.request('GET'));
  assert.equal(result.status,401);
  assert.ok(!JSON.stringify(result.value).includes('FAKE_SESSION_ERROR'));
 }
});
test('page sizes and cursors are bounded and cannot skip history',async()=>{
 const x=setup();
 x.log.injectServerEvent({userId:A,event:entry(1)});
 for(const path of [
  URL+'?after=-1',URL+'?after=2',URL+'?after=abc',
  URL+'?limit=0',URL+'?limit=21',URL+'?limit=1.2',
  URL+'?after=00000001',URL+'?limit=99999999'
 ]){
  const response=await x.handler(x.request('GET',{path}));
  assert.equal(response.status,400,path);
 }
 const page=await get(x.handler,x.request());
 assert.equal(page.value.events.length,1);
 const tail=await get(x.handler,x.request('GET',{path:URL+'?after=1'}));
 assert.equal(tail.value.events.length,0);
 assert.equal(tail.value.nextCursor,1);
 assert.equal(tail.value.hasMore,false);
});
test('read ACK belongs only to server session, never a client-chosen user ID',async()=>{
 const x=setup();
 x.log.injectServerEvent({userId:A,event:entry(1)});
 x.log.injectServerEvent({userId:B,event:entry(1)});
 for(const body of [
  {id:'DEMO-AVISO-001',revision:1,user_id:A},
  {id:'DEMO-AVISO-001',revision:1,account:B},
  {id:'DEMO-AVISO-001',revision:1,token:T_A}
 ]){
  const res=await x.handler(x.request('POST',{path:URL+'/read',body}));
  assert.equal(res.status,400);
 }
 const b=await get(x.handler,x.request('POST',{
  auth:T_B,path:URL+'/read',body:{id:'DEMO-AVISO-001',revision:1}
 }));
 assert.equal(b.status,200);
 assert.equal(b.value.ack.cursor,2);
 assert.equal(x.log.stats({actor:actor(A)}).cursor,1);
 assert.equal(x.log.stats({actor:actor(B)}).cursor,2);
});
test('idempotent repeated read ACK produces exactly one new read event',async()=>{
 const x=setup();
 x.log.injectServerEvent({userId:A,event:entry(1)});
 const a=await get(x.handler,x.request('POST',{
  path:URL+'/read',body:{id:'DEMO-AVISO-001',revision:1}
 }));
 const b=await get(x.handler,x.request('POST',{
  path:URL+'/read',body:{id:'DEMO-AVISO-001',revision:1}
 }));
 assert.equal(a.status,200);
 assert.equal(a.value.ack.alreadyRead,false);
 assert.equal(b.value.ack.alreadyRead,true);
 assert.equal(b.value.ack.cursor,2);
 assert.equal(x.log.stats({actor:actor(A)}).cursor,2);
 const page=await get(x.handler,x.request('GET',{path:URL+'?after=1'}));
 assert.equal(page.value.events.length,1);
 assert.equal(page.value.events[0].kind,'read');
 assert.equal(page.value.events[0].read,true);
});
test('old revision and cancelled alerts cannot be acknowledged as active',async()=>{
 const x=setup();
 x.log.injectServerEvent({userId:A,event:entry(1)});
 x.log.injectServerEvent({userId:A,event:entry(1,2,'cancelled')});
 const old=await get(x.handler,x.request('POST',{
  path:URL+'/read',body:{id:'DEMO-AVISO-001',revision:1}
 }));
 const cancelled=await get(x.handler,x.request('POST',{
  path:URL+'/read',body:{id:'DEMO-AVISO-001',revision:2}
 }));
 assert.equal(old.status,409);
 assert.equal(cancelled.status,404);
 assert.equal(x.log.stats({actor:actor(A)}).cursor,2);
});
test('foreign alerts return indistinguishable not_found and no tenant leakage',async()=>{
 const x=setup();
 x.log.injectServerEvent({userId:B,event:entry(4)});
 const a=await get(x.handler,x.request('POST',{
  path:URL+'/read',body:{id:'DEMO-AVISO-004',revision:1}
 }));
 const missing=await get(x.handler,x.request('POST',{
  path:URL+'/read',body:{id:'DEMO-AVISO-002',revision:1}
 }));
 assert.equal(a.status,404);
 assert.deepEqual(a.value,missing.value);
});
test('all read request fields, length, media type and method are validated',async()=>{
 const x=setup();
 for(const body of [
  {id:'DEMO-AVISO-001',revision:1,read:true},
  {id:'DEMO-AVISO-001',revision:'1'},
  {id:'DEMO-AVISO-009',revision:1},
  {id:'DEMO-AVISO-001',revision:0},
  {id:'DEMO-AVISO-001',revision:1,padding:'x'.repeat(500)}
 ]){
  const status=(await x.handler(x.request('POST',{
   path:URL+'/read',body
  }))).status;
  assert.ok([400,413].includes(status));
 }
 assert.equal((await x.handler(x.request('POST',{
  path:URL+'/read',body:{id:'DEMO-AVISO-001',revision:1},
  headers:{'Content-Type':'text/plain'}
 }))).status,415);
 assert.equal((await x.handler(x.request('POST',{
  path:URL+'/read',body:'{bad'
 }))).status,400);
 assert.equal((await x.handler(x.request('POST',{
  path:URL+'/read?user_id='+B,body:{id:'DEMO-AVISO-001',revision:1}
 }))).status,400);
 assert.equal((await x.handler(x.request('POST'))).status,405);
 assert.equal((await x.handler(x.request('PUT',{path:URL+'/read'}))).status,405);
});
test('cancellation is terminal on server: late active events cannot revive it',()=>{
 const log=createMobileInboxEventLogLab();
 assert.equal(log.injectServerEvent({userId:A,event:entry(1)}),true);
 assert.equal(log.injectServerEvent({userId:A,event:entry(1,2,'cancelled')}),true);
 assert.equal(log.injectServerEvent({userId:A,event:entry(1,3)}),false);
 assert.equal(log.injectServerEvent({userId:A,event:entry(1,1)}),false);
 const page=log.listPage({actor:actor(A),after:0,limit:20});
 assert.equal(page.events.length,2);
 assert.equal(page.events[1].status,'cancelled');
 assert.equal(page.events[1].read,true);
});
test('cancellation arriving BEFORE creation is retained as a terminal tombstone',()=>{
 const log=createMobileInboxEventLogLab();
 assert.equal(log.injectServerEvent({
  userId:A,event:entry(2,3,'cancelled')
 }),true);
 assert.equal(log.injectServerEvent({userId:A,event:entry(2,4)}),false);
 assert.equal(log.listPage({actor:actor(A)}).events[0].status,'cancelled');
});
test('updating offer revision preserves server read acknowledgement',()=>{
 const log=createMobileInboxEventLogLab();
 log.injectServerEvent({userId:A,event:entry(1)});
 log.acknowledgeRead({actor:actor(A),id:entry(1).id,revision:1});
 log.injectServerEvent({userId:A,event:entry(1,2)});
 const page=log.listPage({actor:actor(A),after:2});
 assert.equal(page.events[0].kind,'event');
 assert.equal(page.events[0].revision,2);
 assert.equal(page.events[0].read,true);
});
test('a page can be applied atomically to the demo store; state survives reopening',async()=>{
 const x=setup();
 x.log.injectServerEvent({userId:A,event:entry(1)});
 x.log.injectServerEvent({userId:A,event:entry(2)});
 const disk=new Map();
 const storage={
  getItem:async key=>disk.get(key)??null,
  setItem:async(key,value)=>{disk.set(key,value);}
 };
 const store=inboxState.createDemoInboxStore({storage});
 await store.load();
 let page=(await get(x.handler,x.request('GET',{
  path:URL+'?after=0&limit=1'
 }))).value;
 await store.applyServerPage({
  version:page.version,fromCursor:page.fromCursor,
  nextCursor:page.nextCursor,hasMore:page.hasMore,events:page.events
 });
 page=(await get(x.handler,x.request('GET',{
  path:URL+'?after=1&limit=5'
 }))).value;
 await store.applyServerPage({
  version:page.version,fromCursor:page.fromCursor,
  nextCursor:page.nextCursor,hasMore:page.hasMore,events:page.events
 });
 const reopened=inboxState.createDemoInboxStore({storage});
 const recovered=await reopened.load();
 assert.equal(recovered.state.cursor,2);
 assert.equal(recovered.state.items.length,2);
 assert.equal(recovered.locked,false);
});
test('server read events synchronize another fictional device without resetting state',()=>{
 const log=createMobileInboxEventLogLab();
 log.injectServerEvent({userId:A,event:entry(1)});
 log.acknowledgeRead({actor:actor(A),id:'DEMO-AVISO-001',revision:1});
 const page=log.listPage({actor:actor(A),after:0,limit:10});
 const applied=inboxPage.applyServerDemoPage(inboxState.emptyInbox(),page);
 assert.equal(applied.cursor,2);
 assert.equal(applied.items[0].read,true);
 assert.equal(applied.items[0].status,'active');
});
test('server cancellation after read wins and late client replay cannot revive',()=>{
 const log=createMobileInboxEventLogLab();
 log.injectServerEvent({userId:A,event:entry(1)});
 log.acknowledgeRead({actor:actor(A),id:'DEMO-AVISO-001',revision:1});
 log.injectServerEvent({userId:A,event:entry(1,2,'cancelled')});
 const first=log.listPage({actor:actor(A),after:0,limit:1});
 let local=inboxPage.applyServerDemoPage(inboxState.emptyInbox(),first);
 const second=log.listPage({actor:actor(A),after:1,limit:20});
 local=inboxPage.applyServerDemoPage(local,second);
 assert.equal(local.items[0].status,'cancelled');
 assert.equal(local.items[0].read,true);
 assert.equal(local.cursor,3);
 assert.equal(log.injectServerEvent({userId:A,event:entry(1,3)}),false);
});
test('server→demo-page rejects gaps, untrusted fields, foreign identifiers atomically',()=>{
 const original=inboxState.emptyInbox();
 const valid={
  version:1,fromCursor:0,nextCursor:2,hasMore:false,
  events:[{...entry(1),kind:'event',cursor:1,read:false},
   {...entry(2),kind:'event',cursor:2,read:false}]
 };
 for(const malformed of [
  {...valid,nextCursor:1},
  {...valid,events:[valid.events[0],{...valid.events[1],cursor:3}]},
  {...valid,events:[valid.events[0],{...valid.events[1],userId:B}]},
  {...valid,events:[valid.events[0],{...valid.events[1],id:'REAL_USER'}]},
  {...valid,events:[valid.events[0],{...valid.events[1],kind:'delivered'}]},
  {...valid,events:[valid.events[0],{...valid.events[1],read:'true'}]},
  {...valid,events:[valid.events[0],{...valid.events[1],status:'deleted'}]}
 ]){
  assert.throws(()=>inboxPage.applyServerDemoPage(original,malformed));
  assert.deepEqual(original,inboxState.emptyInbox());
 }
});
test('wrong account pages cannot be applied to a different cursor snapshot',()=>{
 const page={version:1,fromCursor:1,nextCursor:2,hasMore:false,
  events:[{...entry(2),cursor:2,kind:'event',read:false}]};
 assert.throws(()=>inboxPage.applyServerDemoPage(inboxState.emptyInbox(),page),
  /demo_inbox_cursor_mismatch/);
});
test('request validation denies malformed JSON and hides DB errors from caller',async()=>{
 const repo={
  listPage(){throw Error('SECRET_DB_CONNECTION');},
  acknowledgeRead(){throw Error('SECRET_DB_CONNECTION');}
 };
 const x=setup({repository:repo});
 const r=await get(x.handler,x.request('GET'));
 assert.equal(r.status,503);
 assert.deepEqual(r.value,{ok:false,error:'service_unavailable'});
 assert.ok(!JSON.stringify(r).includes('SECRET_DB_CONNECTION'));
 const wr=await get(x.handler,x.request('POST',{
  path:URL+'/read',body:{id:'DEMO-AVISO-001',revision:1}
 }));
 assert.equal(wr.status,503);
 assert.ok(!JSON.stringify(wr).includes('SECRET_DB_CONNECTION'));
});


test('asynchronous repository failures and invalid cursor get distinct safe HTTP responses',async()=>{
 const a=setup({repository:{
  async listPage(){throw Error('SECRET_PRIVATE_DB_UNAVAILABLE');},
  async acknowledgeRead(){return {accepted:false,reason:'not_found'};}
 }});
 const unavailable=await get(a.handler,a.request());
 assert.equal(unavailable.status,503);
 assert.deepEqual(unavailable.value,{ok:false,error:'service_unavailable'});
 assert.ok(!JSON.stringify(unavailable.value).includes('SECRET'));
 const b=setup({repository:{
  async listPage(){throw Error('invalid_inbox_page');},
  async acknowledgeRead(){return {accepted:false,reason:'not_found'};}
 }});
 const invalid=await get(b.handler,b.request());
 assert.equal(invalid.status,400);
 assert.deepEqual(invalid.value,{ok:false,error:'invalid_page'});
});
