import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('worker-live/worker_hotfix.js', 'utf8');
const scheduledStart = worker.indexOf('async scheduled(event, env, ctx)');
const scheduledEnd = worker.indexOf('\n};\nasync function handleTestMail', scheduledStart);
assert.ok(scheduledStart >= 0 && scheduledEnd > scheduledStart, 'scheduled email handler must be present');
const scheduled = worker.slice(scheduledStart, scheduledEnd);

const staleStart = scheduled.indexOf('if (activeFinished) {');
assert.ok(staleStart >= 0, 'scheduled handler must handle a stale finished active slot');
const staleEnd = scheduled.indexOf('\n  }\n\n  let result = null;', staleStart);
assert.ok(staleEnd > staleStart, 'stale-slot cleanup block must be bounded');
const staleBlock = scheduled.slice(staleStart, staleEnd);

assert.doesNotMatch(
  staleBlock,
  /await kv\.delete\(ACTIVE_SLOT_KEY\)[\s\S]{0,500}\breturn\s*;/,
  'clearing a previously finished active slot must not consume the current cron invocation'
);
assert.match(
  staleBlock,
  /slot\.slot_hour[\s\S]{0,1200}activeSlotKey\s*=\s*slot\.slot_key/,
  'after clearing a stale slot, the same invocation must adopt the current digest slot when it is pending'
);

console.log('email stale-slot cron regression: OK');
