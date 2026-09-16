import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
assert.ok(file, 'usage: node scripts/test-live-manual-email-dedupe.mjs <worker_hotfix.js>');
const source = fs.readFileSync(file, 'utf8');

function extractNamedFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `MANUAL_EMAIL_DEDUPE_V1: ${name} must exist`);

  const bundledEndMarker = `__name(${name}, "${name}");`;
  const bundledEnd = source.indexOf(bundledEndMarker, start);
  if (bundledEnd !== -1) return source.slice(start, bundledEnd);

  const openParen = source.indexOf('(', start);
  let parenDepth = 0;
  let quote = null;
  let escaped = false;
  let bodyStart = -1;

  for (let i = openParen; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth -= 1;
    else if (ch === '{' && parenDepth === 0) { bodyStart = i; break; }
  }
  assert.notEqual(bodyStart, -1, `MANUAL_EMAIL_DEDUPE_V1: ${name} body must exist`);

  let depth = 0;
  quote = null;
  escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`MANUAL_EMAIL_DEDUPE_V1: could not extract ${name}`);
}

const helperSource = extractNamedFunction('buildEmailDigestDedupeKey');
const context = {};
vm.createContext(context);
vm.runInContext(helperSource, context);

const base = {
  source: 'manual_test',
  userId: '00000000-0000-4000-8000-000000000001',
  visibleAlertKeys: ['u:D_4286111', 'u:D_4285988'],
  now: Date.parse('2026-09-15T19:10:17Z')
};

const first = context.buildEmailDigestDedupeKey(base);
const sevenSecondsLater = context.buildEmailDigestDedupeKey({ ...base, now: base.now + 7000 });
assert.ok(first, 'MANUAL_EMAIL_DEDUPE_V1: manual sends must reserve a non-empty dedupe key');
assert.equal(sevenSecondsLater, first, 'MANUAL_EMAIL_DEDUPE_V1: same manual digest seven seconds later must be idempotent');

const differentAlerts = context.buildEmailDigestDedupeKey({ ...base, visibleAlertKeys: ['u:D_9999999'] });
assert.notEqual(differentAlerts, first, 'MANUAL_EMAIL_DEDUPE_V1: changed visible offers must remain testable');

const explicitA = context.buildEmailDigestDedupeKey({ ...base, idempotencyKey: 'request-123', now: base.now });
const explicitB = context.buildEmailDigestDedupeKey({ ...base, idempotencyKey: 'request-123', now: base.now + 3600000 });
assert.equal(explicitA, explicitB, 'MANUAL_EMAIL_DEDUPE_V1: explicit idempotency keys must survive time windows');

const cron = context.buildEmailDigestDedupeKey({ source: 'cron_slot', slotKey: '2026-09-15_18', userId: base.userId, visibleAlertKeys: base.visibleAlertKeys, now: base.now });
assert.equal(cron, `email_digest:2026-09-15_18:${base.userId}`, 'MANUAL_EMAIL_DEDUPE_V1: cron dedupe semantics must not change');

assert.ok(
  /buildEmailDigestDedupeKey\s*\(\s*\{[^}]*source[^}]*slotKey[^}]*userId[^}]*visibleAlertKeys/s.test(source),
  'MANUAL_EMAIL_DEDUPE_V1: runEmailAlertsSweep must use the shared dedupe helper with visible alerts'
);

console.log('MANUAL_EMAIL_DEDUPE_V1: ok');
