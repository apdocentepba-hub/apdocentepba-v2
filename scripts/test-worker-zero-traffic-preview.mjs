import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const workflowPath = new URL('../.github/workflows/worker-zero-traffic-preview.yml', import.meta.url);
assert.ok(fs.existsSync(workflowPath), 'zero-traffic Worker preview workflow must exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');

assert.match(workflow, /pull_request:/, 'preview validation must run on same-repository pull requests');
assert.match(workflow, /wrangler\s+versions\s+upload/, 'candidate validation must upload a Worker version without deploying traffic');
assert.match(workflow, /--preview-alias\s+apd-candidate/, 'candidate upload must expose a stable isolated preview alias');
assert.match(workflow, /--no-bundle/, 'candidate upload must preserve the pinned Worker bundle byte-for-byte');
assert.doesNotMatch(workflow, /wrangler\s+versions\s+deploy/, 'preview workflow must never promote a version');
assert.doesNotMatch(workflow, /wrangler\s+deploy(?!\s+--dry-run)/, 'preview workflow must never perform a direct production deploy');
assert.match(workflow, /PRODUCTION_VERSION_BEFORE/, 'workflow must capture the active production version before candidate upload');
assert.match(workflow, /PRODUCTION_VERSION_AFTER/, 'workflow must confirm production version remains unchanged after candidate upload');
assert.match(workflow, /EMAIL_SWEEP_STATE/, 'candidate version binding verification must include the production KV binding');
assert.match(workflow, /candidate binding shape/i, 'workflow must verify candidate binding metadata without printing secret values');
assert.doesNotMatch(workflow, /set\s+-x/, 'workflow must not enable shell tracing around Cloudflare secrets');
const manifest = JSON.parse(fs.readFileSync(new URL('worker-live/manifest.json', root), 'utf8'));
const worker = fs.readFileSync(new URL('worker-live/worker_hotfix.js', root));
const wrangler = fs.readFileSync(new URL('wrangler.toml', root), 'utf8');
assert.equal(manifest.bindings.length, 29, 'candidate manifest must retain all 29 configuration entries');
const expectedCrons = ['0 01 * * *', '0 17 * * *', '0 21 * * *', '1-59/2 * * * *'];
const cronLine = wrangler.match(/^crons\s*=\s*(\[[^\n]+\])/m);
assert.ok(cronLine, 'wrangler config must declare cron triggers');
assert.deepEqual(JSON.parse(cronLine[1]), expectedCrons, 'candidate config must preserve all 4 cron triggers');
const hash = crypto.createHash('sha256').update(worker).digest('hex');
assert.equal(hash, manifest.candidate_build.candidate_sha256, 'candidate bundle SHA must match its manifest');
assert.equal(hash, manifest.modules[0].sha256, 'candidate module SHA must match the exact bundle SHA');

console.log('zero-traffic Worker preview contract: OK');
