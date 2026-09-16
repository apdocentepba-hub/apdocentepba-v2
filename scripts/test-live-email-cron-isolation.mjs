import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = process.argv[2];
assert.ok(file, 'usage: node scripts/test-live-email-cron-isolation.mjs <worker_hotfix.js>');
const source = fs.readFileSync(file, 'utf8');

const start = source.indexOf('async scheduled(event, env, ctx) {');
assert.notEqual(start, -1, 'EMAIL_CRON_ISOLATION_V1: scheduled handler must exist');
const end = source.indexOf('\n};\nasync function handleTestMail', start);
assert.notEqual(end, -1, 'EMAIL_CRON_ISOLATION_V1: scheduled handler end must exist');
const scheduled = source.slice(start, end);

assert.equal(
  scheduled.includes('runObservedProvinciaBackfill(env, event)'),
  false,
  'EMAIL_CRON_ISOLATION_V1: broken provincial maintenance must not share the digest cron invocation'
);

assert.ok(
  /try\s*\{[\s\S]*?runEmailAlertsSweep\s*\(/.test(scheduled),
  'EMAIL_CRON_ISOLATION_V1: scheduled digest sweep must be inside an explicit try block'
);
assert.ok(
  /catch\s*\(err\)[\s\S]*?sweep_unhandled/.test(scheduled),
  'EMAIL_CRON_ISOLATION_V1: unhandled sweep errors must be converted into observable telemetry'
);
assert.ok(
  /recordObservedEmailCron\s*\(/.test(scheduled),
  'EMAIL_CRON_ISOLATION_V1: scheduled digest must persist telemetry'
);

console.log('EMAIL_CRON_ISOLATION_V1: ok');
