import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('worker-live/manifest.json', 'utf8'));
const equivalence = fs.readFileSync('scripts/test-live-source-equivalence.mjs', 'utf8');
const smoke = fs.readFileSync('.github/workflows/smoke-live-worker-contracts.yml', 'utf8');
const sourceGuard = fs.readFileSync('scripts/test-production-worker-source-guard.mjs', 'utf8');

assert.equal(manifest.main_module, 'worker_hotfix.js');
assert.deepEqual(
  (manifest.modules || []).map(x => x.name),
  [manifest.main_module],
  'canonical live manifest must describe the actual Wrangler single-module production bundle'
);
assert.ok(
  (manifest.modules || [])[0]?.source_sha256,
  'canonical live module must record raw source_sha256 separately from packaged module_sha256'
);

assert.doesNotMatch(
  equivalence,
  /const requiredModules\s*=\s*\[[\s\S]*email_queue_hotfix\.js/,
  'live source equivalence must derive packaged modules from manifest instead of hard-coding legacy helper modules'
);
assert.match(
  equivalence,
  /source_sha256/,
  'live source equivalence must distinguish repository source bytes from Wrangler-packaged bytes'
);

assert.doesNotMatch(
  smoke,
  /const requiredModules\s*=\s*\[[\s\S]*email_queue_hotfix\.js/,
  'production smoke must accept the actual Wrangler module set instead of requiring the legacy three-module upload shape'
);
assert.doesNotMatch(
  smoke,
  /for file in manifest\.json email_queue_hotfix\.js worker_email_queue_hotfix\.js worker_hotfix\.js/,
  'PR production baseline copy must derive module files from its manifest'
);
assert.match(
  smoke,
  /MANIFEST_ONLY_REFRESH/,
  'PR smoke must explicitly gate canonical manifest refreshes'
);
assert.match(
  smoke,
  /WORKER_LIVE_CHANGES\[@\][\s\S]*-eq\s+1[\s\S]*worker-live\/manifest\.json/,
  'manifest refresh must be allowed only when manifest.json is the sole worker-live change'
);
assert.match(
  smoke,
  /cp\s+worker-live\/manifest\.json\s+"\$BASE_DIR\/manifest\.json"/,
  'manifest-only refresh must validate the proposed manifest against live production'
);
assert.match(
  smoke,
  /git show\s+"\$\{PR_BASE_SHA\}:worker-live\/\$\{file\}"/,
  'manifest-only refresh must still source module bytes from the PR base commit'
);

assert.doesNotMatch(
  sourceGuard,
  /requiredModules/,
  'source-guard contract must not require the removed legacy requiredModules identifier'
);
assert.match(
  sourceGuard,
  /main module/i,
  'source-guard contract must preserve verification that the production smoke validates the active main module'
);

console.log('worker packaging guard regression: OK');
