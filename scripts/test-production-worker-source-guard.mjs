import assert from 'node:assert/strict';
import fs from 'node:fs';

const deploy = fs.readFileSync(new URL('../.github/workflows/deploy-worker-manual.yml', import.meta.url), 'utf8');
const wrangler = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const smoke = fs.readFileSync(new URL('../.github/workflows/smoke-live-worker-contracts.yml', import.meta.url), 'utf8');

assert.doesNotMatch(
  deploy,
  /\bnpx\s+wrangler\s+deploy\b/,
  'legacy manual workflow must not directly deploy stale repository source'
);
assert.match(
  deploy,
  /PRODUCTION_SOURCE_GUARD_V1/,
  'manual deploy workflow must explain that production source is guarded'
);
assert.match(
  wrangler,
  /main\s*=\s*"worker_hotfix\.js"/,
  'wrangler main module must match the production main module name'
);
assert.doesNotMatch(
  smoke,
  /j\.result\[0\]\.id/,
  'smoke must not silently choose the first Cloudflare account'
);
assert.doesNotMatch(
  smoke,
  /\|\|\s*d\?\.versions\?\.\[0\]/,
  'smoke must not silently fall back to the first deployment version'
);
assert.doesNotMatch(
  smoke,
  /\(r\.bindings\|\|\[\]\)\.length\s*!==\s*27/,
  'smoke must not reject a legitimate production bundle only because a binding was added'
);
assert.match(
  smoke,
  /requiredModules/,
  'smoke must require critical modules while allowing additive module changes'
);

console.log('production worker source guard contract: OK');
