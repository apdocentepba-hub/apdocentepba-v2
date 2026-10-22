// APDocente: deliberately manual and guarded release of the authenticated
// account preferences backend. Keep live worker-live/ canonical bytes untouched
// until a deployed candidate passes all post-deploy gates.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const workerName = 'ancient-wildflower-cd37';
const workerUrl = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
const previewUrl = 'https://apd-auth-release-ancient-wildflower-cd37.apdocentepba.workers.dev';
const website = 'https://alertasapd.com.ar';
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountConfigured = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const commitSha = String(process.env.GITHUB_SHA || '').trim();
let accountId = '';
let beforeId = '';
let candidateId = '';
let promotionAttempted = false;

if (process.env.GITHUB_REF_NAME !== 'main' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
  throw new Error('Manual release only from main branch');
}
if (process.env.APD_AUTH_RELEASE_CONFIRM !== 'RELEASE' ||
    process.env.APD_AUTH_REAL_SESSION_QA !== 'VERIFIED') {
  throw new Error('Release blocked: missing explicit release confirmation and real session QA attestation');
}
if (!token || !commitSha) throw new Error('Release blocked: Cloudflare API token or commit SHA unavailable');
const snapshot = JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
if (!snapshot.version_id || snapshot.main_module !== 'worker_hotfix.js') {
  throw new Error('Canonical live worker metadata missing');
}
const expectedModule = (snapshot.modules || []).find(x=>x.name==='worker_hotfix.js');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
if (!expectedModule || sha256(fs.readFileSync('worker-live/worker_hotfix.js')) !==
   (expectedModule.source_sha256 || expectedModule.sha256)) {
  throw new Error('Canonical source differs from capture; refusing to deploy');
}
const src = fs.readFileSync('worker-live/worker_hotfix.js','utf8');
if (src.includes('handleAccountPreferencesSecureV1')) {
  throw new Error('Route already present in canonical production snapshot; do not release twice');
}

async function cloudflare(path, body) {
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json().catch(()=>null);
  if (!response.ok || !result?.success) {
    throw new Error('Cloudflare rejected metadata/deployment operation (HTTP '+response.status+')');
  }
  return result.result;
}
const root = () => '/accounts/'+accountId+'/workers';
async function activeVersion() {
  const response = await cloudflare('/accounts/'+accountId+'/workers/scripts/'+workerName+'/deployments');
  const deployment = response?.deployments?.[0];
  const active = (deployment?.versions || []).filter(v => Number(v.percentage) > 0);
  if (active.length !== 1 || Number(active[0].percentage) !== 100 || !active[0].version_id) {
    throw new Error('Worker does not have one version with 100 percent traffic');
  }
  return active[0].version_id;
}
async function promote(id, label) {
  return cloudflare('/accounts/'+accountId+'/workers/scripts/'+workerName+'/deployments', {
    strategy: 'percentage',
    versions: [{ version_id:id, percentage:100 }],
    annotations: { 'workers/message':label }
  });
}
async function status(url, opts) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { ...opts, redirect:'error', signal:AbortSignal.timeout(12000) });
      await res.body?.cancel();
      return res.status;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise(resolve=>setTimeout(resolve, 1000));
    }
  }
}
async function smoke(base) {
  const checks = [
    ['/api/version',200], ['/api/planes',200],
    ['/api/account/preferences',401], ['/api/account/profile',401],
    ['/api/mi-plan',401], ['/api/mis-alertas',401]
  ];
  for (const [path, expected] of checks) {
    const got = await status(base+path);
    if (got !== expected) throw new Error('Smoke '+path+' expected '+expected+' got '+got);
  }
  const unauthId = await status(base+'/api/account/preferences?user_id=11111111-1111-4111-8111-111111111111',{
    headers: {Authorization:'Bearer invalid-synthetic-session'}
  });
  if (unauthId !== 401) throw new Error('Preferences IDOR guard failed');
  const postMethod = await status(base+'/api/account/preferences',{method:'POST'});
  if (postMethod !== 405) throw new Error('Preferences route accepted wrong method');
}
async function rollback(reason) {
  if (!promotionAttempted || !beforeId) return;
  console.error('Rollback required after release failure: '+String(reason).slice(0,250));
  await promote(beforeId,'Automatic APDocente authenticated API rollback');
  if (await activeVersion() !== beforeId) throw new Error('CRITICAL: Rollback could not be verified');
  promotionAttempted = false;
  console.log('Original production version successfully restored.');
}
async function release() {
  const accounts = await cloudflare('/accounts?per_page=50');
  if (!Array.isArray(accounts)) throw new Error('Cloudflare accounts unavailable');
  if (accountConfigured) {
    if (!accounts.some(a => a.id === accountConfigured)) throw new Error('Configured Cloudflare account inaccessible');
    accountId=accountConfigured;
  } else {
    if (accounts.length !== 1) throw new Error('Multiple Cloudflare accounts: explicit account id required');
    accountId=accounts[0].id;
  }
  beforeId = await activeVersion();
  if (beforeId !== snapshot.version_id) {
    throw new Error('Production version changed since source capture');
  }

  execFileSync('node',['scripts/build-authenticated-dashboard-candidate.mjs'],{stdio:'inherit'});
  execFileSync('node',['--test','scripts/test-authenticated-preferences-backend.mjs'],{stdio:'inherit'});
  const candidatePath='tmp/authenticated-dashboard-candidate/worker_hotfix.mjs';
  execFileSync('node',['--check',candidatePath],{stdio:'inherit'});
  const cfg=fs.readFileSync('wrangler.toml','utf8');
  const old='main = "worker-live/worker_hotfix.js"';
  if (cfg.split(old).length !== 2 || cfg.includes('[vars]')) {
    throw new Error('Unexpected Wrangler configuration; refuse to replace bundle');
  }
  fs.writeFileSync('tmp/authenticated-dashboard-candidate/wrangler-auth-release.toml',
    cfg.replace(old,'main = "'+candidatePath+'"'));
  execFileSync('npx',['wrangler','versions','upload',
    '--config','tmp/authenticated-dashboard-candidate/wrangler-auth-release.toml',
    '--preview-alias','apd-auth-release',
    '--tag','auth-release-'+commitSha.slice(0,8),
    '--message','APDocente secure account API release '+commitSha.slice(0,8)
  ],{stdio:'inherit'});

  if (await activeVersion() !== beforeId) throw new Error('Candidate upload unexpectedly changed production');
  const versionList = await cloudflare(root()+'/workers/'+workerName+'/versions?per_page=50');
  const versions=Array.isArray(versionList)?versionList:versionList.versions;
  const candidate=versions?.find(x=>x.annotations?.['workers/tag']==='auth-release-'+commitSha.slice(0,8));
  if (!candidate?.id) throw new Error('Tagged candidate missing from Cloudflare versions');
  candidateId=candidate.id;
  const detail=await cloudflare(root()+'/workers/'+workerName+'/versions/'+candidateId+'?include=modules');
  if (detail.main_module !== snapshot.main_module || detail.modules?.length !== snapshot.modules?.length) {
    throw new Error('Unexpected candidate module structure');
  }
  const bindings=new Map((detail.bindings || []).map(b=>[b.name+':'+b.type,b]));
  for (const b of snapshot.bindings||[]) {
    const live=bindings.get(b.name+':'+b.type);
    if (!live) throw new Error('Candidate lost required binding: '+b.name);
    if (b.namespace_id && String(live.namespace_id||live.id||'')!==String(b.namespace_id)) {
      throw new Error('Candidate KV namespace mismatch: '+b.name);
    }
  }
  await smoke(previewUrl);
  if (await activeVersion() !== beforeId) throw new Error('Production version changed while verifying preview');
  if (await status(website+'/') !== 200) throw new Error('Public website smoke failed');

  // Retrieve and validate exact candidate bundle BEFORE changing traffic.
  const deployedModule=detail.modules?.find(x=>x.name==='worker_hotfix.js');
  if (!deployedModule?.content_base64) {
    throw new Error('Candidate bundle bytes missing from Cloudflare; refusing promotion');
  }
  const bytes=Buffer.from(deployedModule.content_base64,'base64');
  if (bytes.length < 500000 || !bytes.toString('utf8').includes('handleAccountPreferencesSecureV1')) {
    throw new Error('Unexpected candidate bytes or missing authenticated route');
  }
  // Capture data prepared in memory; never write until promotion and smoke succeed.
  const nextManifest={...snapshot,
    version_id:candidateId,
    captured_at:new Date().toISOString(),
    modules:[{name:'worker_hotfix.js',sha256:sha256(bytes),bytes:bytes.length}],
    bindings:(detail.bindings||[]).map(b=>({
      name:String(b.name||''),type:String(b.type||''),
      ...(b.type==='kv_namespace'?{namespace_id:String(b.namespace_id||b.id||'')}:{})
    }))
  };

  // Once promotion is attempted, any failure must trigger automatic rollback.
  promotionAttempted=true;
  await promote(candidateId,'APDocente authenticated preferences backend '+commitSha.slice(0,8));
  if (await activeVersion() !== candidateId) throw new Error('Candidate promotion did not reach 100 percent');
  await smoke(workerUrl);
  if (await status(website+'/') !== 200) throw new Error('Website not healthy after promotion');

  fs.writeFileSync('worker-live/worker_hotfix.js',bytes);
  fs.writeFileSync('worker-live/manifest.json',JSON.stringify(nextManifest,null,2)+'\n');
  execFileSync('node',['scripts/test-live-source-equivalence.mjs'],{stdio:'inherit'});
  execFileSync('node',['scripts/test-account-security-contract.mjs'],{stdio:'inherit'});
  execFileSync('node',['scripts/test-mercadopago-status-mapping.mjs'],{stdio:'inherit'});
  execFileSync('git',['config','user.name','github-actions[bot]']);
  execFileSync('git',['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
  execFileSync('git',['add','worker-live/worker_hotfix.js','worker-live/manifest.json']);
  execFileSync('git',['commit','-m','chore: capture deployed APDocente authenticated backend '+commitSha.slice(0,8)],{stdio:'inherit'});
  execFileSync('git',['push','origin','HEAD:main'],{stdio:'inherit'});
  console.log('SUCCESS: authenticated account API deployed and canonical Worker snapshot updated.');
}
try {
  await release();
} catch(e) {
  console.error('AUTHENTICATED BACKEND RELEASE FAILED: '+String(e?.message||e));
  try { await rollback(String(e?.message||e)); }
  catch(rb) { console.error('URGENT ROLLBACK FAILURE: '+String(rb?.message||rb)); }
  process.exitCode=1;
}
