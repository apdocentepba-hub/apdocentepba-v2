import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = '.github/workflows/promote-live-worker-safe.yml';
assert.ok(fs.existsSync(path), 'safe production promotion workflow must exist');
const workflow = fs.readFileSync(path, 'utf8');

assert.match(workflow, /ops\/promote-live-worker-b506502-20260916/, 'workflow must be scoped to the approved temporary branch');
assert.match(workflow, /39b52f3c-faf6-4a15-8e93-7bbd2884b95d/, 'workflow must pin the currently active production version before promotion');
assert.match(workflow, /wrangler\s+versions\s+upload/, 'workflow must upload a zero-traffic candidate first');
assert.match(workflow, /--preview-alias\s+apd-promote/, 'workflow must expose an isolated preview before promotion');
assert.match(workflow, /bindings.*27|27.*bindings/s, 'workflow must validate the 27-binding production shape');
assert.match(workflow, /module hash|sha256|createHash/i, 'workflow must verify module hashes before promotion');
assert.match(workflow, /rollback\s*\(\)/, 'workflow must implement automatic rollback');
assert.match(workflow, /trap\s+rollback\s+ERR/, 'workflow must arm rollback after promotion starts');
assert.match(workflow, /strategy.*percentage/s, 'workflow must promote with an explicit percentage deployment');
assert.match(workflow, /api\/version/, 'workflow must smoke the production version endpoint');
assert.match(workflow, /api\/planes/, 'workflow must smoke the production plans endpoint');
assert.match(workflow, /test-sensitive-test-endpoints\.mjs/, 'workflow must verify sensitive endpoint guards before upload');
assert.match(workflow, /test-mercadopago-status-mapping\.mjs/, 'workflow must verify Mercado Pago status mapping before upload');

console.log('safe production promotion workflow contract: OK');
