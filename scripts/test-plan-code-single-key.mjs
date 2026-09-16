import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npx,
  ['wrangler', 'deploy', '--dry-run', '--outdir', 'tmp/wrangler-dry-run'],
  { encoding: 'utf8' }
);

const output = `${result.stdout || ''}${result.stderr || ''}`;
process.stdout.write(output);

assert.equal(result.error, undefined, `wrangler dry-run failed to start: ${result.error?.message || result.error}`);
assert.equal(result.status, 0, `wrangler dry-run exited with status ${result.status}`);
assert.doesNotMatch(
  output,
  /duplicate-object-key/i,
  'wrangler/esbuild reported a duplicate object key in the canonical Worker bundle'
);

console.log('duplicate object key package guard: OK');
