import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hardenMessagingStatus} from './create-messaging-status-auth-candidate.mjs';
import {compareWorkerModules} from './audit-apd-worker-drift.mjs';
import {validateOnlyMessagingHandlersChanged} from './stage-live-messaging-auth.mjs';

const baseline=fs.readFileSync('worker-live/worker_hotfix.js','utf8');
test('source-specific patch changes only Telegram and WhatsApp status handlers',()=>{
 const patched=hardenMessagingStatus(baseline);
 assert.equal(validateOnlyMessagingHandlersChanged(baseline,patched),true);
 assert.notEqual(patched,baseline);
 const cmp=compareWorkerModules(Buffer.from(baseline),Buffer.from(patched));
 assert.deepEqual([...cmp.functionsChanged].sort(),['handleTelegramStatus','handleWhatsAppStatus'].sort());
 assert.equal(cmp.telegramStatusUnsafeIdFallback,false);
 assert.equal(cmp.whatsappStatusUnsafeIdFallback,false);
});
test('refuse unrelated payment or auth changes',()=>{
 const patched=hardenMessagingStatus(baseline);
 const altered=patched.replace('async function handleMercadoPagoWebhook(', 'async function handleMercadoPagoWebhook2(');
 assert.throws(()=>validateOnlyMessagingHandlersChanged(baseline,altered),/Candidate changes outside/);
});
test('prevents accidental leak or deploying from preview script',()=>{
 const s=fs.readFileSync('scripts/stage-live-messaging-auth.mjs','utf8');
 assert.match(s,/stdio:\['ignore','pipe','pipe'\]/);
 assert.match(s,/output redacted/);
 assert.match(s,/['"]versions['"],['"]upload['"]/);
 assert.doesNotMatch(s,/['"]versions['"],['"]deploy['"]/);
 assert.doesNotMatch(s,/['"]wrangler['"],['"]deploy['"]/);
 assert.doesNotMatch(s,/console\.log\(\s*(before|after|source|token|account)\s*\)/);
 assert.match(s,/if\(final\.id!==before\.id\)/);
});
