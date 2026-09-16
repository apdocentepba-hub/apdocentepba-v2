import assert from 'node:assert/strict';
import fs from 'node:fs';

const wrangler = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(
  wrangler,
  /main\s*=\s*"worker-live\/worker_hotfix\.js"/,
  'Wrangler must package the canonical live Worker entrypoint'
);

const packageWorker = String(pkg.scripts?.['package:worker'] || '');
assert.match(
  packageWorker,
  /wrangler\s+deploy\s+--dry-run\b/,
  'package:worker must use Wrangler dry-run packaging'
);
assert.match(
  packageWorker,
  /--outdir\s+tmp\/wrangler-dry-run\b/,
  'package:worker must write inspectable dry-run output'
);

const deployWorker = String(pkg.scripts?.['deploy:worker'] || '');
assert.match(
  deployWorker,
  /PRODUCTION_SOURCE_GUARD_V1/,
  'real production deploy must remain guarded'
);
assert.doesNotMatch(
  deployWorker,
  /\bwrangler\s+deploy\b/,
  'deploy:worker must not perform a real Wrangler deploy during canonicalization'
);

console.log('canonical Worker packaging contract: OK');
