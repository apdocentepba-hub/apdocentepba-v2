import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hardenMessagingStatus} from './create-messaging-status-auth-candidate.mjs';
import {evaluatePromotionGate} from './check-messaging-release-gate.mjs';
const baseline=fs.readFileSync('worker-live/worker_hotfix.js','utf8');
const patched=hardenMessagingStatus(baseline);
const bindings=[
  {name:'MERCADOPAGO_WEBHOOK_SECRET',type:'secret_text'},
  {name:'TELEGRAM_BOT_TOKEN',type:'plain_text',text:'test-only'},
  {name:'EMAIL_SWEEP_STATE',type:'kv_namespace',namespace_id:'synthetic-kv'}
];
test('only the two status access guards can reach ready',()=>{
 const x=evaluatePromotionGate(baseline,patched,bindings,bindings);
 assert.equal(x.readyToPromote,true);
 assert.equal(x.exactPatch,true);
 assert.equal(x.changedOnlyTwo,true);
});
test('other Worker source changes are a hard blocker',()=>{
 const x=evaluatePromotionGate(baseline,patched.replace('async function handleMercadoPagoWebhook(', 'async function handleMercadoPagoWebhook2('),bindings,bindings);
 assert.equal(x.readyToPromote,false);
 assert.equal(x.exactPatch,false);
});
test('changed plaintext or missing secret blocks release without printing values',()=>{
 const drift=bindings.map(x=>x.name==='TELEGRAM_BOT_TOKEN'?{...x,text:'changed-test-only'}:x);
 assert.equal(evaluatePromotionGate(baseline,patched,bindings,drift).readyToPromote,false);
 const missing=bindings.filter(x=>x.name!=='MERCADOPAGO_WEBHOOK_SECRET');
 assert.equal(evaluatePromotionGate(baseline,patched,bindings,missing).readyToPromote,false);
});
test('unmodified source does not count as a valid security patch',()=>{
 const x=evaluatePromotionGate(baseline,baseline,bindings,bindings);
 assert.equal(x.readyToPromote,false);
 assert.equal(x.noUnsafeStatusFallback,false);
});
