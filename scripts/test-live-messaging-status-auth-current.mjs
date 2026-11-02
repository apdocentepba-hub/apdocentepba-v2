// Regression against the ACTUAL canonical Telegram/WhatsApp status handlers.
// Node-only, no network and no production endpoints, tokens, database or updates.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hardenMessagingStatus} from './create-messaging-status-auth-candidate.mjs';
import {assertAuthorizedPromotion} from './release-live-messaging-auth.mjs';

const canonical = readFileSync('worker-live/worker_hotfix.js','utf8');
const handlers = ['handleTelegramStatus','handleWhatsAppStatus'];
const legacyBypass = 'if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId);';

function isolate(name) {
  const first = canonical.indexOf('async function '+name+'(request, env) {');
  const last = canonical.indexOf('\n__name('+name+',',first);
  assert.ok(first >= 0 && last > first, 'Cannot uniquely bound '+name);
  const snippet = canonical.slice(first,last);
  assert.equal(canonical.split('async function '+name+'(request, env) {').length-1,1);
  return snippet;
}
function handler(name, authUser, reads) {
  const body = isolate(name);
  const dependencies = [
    'getSessionUserByBearer', 'json2', 'obtenerPreferenciasUsuario', 'getTelegramState',
    'resolveTelegramEntitlement', 'maskChatId', 'buildTelegramBotLink', 'getWhatsAppState',
    'resolveWhatsAppEntitlement', 'buildWhatsAppBotNumber', 'buildWhatsAppBotLink', 'maskPhone'
  ];
  const values = [
    async () => authUser,
    (data,status=200) => ({status,data}),
    async (_env,id) => {reads.push('preferences:'+id);return {alertas_telegram:true,alertas_whatsapp:true};},
    async (_env,id) => {reads.push('tg-state:'+id);return {connected:true,chat_id:'fake-chat'};},
    async (_env,id) => {reads.push('tg-plan:'+id);return {allowed:true,source:'test',plan_code:'PLUS',plan_name:'Plus'};},
    () => '***', () => 'https://example.invalid/tg',
    async (_env,id) => {reads.push('wa-state:'+id);return {connected:true};},
    async (_env,id) => {reads.push('wa-plan:'+id);return {allowed:true,plan_code:'PLUS',plan_name:'Plus'};},
    () => 'fake-number', () => 'https://example.invalid/wa', () => '***'
  ];
  return new Function(...dependencies,body+'\nreturn '+name)(...values);
}

test('Both canonical handlers already require Bearer session; no legacy bypass remains', () => {
  assert.equal(canonical.split(legacyBypass).length-1,0);
  for(const name of handlers) {
    const body=isolate(name);
    assert.match(body,/const authUser = await getSessionUserByBearer\(env, request\);/);
    assert.match(body,/const user = authUser;/);
    assert.doesNotMatch(body,/obtenerUsuario\(env, requestedUserId\)/);
  }
  assert.throws(()=>hardenMessagingStatus(canonical),/Expected exactly Telegram and WhatsApp status patterns/);
  assert.throws(()=>assertAuthorizedPromotion(canonical,canonical,[],[]),/Expected exactly Telegram and WhatsApp status patterns|Release refused/);
});

for(const name of handlers) {
  test(name+': supplied user_id without Bearer gets 401 before any state access',async()=>{
    const reads=[];
    const result=await handler(name,null,reads)(new Request('https://example.invalid/api/status?user_id=other'),{});
    assert.equal(result.status,401);
    assert.deepEqual(reads,[]);
  });
  test(name+': authenticated user cannot see another user_id',async()=>{
    const reads=[];
    const result=await handler(name,{id:'test-one',es_admin:false},reads)(
      new Request('https://example.invalid/api/status?user_id=test-two'),{});
    assert.equal(result.status,403);
    assert.deepEqual(reads,[]);
  });
  test(name+': authenticated user can only read own records',async()=>{
    const reads=[];
    const result=await handler(name,{id:'test-one',es_admin:false},reads)(
      new Request('https://example.invalid/api/status?user_id=test-one'),{});
    assert.equal(result.status,200);
    assert.equal(result.data.ok,true);
    assert.ok(reads.length>0);
    assert.ok(reads.every(x=>x.endsWith(':test-one')));
  });
  test(name+': admin request still requires own Bearer and does not bypass account identity',async()=>{
    const reads=[];
    const result=await handler(name,{id:'admin-one',es_admin:true},reads)(
      new Request('https://example.invalid/api/status?user_id=target-other'),{});
    assert.equal(result.status,200);
    assert.ok(reads.length>0);
    assert.ok(reads.every(x=>x.endsWith(':admin-one')));
  });
}
console.log('APD_MSG_CANONICAL_STATUS_REGRESSION_ONLY — no deployment performed');
