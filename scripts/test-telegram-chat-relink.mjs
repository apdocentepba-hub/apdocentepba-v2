import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildTelegramCandidate } from './build-telegram-webhook-candidate.mjs';

const original = fs.readFileSync(new URL('../worker-live/worker_hotfix.js', import.meta.url),'utf8');
const source = buildTelegramCandidate(original);

function extract(name) {
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('\n__name('+name+',',start);
  assert.ok(start>=0 && end>start, 'missing '+name);
  return source.slice(start,end);
}
const fns=['telegramStateKey','telegramChatStateKey','getTelegramState','saveTelegramState','getTelegramUserIdByChat'];
const context=vm.createContext({
  getChannelStateStore(env) {return env?.KV||null;},
  Date,JSON,String
});
const modules=vm.runInContext(
  fns.map(extract).join('\n')+';({telegramStateKey,telegramChatStateKey,saveTelegramState,getTelegramState,getTelegramUserIdByChat})',
  context
);

function setup() {
  const data=new Map();
  const env={KV:{
    async get(key){return data.get(key)??null;},
    async put(key,value){data.set(key,value);},
    async delete(key){data.delete(key);}
  }};
  return {data,env};
}

test('moving to a new chat invalidates and deletes old reverse-link',async()=>{
  const {env,data}=setup();
  const userId='11111111-1111-4111-8111-111111111111';
  await modules.saveTelegramState(env,userId,{connected:true,chat_id:'123'});
  assert.equal(await modules.getTelegramUserIdByChat(env,'123'),userId.toUpperCase());
  await modules.saveTelegramState(env,userId,{connected:true,chat_id:'456'});
  assert.equal(data.has(modules.telegramChatStateKey('123')),false);
  assert.equal(await modules.getTelegramUserIdByChat(env,'123'),'');
  assert.equal(await modules.getTelegramUserIdByChat(env,'456'),userId.toUpperCase());
});

test('stale KV reverse-link does not allow old chat to fetch user alerts',async()=>{
  const {env,data}=setup();
  const userId='11111111-1111-4111-8111-111111111111';
  await modules.saveTelegramState(env,userId,{connected:true,chat_id:'456'});
  data.set(modules.telegramChatStateKey('123'),userId.toUpperCase());
  assert.equal(await modules.getTelegramUserIdByChat(env,'123'),'');
  assert.equal(await modules.getTelegramUserIdByChat(env,'456'),userId.toUpperCase());
});

test('disconnected and unknown chat mappings cannot authorize user access',async()=>{
  const {env,data}=setup();
  const userId='11111111-1111-4111-8111-111111111111';
  data.set(modules.telegramChatStateKey('123'),userId.toUpperCase());
  await modules.saveTelegramState(env,userId,{connected:false,chat_id:'123'});
  assert.equal(await modules.getTelegramUserIdByChat(env,'123'),'');
  assert.equal(await modules.getTelegramUserIdByChat(env,'999'),'');
});
