import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflowPath = new URL('../.github/workflows/worker-zero-traffic-preview.yml', import.meta.url);
assert.ok(fs.existsSync(workflowPath), 'zero-traffic Worker preview workflow must exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');

assert.match(workflow, /pull_request:/, 'preview validation must run on same-repository pull requests');
assert.match(workflow, /wrangler\s+versions\s+upload/, 'candidate validation must upload a Worker version without deploying traffic');
assert.match(workflow, /--preview-alias\s+apd-candidate/, 'candidate upload must expose a stable isolated preview alias');
assert.doesNotMatch(workflow, /wrangler\s+versions\s+deploy/, 'preview workflow must never promote a version');
assert.doesNotMatch(workflow, /wrangler\s+deploy(?!\s+--dry-run)/, 'preview workflow must never perform a direct production deploy');
assert.match(workflow, /PRODUCTION_VERSION_BEFORE/, 'workflow must capture the active production version before candidate upload');
assert.match(workflow, /PRODUCTION_VERSION_AFTER/, 'workflow must confirm production version remains unchanged after candidate upload');
assert.match(workflow, /EMAIL_SWEEP_STATE/, 'candidate version binding verification must include the production KV binding');
assert.match(workflow, /candidate binding shape/i, 'workflow must verify candidate binding metadata without printing secret values');
assert.doesNotMatch(workflow, /set\s+-x/, 'workflow must not enable shell tracing around Cloudflare secrets');

console.log('zero-traffic Worker preview contract: OK');
