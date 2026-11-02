// Pure unit tests: do not access any network, GitHub API, Cloudflare or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {events,inspectChange,signals} from './check-apd-workflow-risk-diff.mjs';

const file='.github/workflows/example.yml';
const flow=(trigger,body,perms='permissions:\n  contents: read') =>
  'name: Example\non:\n'+trigger+'\n'+perms+'\njobs:\n  review:\n    runs-on: ubuntu-latest\n    steps:\n      - run: '+body+'\n';

test('automatic read-only test workflow remains allowed',()=>{
  const s=flow('  push:\n    branches: [main]','node --test scripts/test.mjs');
  assert.deepEqual(events(s),['push']);
  assert.deepEqual(inspectChange(file,null,s),[]);
});

test('new automated workflow with a Cloudflare token is blocked',()=>{
  const s=flow('  push:\n    branches: [main]','node scripts/deploy.mjs\n        env:\n          SECRET: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
  assert.match(inspectChange(file,null,s).join(' '),/automatic trigger \+ token/);
});

test('editing a grandfathered token-bearing workflow remains blocked',()=>{
  const old=flow('  push:\n    branches: [main]','echo read\n        env:\n          SECRET: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
  const newer=old.replace('echo read','echo harmless');
  assert.match(inspectChange(file,old,newer).join(' '),/editing an existing privileged auto-trigger/);
});

test('removing automatic triggers is an accepted risk reduction',()=>{
  const old=flow('  push:\n    branches: [main]','echo read\n        env:\n          SECRET: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
  const newer=old.replace('  push:\n    branches: [main]','  workflow_dispatch:');
  assert.deepEqual(inspectChange(file,old,newer),[]);
});

test('new schedule with no explicit read permissions fails closed',()=>{
  const s=flow("  schedule:\n    - cron: '0 11 * * *'",'echo safe','');
  assert.match(inspectChange(file,null,s).join(' '),/read-only permissions/);
});

test('new inline auto trigger with deployment action is rejected',()=>{
  const s="name: X\non: [push, workflow_dispatch]\npermissions:\n  contents: read\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: wrangler versions upload --keep-vars\n";
  assert.deepEqual(events(s),['push','workflow_dispatch']);
  assert.match(inspectChange(file,null,s).join(' '),/automatic trigger \+ token/);
});

test('new PR workflow with a token is not silently allowed',()=>{
  const s=flow('  pull_request:', 'echo token\n        env:\n          SECRET: ${{ secrets.GITHUB_TOKEN }}');
  assert.match(inspectChange(file,null,s).join(' '),/new pull_request workflow exposes/);
});

test('new PR workflow with read-only permissions and no tokens is allowed',()=>{
  const s=flow('  pull_request:', 'node --test scripts/x.mjs');
  assert.deepEqual(inspectChange(file,null,s),[]);
});

test('manual dispatch can carry secrets but no unsupervised trigger',()=>{
  const s=flow('  workflow_dispatch:','echo manual\n        env:\n          SECRET: ${{ secrets.CLOUDFLARE_API_TOKEN }}','permissions:\n  contents: write');
  assert.deepEqual(inspectChange(file,null,s),[]);
});

test('new or changed workflow with unrecognized trigger format rejects',()=>{
  const s="name: Hidden\non: {push: {branches: [main]}}\njobs:\n  bad:\n    runs-on: ubuntu-latest\n";
  assert.match(inspectChange(file,null,s).join(' '),/Unrecognized inline trigger/);
});

test('an existing automatic permissions escalation is blocked',()=>{
  const old=flow('  push:', 'node --test scripts/check.mjs');
  const updated=old.replace('contents: read','contents: write');
  assert.match(inspectChange(file,old,updated).join(' '),/automatic trigger \+ token/);
});

test('deleted workflow is accepted; no active trigger remains',()=>{
  const s=flow('  schedule:', 'wrangler deploy');
  assert.deepEqual(inspectChange(file,s,null),[]);
});

test('file path scope is limited to GitHub Actions workflows',()=>{
  const s=flow('  push:', 'wrangler deploy');
  assert.deepEqual(inspectChange('scripts/worker.mjs',null,s),[]);
});

test('static risk signal detection keeps token names, not values',()=>{
  const s=flow('  push:',"echo hi\n        env:\n          API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
  assert.deepEqual(signals(s).tokens,['CLOUDFLARE_API_TOKEN']);
});
