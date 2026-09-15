import fs from 'node:fs';

const p=process.argv[2];
if(!p) throw new Error('usage: node scripts/test-backfill-telemetry-live.mjs <worker_hotfix.js>');
const s=fs.readFileSync(p,'utf8');
const assert=(c,m)=>{if(!c) throw new Error(m)};

const finalStart=s.lastIndexOf('var worker_hotfix_default = {');
assert(finalStart>=0,'final router missing');
const final=s.slice(finalStart);
const scheduledAt=final.indexOf('async scheduled(event, env, ctx)');
assert(scheduledAt>=0,'scheduled handler missing');
const scheduled=final.slice(scheduledAt);

assert(s.includes('async function runObservedProvinciaBackfill'), 'RED: observed province backfill helper missing');
assert(s.includes('worker_runs'), 'RED: worker_runs telemetry missing');
assert(s.includes('errores_sistema'), 'RED: errores_sistema telemetry missing');
assert(/runProvinciaBackfillStep\(env,\s*\{\s*source:\s*["']cron_maintenance["'],\s*force:\s*false\s*\}\)/m.test(s), 'RED: bounded province step is not wired');
assert(/ctx\.waitUntil\(runObservedProvinciaBackfill\(env, event\)\)/.test(scheduled), 'RED: province backfill is not independent waitUntil work');
assert(/recordObservedEmailCron/.test(scheduled), 'RED: email cron result is not observed');

// Existing direct email slot contract must remain present.
for(const marker of [
  'getArgentinaDigestSlotInfo(event?.scheduledTime || Date.now())',
  'getChannelStateStore(env)',
  'email:active_slot_key',
  'email:slot:${slot.slot_key}:finished',
  'runEmailAlertsSweep(env, {',
  'source: "cron_slot"',
  'CRON EMAIL SWEEP RESULT',
  'if (result?.finished)',
  'CRON EMAIL SLOT FINISHED'
]) assert(scheduled.includes(marker), `email cron regression: missing ${marker}`);

// Do not silently re-enable other outbound channels or old digest queue.
const scheduledPrefix=scheduled.split('};\nasync function handleTestMail')[0];
assert(!/runWhatsAppAlertsSweep\s*\(/.test(scheduledPrefix), 'WhatsApp cron must remain disabled');
assert(!/sendPendingEmailDigests\s*\(/.test(scheduledPrefix), 'legacy digest queue must remain disabled');
assert(!/processPendingEmailQueue\s*\(/.test(scheduledPrefix), 'pending queue cron must remain disabled');

// Security invariants from #689 must survive.
assert(!/else\s*\{\s*userId\s*=\s*token\s*;\s*\}/m.test(s), 'UUID bearer fallback returned');
assert(final.includes('SENSITIVE_TEST_PATHS.has(path)'), 'sensitive test route guard missing');
assert(final.indexOf('SENSITIVE_TEST_PATHS.has(path)') < final.indexOf('/version`'), 'security guard moved behind routes');

console.log('PASS: bounded province backfill + telemetry are wired without changing outbound-channel policy');
