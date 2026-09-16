import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/smoke-live-worker-contracts.yml', import.meta.url), 'utf8');

assert.match(
  workflow,
  /namespace_id/,
  'live capture must preserve the public KV namespace identifier needed for reproducible binding configuration'
);
assert.match(
  workflow,
  /EMAIL_SWEEP_STATE/,
  'live capture must explicitly validate the EMAIL_SWEEP_STATE KV binding'
);
assert.match(
  workflow,
  /kv_namespace/,
  'live capture must distinguish KV namespace bindings from scalar vars and secrets'
);
assert.doesNotMatch(
  workflow,
  /secret_text[^\n]*(text|value)|(?:text|value)[^\n]*secret_text/i,
  'capture must never serialize secret values'
);

console.log('live resource binding capture contract: OK');
