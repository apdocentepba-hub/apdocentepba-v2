import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobilePushPostgrestAdapterLab}
 from './mobile-push-postgrest-adapter-lab.mjs';
import {createMobileInboxPostgrestRepositoryLab}
 from './mobile-inbox-postgrest-repository-lab.mjs';
import {createMobileInboxSyncHandlerLab}
 from './mobile-inbox-sync-endpoint-lab.mjs';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const TOKEN='lab_session_user_a_012345678901234567890';
const SECRET='sb_secret_SYNTHETIC_INBOX_SECRET_KEY_1234567890';
const HOST='https://apdprivate-lab.supabase.co';
const root='https://offline.invalid/api/mobile/inbox';
const actor={userId:A,sessionVerified:true};
const send=data=>Response.json(data);
const event={cursor:1,kind:'event',id:'DEMO-AVISO-001',
 offerId:'DEMO-APD-001',revision:1,status:'active',read:false};
function setup({page,ack,broken=false}={}){
 const calls=[];
 const db=createMobilePushPostgrestAdapterLab({
  projectUrl:HOST,secretKey:SECRET,
  fetchImpl:async(url,opts)=>{
   const u=new URL(url);const body=JSON.parse(opts.body);
   calls.push({path:u.pathname,body,method:opts.method});
   assert.equal(opts.headers.apikey,SECRET);
   assert.equal(opts.credentials,'omit');
   assert.equal(opts.redirect,'manual');
   assert.equal(opts.method,'POST');
   if(broken)throw Error('PRIVATE_SQL_CREDENTIAL_MUST_NOT_LEAK');
   if(u.pathname.endsWith('/apd_mobile_inbox_page_lab'))
    return send(page??{
     version:1,fromCursor:0,nextCursor:1,hasMore:false,events:[event]
    });
   if(u.pathname.endsWith('/apd_mobile_inbox_ack_read_lab'))
    return send(ack??{
     accepted:true,alreadyRead:false,cursor:2,read:true
    });
   if(u.pathname.endsWith('/apd_mobile_inbox_append_event_lab'))
    return send(true);
   throw Error('unexpected_inbox_rpc');
  }
 });
 const repository=createMobileInboxPostgrestRepositoryLab({database:db});
 const handler=createMobileInboxSyncHandlerLab({
  repository,
  loadSessionByToken:async token=>token===TOKEN?{
   token,user_id:A,activo:true,expires_at:'2099-01-01T00:00:00Z'
  }:null,
  loadUserById:async userId=>({id:userId,activo:true})
 });
 const request=(method='GET',{path=root,auth=TOKEN,body}={})=>
  new Request(path,{method,headers:{
   ...(auth?{Authorization:'Bearer '+auth}:{}),
   ...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
 return {db,calls,repository,handler,request};
}
test('strict session maps paginated GET to the current user only',async()=>{
 const x=setup();
 const result=await x.handler(x.request());
 assert.equal(result.status,200);
 const body=await result.json();
 assert.equal(body.events[0].id,'DEMO-AVISO-001');
 assert.equal(body.nextCursor,1);
 assert.equal(x.calls.length,1);
 assert.deepEqual(x.calls[0],{
  path:'/rest/v1/rpc/apd_mobile_inbox_page_lab',method:'POST',
  body:{p_user_id:A,p_after:0,p_limit:5}
 });
 assert.ok(!JSON.stringify(body).includes(A));
 assert.ok(!JSON.stringify(body).includes(SECRET));
});
test('strict session maps read ACK to DB and never trusts supplied account',async()=>{
 const x=setup();
 const result=await x.handler(x.request('POST',{
  path:root+'/read',body:{id:'DEMO-AVISO-001',revision:1}
 }));
 assert.equal(result.status,200);
 assert.equal((await result.json()).ack.read,true);
 assert.deepEqual(x.calls[0],{
  path:'/rest/v1/rpc/apd_mobile_inbox_ack_read_lab',
  method:'POST',body:{
   p_user_id:A,p_notice_id:'DEMO-AVISO-001',p_revision:1
  }
 });
 const spoof=await x.handler(x.request('POST',{
  path:root+'/read',body:{
   id:'DEMO-AVISO-001',revision:1,user_id:B
  }
 }));
 assert.equal(spoof.status,400);
 assert.equal(x.calls.length,1);
});
test('missing session and foreign actor cause NO SQL requests',async()=>{
 const x=setup();
 assert.equal((await x.handler(x.request('GET',{auth:null}))).status,401);
 assert.equal((await x.handler(x.request('GET',{
  path:root+'?user_id='+B
 }))).status,400);
 assert.equal(x.calls.length,0);
 for(const wrong of [
  null,{userId:B,sessionVerified:false},
  {userId:'FAKE_PERSON',sessionVerified:true},
  {userId:A,sessionVerified:true,privileged:true}
 ]){
  await assert.rejects(()=>x.repository.listPage({
   actor:wrong,after:0,limit:1
  }),/inbox_actor_not_verified/);
 }
 assert.equal(x.calls.length,0);
});
test('trusted offline event creation can ONLY send a fictional typed event',async()=>{
 const x=setup();
 assert.equal(await x.db.inboxAppendTrustedDemoLab({
  userId:A,id:'DEMO-AVISO-002',offerId:'DEMO-APD-002',
  revision:1,status:'active'
 }),true);
 assert.deepEqual(x.calls[0],{
  path:'/rest/v1/rpc/apd_mobile_inbox_append_event_lab',
  method:'POST',body:{
   p_user_id:A,p_notice_id:'DEMO-AVISO-002',
   p_offer_id:'DEMO-APD-002',p_revision:1,p_status:'active'
  }
 });
 for(const invalid of [
  {userId:B,id:'REAL-ABC-001',offerId:'DEMO-APD-001',revision:1,status:'active'},
  {userId:A,id:'DEMO-AVISO-001',offerId:'DEMO-APD-002',revision:1,status:'active'},
  {userId:A,id:'DEMO-AVISO-001',offerId:'DEMO-APD-001',revision:1,status:'delivered'}
 ]){
  await assert.rejects(()=>x.db.inboxAppendTrustedDemoLab(invalid),
   /invalid_private_inbox_event/);
 }
 assert.equal(x.calls.length,1);
});
test('private SQL failure never reveals credentials in HTTP response',async()=>{
 const x=setup({broken:true});
 const a=await x.handler(x.request());
 assert.equal(a.status,503);
 assert.deepEqual(await a.json(),{ok:false,error:'service_unavailable'});
 const b=await x.handler(x.request('POST',{
  path:root+'/read',body:{id:'DEMO-AVISO-001',revision:1}
 }));
 assert.equal(b.status,503);
 assert.deepEqual(await b.json(),{ok:false,error:'service_unavailable'});
});
test('PostgREST cannot return arbitrary fields to the mobile app',async()=>{
 const x=setup({page:{
  version:1,fromCursor:0,nextCursor:1,hasMore:false,
  events:[{...event,token:'SENSITIVE_FAKE_DATA',user_id:B}]
 }});
 const result=await x.handler(x.request());
 assert.equal(result.status,503);
 const output=JSON.stringify(await result.json());
 assert.ok(!output.includes('SENSITIVE_FAKE_DATA'));
 assert.ok(!output.includes(B));
});
test('bad SQL RPC inputs never contact private database',async()=>{
 const x=setup();
 for(const config of [
  {userId:'bad'},
  {userId:A,after:-1},
  {userId:A,after:100001},
  {userId:A,limit:21},
  {userId:A,limit:0}
 ]){
  await assert.rejects(()=>x.db.inboxPageLab(config),
   /invalid_private_inbox_page/);
 }
 for(const config of [
  {userId:B,id:'DEMO-AVISO-900',revision:1},
  {userId:A,id:'DEMO-AVISO-001',revision:0},
  {userId:'bad',id:'DEMO-AVISO-001',revision:1}
 ]){
  await assert.rejects(()=>x.db.inboxAckReadLab(config),
   /invalid_private_inbox_ack/);
 }
 assert.equal(x.calls.length,0);
});
test('private DB mock may be async but response is still strictly scoped',async()=>{
 const x=setup({page:{
  version:1,fromCursor:0,nextCursor:0,hasMore:false,events:[]
 }});
 const r=await x.handler(x.request());
 assert.equal(r.status,200);
 assert.equal((await r.json()).nextCursor,0);
});
