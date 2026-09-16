import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../worker-live/manifest.json', import.meta.url), 'utf8'));
const wrangler = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const equivalence = fs.readFileSync(new URL('./test-live-source-equivalence.mjs', import.meta.url), 'utf8');

const sweepState = (manifest.bindings || []).find((binding) => binding.name === 'EMAIL_SWEEP_STATE');
assert.ok(sweepState, 'canonical manifest must include EMAIL_SWEEP_STATE');
assert.equal(sweepState.type, 'kv_namespace', 'EMAIL_SWEEP_STATE must remain a KV namespace binding');
assert.match(
  String(sweepState.namespace_id || ''),
  /^[0-9a-f]{32}$/,
  'canonical manifest must record the public EMAIL_SWEEP_STATE namespace_id'
);

assert.match(wrangler, /keep_vars\s*=\s*true/, 'Wrangler must preserve existing scalar vars during deploy');
assert.match(wrangler, /\[\[kv_namespaces\]\]/, 'Wrangler must declare the production KV namespace binding');
assert.match(wrangler, /binding\s*=\s*"EMAIL_SWEEP_STATE"/, 'Wrangler must bind EMAIL_SWEEP_STATE');
assert.match(
  wrangler,
  new RegExp(`id\\s*=\\s*"${sweepState.namespace_id}"`),
  'Wrangler KV id must match the canonical live manifest'
);
assert.match(equivalence, /namespace_id/, 'live↔repo equivalence must compare resource identifiers, not only binding name/type');

console.log('reproducible Worker binding config contract: OK');
