import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hardenMessagingStatus} from './create-messaging-status-auth-candidate.mjs';

const canonical=fs.readFileSync('worker-live/worker_hotfix.js','utf8');
const candidate=fs.readFileSync('tmp/messaging-auth-candidate/worker_hotfix.js','utf8');
const names=['handleTelegramStatus','handleWhatsAppStatus'];
function bound(source,name){
  const start=source.indexOf('async function '+name+'(request, env) {');
  const end=source.indexOf('\n__name('+name+',',start);
  assert.ok(start>=0 && end>start,'Expected bounded '+name);
  return source.slice(start,end);
}
function runner(name,authUser,record){
  const snippet=bound(candidate,name);
  const deps=[
    'getSessionUserByBearer','json2','obtenerPreferenciasUsuario','getTelegramState',
    'resolveTelegramEntitlement','maskChatId','buildTelegramBotLink','getWhatsAppState',
    'resolveWhatsAppEntitlement','buildWhatsAppBotNumber','buildWhatsAppBotLink','maskPhone'
  ];
  const values=[
    async()=>authUser,
    (data,status=200)=>({status,data}),
    async(_env,id)=>{record.push('prefs:'+id);return {alertas_telegram:true,alertas_whatsapp:true}},
    async(_env,id)=>{record.push('tgstate:'+id);return {connected:true,chat_id:'fake',username:'fake-user'}},
    async(_env,id)=>{record.push('tgplan:'+id);return {allowed:true,plan_code:'PLUS',plan_name:'Plus',source:'active'}},
    ()=>'*masked*',()=> 'https://example.invalid/bot',
    async(_env,id)=>{record.push('wastate:'+id);return {connected:true}},
    async(_env,id)=>{record.push('waplan:'+id);return {allowed:true,plan_code:'PLUS',plan_name:'Plus'}},
    ()=> 'fake-number',()=> 'https://example.invalid/whatsapp',
    ()=>'*masked*'
  ];
  return new Function(...deps,snippet+'\nreturn '+name)(...values);
}
test('isolated patch touches only the two intended functions',()=>{
 assert.notEqual(candidate,canonical);
 assert.equal(candidate,hardenMessagingStatus(canonical));
 for(const name of names){
   const body=bound(candidate,name);
   assert.match(body,/const user = authUser;/);
   assert.doesNotMatch(body,/obtenerUsuario\(env, requestedUserId\)/);
 }
 const original=canonical.match(/if \(!user && requestedUserId\) user = await obtenerUsuario\(env, requestedUserId\);/g);
 assert.equal(original?.length,2);
 assert.throws(()=>hardenMessagingStatus(candidate),/Expected exactly/);
});
for(const name of names){
 test(name+': unauthenticated supplied user_id must return 401 with no lookup',async()=>{
  const reads=[];const handler=runner(name,null,reads);
  const out=await handler(new Request('https://example.invalid/api/x?user_id=other-account'),{});
  assert.equal(out.status,401);
  assert.equal(reads.length,0,'No user preference/state data read without session');
 });
 test(name+': valid session can view own state',async()=>{
  const reads=[];const handler=runner(name,{id:'owner1',es_admin:false},reads);
  const out=await handler(new Request('https://example.invalid/api/x?user_id=owner1'),{});
  assert.equal(out.status,200);
  assert.equal(out.data.ok,true);
  assert.ok(reads.length>0);
  assert.ok(reads.every(x=>x.endsWith(':owner1')));
 });
 test(name+': regular user cannot query a different user',async()=>{
  const reads=[];const handler=runner(name,{id:'owner1',es_admin:false},reads);
  const out=await handler(new Request('https://example.invalid/api/x?user_id=owner2'),{});
  assert.equal(out.status,403);
  assert.equal(reads.length,0);
 });
 test(name+': admin can inspect another user but never bypass authentication',async()=>{
  const reads=[];const handler=runner(name,{id:'admin1',es_admin:true},reads);
  const out=await handler(new Request('https://example.invalid/api/x?user_id=other'),{});
  assert.equal(out.status,200);
  assert.ok(reads.every(x=>x.endsWith(':admin1')),'Admin keeps existing account selection semantics');
 });
}
test('canonical source stays untouched and valid',()=>{
 assert.match(canonical,/async function handleTelegramStatus\(/);
 assert.match(canonical,/async function handleWhatsAppStatus\(/);
});
