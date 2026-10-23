import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const release=fs.readFileSync('scripts/release-private-channel-status-worker.mjs','utf8');
const flow=fs.readFileSync('.github/workflows/release-private-channel-status-worker.yml','utf8');
const ci=fs.readFileSync('.github/workflows/private-channel-status-security.yml','utf8');

for (const [subject,content] of [['release workflow',flow],['candidate CI',ci]]) {
 assert.match(content,/permissions:\s*\n/);
 assert.doesNotMatch(content,/^\s+push:/m,
   subject+' must not auto-publish due to pushes');
}
assert.match(flow,/workflow_dispatch:/);
assert.match(flow,/environment: production/);
assert.match(flow,/inputs\.confirm_release == 'RELEASE'/);
assert.match(flow,/inputs\.real_session_qa == 'VERIFIED'/);
assert.match(flow,/CLOUDFLARE_API_TOKEN:/);
assert.match(flow,/contents: write/);
assert.match(flow,/node scripts\/test-private-channel-release-guard\.mjs/);

assert.match(release,/GITHUB_EVENT_NAME !== 'workflow_dispatch'/);
assert.match(release,/GITHUB_REF_NAME !== 'main'/);
assert.match(release,/APD_CHANNEL_REAL_SESSION_QA !== 'VERIFIED'/);
assert.match(release,/APD_CHANNEL_RELEASE_CONFIRM !== 'RELEASE'/);
assert.match(release,/beforeId !== snapshot\.version_id/);
assert.match(release,/sha256\(fs\.readFileSync\('worker-live\/worker_hotfix\.js'\)\)/);
assert.match(release,/vulnerableFallback/);
assert.match(release,/await smoke\(previewUrl\)/);
assert.match(release,/await smoke\(workerUrl\)/);
assert.match(release,/verifyChannelSecurityMarker\(previewUrl\)/);
assert.match(release,/waitForChannelSecurityPropagation\(\)/);
assert.match(release,/channel_status_security_revision/);
assert.match(release,/channel-authz-v1/);
assert.match(release,/async function rollback\(/);
assert.match(release,/promotionAttempted=true/);
assert.match(release,/await promote\(beforeId/);
assert.match(release,/await activeVersion\(\) !== beforeId/);
assert.match(release,/snapshot\.schedules/);
assert.match(release,/releaseCfg=releaseCfg\.replace\(cronLine/);
assert.match(release,/for \(const b of snapshot\.bindings/);
assert.match(release,/await activeVersion\(\) !== candidateId/);
assert.match(release,/worker-live\/manifest\.json/);
assert.match(release,/git',\['push','origin','HEAD:main'/);
assert.match(release,/test-private-channel-status-candidate\.mjs/); // auth logic verified by candidate tests

const badEnv={
 ...process.env,GITHUB_REF_NAME:'main',GITHUB_EVENT_NAME:'workflow_dispatch',
 APD_CHANNEL_RELEASE_CONFIRM:'NO',APD_CHANNEL_REAL_SESSION_QA:'NOT_VERIFIED',
 CLOUDFLARE_API_TOKEN:'',GITHUB_SHA:'local-only'
};
const fail=spawnSync(process.execPath,['scripts/release-private-channel-status-worker.mjs'],
  {encoding:'utf8',env:badEnv,timeout:10000});
assert.notEqual(fail.status,0);
assert.match(fail.stderr,/Release blocked: missing explicit release confirmation/);
console.log('Channel status release guard: manual only, replay-safe baseline, rollback and cron preservation OK.');
