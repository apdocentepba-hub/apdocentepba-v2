// APDocentePBA: offline-only safety contract for risky GitHub Actions workflows.
// This test NEVER calls network, Supabase, Cloudflare, or a deployment API.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const candidates = Object.freeze([
  { path: '.github/workflows/release-live-messaging-auth.yml', job: 'production', confirmation: 'confirm_release', choice: 'RELEASE', ref: 'refs/heads/main', production: true, legacyDisabled: true },
  { path: '.github/workflows/deploy-apd-email-fix-681.yml', job: 'deploy', confirmation: 'confirm_release', choice: 'RELEASE', ref: 'refs/heads/main', production: true },
  { path: '.github/workflows/release-expiry-worker.yml', job: 'release', confirmation: 'confirm_release', choice: 'RELEASE', ref: 'refs/heads/main', production: true },
  { path: '.github/workflows/deploy-email-format-candidate.yml', job: 'deploy', confirmation: 'confirm_release', choice: 'RELEASE', ref: 'refs/heads/main', production: true },
  { path: '.github/workflows/importar-escuelas-pba.yml', job: 'importar', confirmation: 'confirm_import', choice: 'IMPORTAR', ref: 'refs/heads/main', production: false },
  { path: '.github/workflows/auto-apply-worker-export-default-replacement.yml', job: 'auto-apply-worker-export-default-replacement', confirmation: 'confirm_apply', choice: 'APLICAR', ref: 'refs/heads/refactor/worker-base-20260401', production: false },
  { path: '.github/workflows/reconcile-mp-secret-baseline.yml', job: 'reconcile', confirmation: 'confirm_reconcile', choice: 'RECONCILIAR', ref: 'refs/heads/main', production: true, repositoryWrite: true },
  { path: '.github/workflows/capture-verified-live-worker.yml', job: 'capture', confirmation: 'confirm_capture', choice: 'CAPTURAR', ref: 'refs/heads/main', production: true, repositoryWrite: true },
  { path: '.github/workflows/run-apd-email-fix-candidate.yml', job: 'candidate', confirmation: 'confirm_candidate', choice: 'CREAR', ref: 'refs/heads/main', production: true },
  { path: '.github/workflows/build-email-format-candidate.yml', job: 'candidate', confirmation: 'confirm_candidate', choice: 'CREAR', ref: 'refs/heads/main', production: true }
]);

function extractTrigger(contents) {
  const m = contents.match(/^on:\s*\n([\s\S]*?)(?=^[A-Za-z_][^\n]*:|$(?![\s\S]))/m);
  assert.ok(m, 'Missing YAML on: section');
  return m[1];
}

function extractJob(contents, jobName) {
  const lines = contents.split(/\r?\n/);
  const start = lines.findIndex((line) => line === '  ' + jobName + ':');
  assert.ok(start >= 0, 'Expected job missing: ' + jobName);
  let end = start + 1;
  while (end < lines.length && !/^  [a-zA-Z][\w-]*:$/.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
}

function validateManualOnly(contents, item) {
  const triggers = extractTrigger(contents);
  assert.match(triggers, /^  workflow_dispatch:\s*$/m, 'Manual trigger required');
  assert.doesNotMatch(triggers, /^  (?:push|schedule|repository_dispatch|workflow_run|pull_request_target):/m, 'Autonomous or privileged trigger forbidden');
  assert.match(triggers, new RegExp('^      ' + item.confirmation + ':\\s*$', 'm'), 'Confirmation input required');
  assert.match(triggers, /^        default: ["']?NO["']?\s*$/m, 'Default must be NO');
  assert.match(triggers, new RegExp('options: \\[["\x27]NO["\x27], ["\x27]' + item.choice + '["\x27]\\]'), 'Explicit approval choice required');

  const job = extractJob(contents, item.job);
  const gate = job.split('\n').find((line) => /^    if:/.test(line));
  assert.ok(gate, 'Production/write job requires job-level if');
  for (const part of ["github.event_name == 'workflow_dispatch'", "github.ref == '" + item.ref + "'", 'inputs.' + item.confirmation + " == '" + item.choice + "'"]) {
    assert.ok(gate.includes(part), 'Missing job release gate: ' + part);
  }
  if (item.production) assert.match(job, /^    environment: production\s*$/m, 'Production environment required');
  if (item.legacyDisabled) assert.ok(gate.includes('&& false'), 'Obsolete legacy release must remain permanently disabled');
  if (item.repositoryWrite) {
    assert.match(contents, /^permissions:\s*\n  contents: read/m, 'Workflow-level permissions must be read only');
    assert.match(job, /^    permissions:\s*\n      contents: write/m, 'Write permission must be scoped to explicitly approved job');
  } else {
    assert.doesNotMatch(job, /^    permissions:\s*\n\s+contents: write/m, 'Unnecessary repository write permission');
  }
}

for (const item of candidates) {
  test(item.path + ' cannot auto-release or auto-write', () => {
    const contents = readFileSync(item.path, 'utf8');
    validateManualOnly(contents, item);
  });
}

test('unsafe push event is rejected (negative control)', () => {
  const item = candidates[0];
  const safe = readFileSync(item.path, 'utf8');
  const unsafe = safe.replace('on:\n', 'on:\n  push:\n    branches: [main]\n');
  assert.throws(() => validateManualOnly(unsafe, item), /Autonomous or privileged trigger forbidden/);
});

test('missing production confirmation is rejected (negative control)', () => {
  const item = candidates[0];
  const safe = readFileSync(item.path, 'utf8');
  const unsafe = safe.replace("inputs.confirm_release == 'RELEASE'", "inputs.confirm_release == 'NO'");
  assert.throws(() => validateManualOnly(unsafe, item), /Missing job release gate/);
});


test('Pull-request checks cannot cancel a different workflow or main deployment', () => {
  for (const name of [
    '.github/workflows/release-live-messaging-auth.yml',
    '.github/workflows/capture-verified-live-worker.yml',
    '.github/workflows/reconcile-mp-secret-baseline.yml'
  ]) {
    const wf = readFileSync(name, 'utf8');
    const expected = "group: ${{ github.event_name == 'pull_request' && format('apd-pr-{0}-{1}', github.workflow, github.event.pull_request.number) || 'apd-canonical-worker-baseline' }}";
    assert.ok(wf.includes(expected), 'PR concurrency needs distinct workflow + PR number: '+name);
    assert.match(wf,/cancel-in-progress: false/, 'Do not cancel in-progress jobs');
    assert.doesNotMatch(wf,/^  group: apd-canonical-worker-baseline$/m, 'Unscoped group stalls or cancels other PR runs');
  }
});


const retiredWorkflows = [
  {path:'.github/workflows/verify-apd-681-live.yml',job:'verify'},
  {path:'.github/workflows/stage-live-messaging-auth.yml',job:'stage-undeployed'},
  {path:'.github/workflows/mp-signed-webhook-staging.yml',job:'stage-to-version-url'}
];
for (const retired of retiredWorkflows) {
  test(retired.path+' cannot stage, rollback or publish even with manual input', () => {
    const src=readFileSync(retired.path,'utf8');
    const triggers=extractTrigger(src);
    assert.doesNotMatch(triggers,/^  (push|schedule|workflow_run|pull_request_target):/m);
    const job=extractJob(src,retired.job);
    assert.match(job,/^    if: false\s*$/m,'Retired job must be unreachable');
  });
}

console.log('APD_MANUAL_RELEASE_GUARD: no production deployment performed');
