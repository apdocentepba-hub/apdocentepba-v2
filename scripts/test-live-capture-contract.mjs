import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/smoke-live-worker-contracts.yml', import.meta.url), 'utf8');

assert.match(
  workflow,
  /live-worker-canonical-capture/,
  'smoke must upload a canonical live Worker capture artifact'
);
assert.match(
  workflow,
  /manifest\.json/,
  'smoke must generate a sanitized manifest.json for the active Worker'
);
assert.match(
  workflow,
  /actions\/upload-artifact@v4/,
  'smoke must persist the live Worker capture as a GitHub artifact'
);
assert.match(
  workflow,
  /module_sha256/,
  'manifest generation must record SHA-256 hashes for captured modules'
);
assert.doesNotMatch(
  workflow,
  /content_base64[^\n]*manifest|manifest[^\n]*content_base64/i,
  'manifest must not serialize raw module base64 fields'
);
assert.match(
  workflow,
  /node scripts\/test-live-source-equivalence\.mjs\s+["']?\$?ROOT["']?/,
  'smoke must compare every fresh live capture against the committed canonical snapshot'
);
assert.match(
  workflow,
  /worker-live\/\*\*/,
  'smoke must rerun when the canonical worker-live snapshot changes'
);

console.log('live capture contract: OK');
