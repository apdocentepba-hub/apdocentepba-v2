import assert from 'node:assert/strict';
import fs from 'node:fs';

const smoke = fs.readFileSync(new URL('../.github/workflows/smoke-live-worker-contracts.yml', import.meta.url), 'utf8');
const equivalence = fs.readFileSync(new URL('./test-live-source-equivalence.mjs', import.meta.url), 'utf8');

assert.match(smoke, /github\.event\.pull_request\.base\.sha/, 'PR live smoke must anchor production comparison to the PR base commit');
assert.match(smoke, /PRODUCTION_CANONICAL_DIR/, 'PR live smoke must use an explicit production canonical directory');
assert.match(
  smoke,
  /test-live-source-equivalence\.mjs\s+"\$ROOT"\s+"\$PRODUCTION_CANONICAL_DIR"/,
  'live equivalence must compare production capture against the selected canonical baseline'
);
assert.match(equivalence, /process\.argv\[3\]/, 'equivalence checker must accept an explicit canonical directory');

console.log('PR production baseline contract: OK');
