import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildTelegramCandidate} from './build-telegram-webhook-candidate.mjs';

const baseline = fs.readFileSync(new URL('../worker-live/worker_hotfix.js', import.meta.url),'utf8');
const candidate = buildTelegramCandidate(baseline);
const begin = candidate.indexOf('function telegramLinkKey(code) {');
const end = candidate.indexOf('\n__name(buildTelegramBotLink,',begin);
assert.ok(begin>=0 && end>begin,'Ephemeral deep-link code must exist');

function sandbox() {
  const records = new Map();
  const writes = [];
  const kv = {
    async get(k) {return records.get(k)||null;},
    async put(k,v,opts){writes.push({key:k,ttl:opts?.expirationTtl});records.set(k,v);},
    async delete(k){return records.delete(k);}
  };
  const funcs = vm.runInNewContext(candidate.slice(begin,end) +
    ';({telegramLinkKey,issueTelegramLinkCode,buildTelegramBotLink})',
    {getChannelStateStore:env=>env.KV,crypto:{randomUUID:()=>'01234567-89ab-4def-8123-456789abcdef'}});
  return {funcs,records,writes,env:{KV:kv,TELEGRAM_BOT_USERNAME:'APDAlertsBot'}};
}

test('issue an opaque 10-minute Telegram link bound to the server-side user',async()=>{
  const {funcs,env,records,writes}=sandbox();
  const user='11111111-1111-4111-8111-111111111111';
  const code=await funcs.issueTelegramLinkCode(env,user);
  assert.match(code,/^apd_[0-9a-f]{32}$/);
  const link=funcs.buildTelegramBotLink(env,code);
  assert.equal(link,'https://t.me/APDAlertsBot?start='+code);
  assert.equal(link.includes(user),false,'Link must not expose user UUID');
  assert.equal(records.get(funcs.telegramLinkKey(code)),user.toUpperCase());
  assert.equal(writes[0].ttl,600);
});

test('no KV or no bot username: do not issue a link',async()=>{
  const {funcs,env}=sandbox();
  assert.equal(await funcs.issueTelegramLinkCode({},'11111111-1111-4111-8111-111111111111'),'');
  assert.equal(await funcs.issueTelegramLinkCode({KV:env.KV},'11111111-1111-4111-8111-111111111111'),'');
  assert.equal(funcs.buildTelegramBotLink(env,'11111111-1111-4111-8111-111111111111'),'');
});

test('consumed nonce cannot be resolved from KV afterwards',async()=>{
  const {funcs,env,records}=sandbox();
  const code=await funcs.issueTelegramLinkCode(env,'11111111-1111-4111-8111-111111111111');
  const key=funcs.telegramLinkKey(code);
  assert.ok(records.get(key));
  await env.KV.delete(key);
  assert.equal(await env.KV.get(key),null);
});

test('legacy raw UUID deep-links are rejected by webhook',()=>{
  const begin = candidate.indexOf('async function handleTelegramWebhook(');
  const end = candidate.indexOf('\n__name(handleTelegramWebhook,',begin);
  assert.ok(begin>=0 && end>begin);
  const body=candidate.slice(begin,end);
  assert.match(body,/const validStartPayload = \/\^apd_\[0-9a-f\]\{32\}\$\//);
  assert.match(body,/telegram_link_expired_or_used/);
  assert.match(body,/await kv\.delete\(telegramLinkKey\(linkCode\)\)/);
  const send=body.indexOf('await sendTelegramText(',body.indexOf('const prev = await getTelegramState(env, userId)'));
  const saved=body.indexOf('const next = await saveTelegramState(env, userId,',send);
  const deleted=body.indexOf('await kv.delete(telegramLinkKey(linkCode))',saved);
  assert.ok(send>0 && saved>send && deleted>saved);
});

test('only bearer-authenticated channel endpoints issue Telegram codes',()=>{
  const statusStart=candidate.indexOf('async function handleTelegramStatus(');
  const statusEnd=candidate.indexOf('\n__name(handleTelegramStatus,',statusStart);
  const status=candidate.slice(statusStart,statusEnd);
  assert.match(status,/const authUser = await getSessionUserByBearer\(env, request\)/);
  assert.match(status,/if \(!user\?\.id\)/);
  assert.match(status,/await issueTelegramLinkCode\(env, user\.id\)/);
  const prefsIndex=candidate.indexOf('async function handleGuardarPreferenciasChannelsAware(');
  assert.ok(prefsIndex>0);
  const prefs=candidate.slice(prefsIndex,prefsIndex+5000);
  assert.match(prefs,/await getSessionUserByBearer\(env, request\)/);
  assert.match(prefs,/\?\.id === userId \? await issueTelegramLinkCode/);
});
