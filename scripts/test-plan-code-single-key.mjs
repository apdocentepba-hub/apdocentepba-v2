import assert from 'node:assert/strict';
import fs from 'node:fs';

const workerPath = process.argv[2] || 'worker-live/worker_hotfix.js';
const worker = fs.readFileSync(workerPath, 'utf8');
const target = 'plan_code: entitlement?.plan_code || null,';
const lines = worker.split(/\r?\n/);

for (let i = 0; i < lines.length; i += 1) {
  if (!lines[i].includes(target)) continue;
  const window = lines.slice(i + 1, i + 5).join('\n');
  assert.ok(!window.includes(target), `duplicate plan_code key near line ${i + 1}`);
}

console.log('plan_code duplicate guard: OK');
