import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const release=fs.readFileSync('scripts/release-marketing-preferences-worker.mjs','utf8');
const flow=fs.readFileSync('.github/workflows/release-marketing-preferences-worker.yml','utf8');
assert.match(flow,/workflow_dispatch:/);
assert.doesNotMatch(flow,/^\s+push:/m,'Never release from push events');
assert.match(flow,/environment: production/);
assert.match(flow,/if: github\.ref == 'refs\/heads\/main'/);
assert.match(flow,/real_session_qa/);
assert.match(flow,/confirm_release/);
assert.match(flow,/permissions:[\s\S]{0,80}contents: write/);
assert.match(flow,/if \[ -f package-lock\.json \]; then/, 'Support deterministic npm ci when lockfile exists');
assert.match(flow,/npm install --no-package-lock --ignore-scripts --no-audit --no-fund/, 'Install existing dependency without an absent lockfile');
assert.match(flow,/npx --no-install wrangler --version/, 'Validate Wrangler installation');

assert.match(release,/GITHUB_EVENT_NAME !== 'workflow_dispatch'/);
assert.match(release,/GITHUB_REF_NAME !== 'main'/);
assert.match(release,/APD_MARKETING_REAL_SESSION_QA !== 'VERIFIED'/);
assert.match(release,/APD_MARKETING_RELEASE_CONFIRM !== 'RELEASE'/);
assert.match(release,/beforeId !== snapshot\.version_id/);
assert.match(release,/sha256\(fs\.readFileSync\('worker-live\/worker_hotfix\.js'\)\)/);
assert.match(release,/await smoke\(previewUrl\)/);
assert.match(release,/await smoke\(workerUrl\)/);
assert.match(release,/marketing-preferences',401/);
assert.match(release,/wrongMarketingMethod/);
assert.match(release,/noSessionMarketingPost/);
assert.match(release,/handleMarketingPreferencesSecureV1/);

assert.match(release,/promotionAttempted=true/);
assert.match(release,/await rollback\(/);
assert.match(release,/if \(await activeVersion\(\) !== beforeId\)/);
assert.match(release,/detail\.modules\?\.length !== snapshot\.modules\?\.length/);
assert.match(release,/const liveCrons = snapshot\.schedules \|\| \[\]/);
assert.match(release,/releaseCfg=releaseCfg\.replace\(cronLine/);
assert.match(release,/Live cron triggers were not preserved/);
assert.match(release,/bindings\.get\(b\.name\+':'.*b\.type\)/);
assert.match(release,/fs\.writeFileSync\('worker-live\/manifest\.json'/);
assert.match(release,/git'\,\['push'/);
assert.doesNotMatch(release,/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]/, 'Never hard-code privileged key');

// Real process tests: invalid contexts must exit before any network/API operation.
function mustReject(env, message) {
  const p=spawnSync(process.execPath,['scripts/release-marketing-preferences-worker.mjs'],{
    env:{PATH:process.env.PATH||'',...env},
    encoding:'utf8',timeout:6000
  });
  assert.notEqual(p.status,0,'Release script unexpectedly accepted forbidden context');
  assert.match(p.stderr+String(p.stdout||''),message);
}
mustReject({GITHUB_REF_NAME:'security/test',GITHUB_EVENT_NAME:'workflow_dispatch',
  APD_MARKETING_RELEASE_CONFIRM:'RELEASE',APD_MARKETING_REAL_SESSION_QA:'VERIFIED'},/Manual release only from main branch/);
mustReject({GITHUB_REF_NAME:'main',GITHUB_EVENT_NAME:'push',
  APD_MARKETING_RELEASE_CONFIRM:'RELEASE',APD_MARKETING_REAL_SESSION_QA:'VERIFIED'},/Manual release only from main branch/);
mustReject({GITHUB_REF_NAME:'main',GITHUB_EVENT_NAME:'workflow_dispatch',
  APD_MARKETING_RELEASE_CONFIRM:'NO',APD_MARKETING_REAL_SESSION_QA:'VERIFIED'},/Release blocked/);
mustReject({GITHUB_REF_NAME:'main',GITHUB_EVENT_NAME:'workflow_dispatch',
  APD_MARKETING_RELEASE_CONFIRM:'RELEASE',APD_MARKETING_REAL_SESSION_QA:'NOT_VERIFIED'},/Release blocked/);

console.log('Marketing backend release guard contracts: OK');
