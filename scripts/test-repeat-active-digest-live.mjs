import fs from 'node:fs';
import assert from 'node:assert/strict';

const [mainPath] = process.argv.slice(2);
if (!mainPath) {
  console.error('usage: node test-repeat-active-digest-live.mjs <worker_hotfix.js>');
  process.exit(2);
}

const src = fs.readFileSync(mainPath, 'utf8');

assert.ok(
  !src.includes('first_emailed_at=is.null'),
  'digest must include active offers even when they were emailed in a previous slot/day'
);
assert.ok(
  !src.includes('if (item.first_emailed_at) return false;'),
  'digest must not drop an active offer solely because first_emailed_at is set'
);
assert.ok(
  src.includes('already_sent_for_user_in_slot'),
  'per-slot dedupe must remain in place to prevent duplicate sends inside one slot'
);
assert.ok(
  src.includes('email:slot:${slotKey}:user:${userId}:sent'),
  'KV per-slot user dedupe key must remain in place'
);

console.log('repeat-active-digest contract OK');
