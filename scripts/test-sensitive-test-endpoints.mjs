import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('worker-live/worker_hotfix.js', 'utf8');
const requiredPaths = [
  '/test-mail',
  '/test-email-sweep',
  '/test-digest',
  '/api/test-db',
  '/api/whatsapp/test-send',
  '/api/debug-lomas-pr'
];

const setStart = worker.indexOf('SENSITIVE_TEST_PATHS');
assert.ok(setStart >= 0, 'canonical Worker must define SENSITIVE_TEST_PATHS');
const setEnd = worker.indexOf(']);', setStart);
assert.ok(setEnd > setStart, 'SENSITIVE_TEST_PATHS must be a bounded Set');
const sensitiveSet = worker.slice(setStart, setEnd + 3);
for (const path of requiredPaths) {
  assert.ok(sensitiveSet.includes(`"${path}"`) || sensitiveSet.includes(`'${path}'`), `${path} must be in SENSITIVE_TEST_PATHS`);
}

assert.match(worker, /ADMIN_TEST_SECRET/, 'sensitive test gate must depend on ADMIN_TEST_SECRET');
assert.match(worker, /X-Admin-Test-Secret/i, 'sensitive test gate must accept X-Admin-Test-Secret');
assert.match(worker, /requireAdminTestSecret\s*\(/, 'canonical Worker must implement requireAdminTestSecret');

const gateIndex = worker.indexOf('SENSITIVE_TEST_PATHS.has(path)');
const fallbackIndex = worker.lastIndexOf('return await worker_default.fetch(request, env, ctx)');
assert.ok(gateIndex >= 0, 'sensitive route gate must execute in the hotfix router');
assert.ok(fallbackIndex > gateIndex, 'sensitive test gate must run before fallback to the legacy Worker');

console.log('sensitive test endpoints contract: OK');
