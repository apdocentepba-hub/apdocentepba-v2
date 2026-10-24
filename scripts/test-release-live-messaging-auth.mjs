import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertAuthorizedPromotion} from './release-live-messaging-auth.mjs';
import {hardenMessagingStatus} from './create-messaging-status-auth-candidate.mjs';

const canonical=fs.readFileSync('worker-live/worker_hotfix.js','utf8');
const patched=hardenMessagingStatus(canonical);
const bindings=[
 {name:'MERCADOPAGO_WEBHOOK_SECRET',type:'secret_text'},
 {name:'TELEGRAM_BOT_TOKEN',type:'plain_text',text:'synthetic-test-token'},
 {name:'EMAIL_SWEEP_STATE',type:'kv_namespace',namespace_id:'synthetic'}
];
test('only exact auth-only patch can be deployed',()=>{
 assert.equal(assertAuthorizedPromotion(canonical,patched,bindings,bindings),true);
 assert.throws(()=>assertAuthorizedPromotion(canonical,canonical,bindings,bindings),/Release refused/);
 assert.throws(()=>assertAuthorizedPromotion(canonical,patched+'// unexpected',bindings,bindings),/Release refused/);
});
test('original bindings, values and KV namespace are release invariants',()=>{
 assert.throws(()=>assertAuthorizedPromotion(canonical,patched,bindings,bindings.slice(1)),/Release refused/);
 const modified=structuredClone(bindings);
 modified[1].text='synthetic-modified-token';
 assert.throws(()=>assertAuthorizedPromotion(canonical,patched,bindings,modified),/Release refused/);
 const moved=structuredClone(bindings);moved[2].namespace_id='other';
 assert.throws(()=>assertAuthorizedPromotion(canonical,patched,bindings,moved),/Release refused/);
});
test('release demands production smoke and rollback, never touches checkout records or secrets',()=>{
 const src=fs.readFileSync('scripts/release-live-messaging-auth.mjs','utf8');
 assert.match(src,/releaseAttempted=true/);
 assert.match(src,/Automatic rollback after APD messaging status guard failure/);
 assert.match(src,/APD_WORKER_ROLLBACK_VERIFIED/);
 assert.match(src,/await smoke\(preview,true\)/);
 assert.match(src,/await smoke\(host,true\)/);
 assert.match(src,/getDeployed\(token,root\)/);
 assert.doesNotMatch(src,/console\.log\(\s*(token|account|oldDetails|newDetails)\s*\)/);
 assert.doesNotMatch(src,/\/v1\/payments\/|\/rest\/v1\/user_subscriptions/);
});
