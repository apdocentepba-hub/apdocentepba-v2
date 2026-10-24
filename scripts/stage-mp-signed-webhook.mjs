// Upload a non-traffic Mercado Pago verification candidate to a Cloudflare Version URL.
// Version URLs use real bindings: perform only GET smoke and an unsigned webhook rejection.
// This script must NEVER call a production deployment or invoke payment functions.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {reconcileManifest} from './reconcile-mp-secret-baseline.mjs';

export function stageConfig(rootConfig) {
  const line='main = "worker-live/worker_hotfix.js"';
  if(rootConfig.split(line).length!==2 ||
     !rootConfig.includes('keep_vars = true') ||
     !rootConfig.includes('PRODUCTION_SOURCE_GUARD_V1') ||
     /\n\s*\[vars\]/.test(rootConfig)) {
    throw Error('Unexpected Wrangler configuration: refuse preview');
  }
  return rootConfig.replace(line,'main = "tmp/mp-validation-candidate/worker_hotfix.js"');
}

export function confirmSafeBaseline(snapshot, deployments, detail) {
  const reconciled=reconcileManifest(snapshot,deployments,detail);
  if(reconciled.version_id!==snapshot.version_id) {
    throw Error('Production version changed since canonical capture');
  }
  if(!reconciled.bindings.some(x=>x.name==='MERCADOPAGO_WEBHOOK_SECRET'&&x.type==='secret_text')) {
    throw Error('Webhook secret missing from deployed Worker');
  }
  return reconciled.bindings;
}

const worker='ancient-wildflower-cd37';
const alias='apd-mp-verified';
const workerUrl='https://'+worker+'.apdocentepba.workers.dev';
const previewUrl='https://'+alias+'-'+worker+'.apdocentepba.workers.dev';

async function getCf(apiToken, accountId, path) {
  const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(accountId)+path;
  const response=await fetch(url,{
    method:'GET',headers:{Authorization:'Bearer '+apiToken},signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('Cloudflare metadata HTTP '+response.status);
  const payload=await response.json();
  if(payload?.success!==true)throw Error('Cloudflare metadata rejected');
  return payload.result;
}
async function deploymentState(token,accountId) {
  const ds=await getCf(token,accountId,'/workers/scripts/'+worker+'/deployments');
  const active=(ds?.deployments?.[0]?.versions||[]).filter(x=>Number(x.percentage)>0);
  if(active.length!==1||Number(active[0].percentage)!==100||!active[0].version_id) {
    throw Error('Production traffic not on one version');
  }
  const detail=await getCf(token,accountId,'/workers/workers/'+worker+'/versions/'+encodeURIComponent(active[0].version_id)+'?include=modules');
  return {ds,detail,version:String(active[0].version_id)};
}
async function requestStatus(base,path,method='GET') {
  const response=await fetch(base+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000)});
  return response.status;
}
async function smoke(base,preview=false) {
  for(const [path,status] of [['/api/version',200],['/api/planes',200],['/api/mi-plan',401],['/api/mis-alertas',401]]) {
    const got=await requestStatus(base,path);
    if(got!==status)throw Error('Unexpected '+(preview?'preview':'production')+' HTTP '+got+' at '+path);
  }
  if(preview) {
    // MUST be denied before the body is parsed or any database write happens.
    const rejected=await requestStatus(base,'/api/mercadopago/webhook','POST');
    if(rejected!==401)throw Error('Unsigned preview payment webhook not rejected: HTTP '+rejected);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.env.GITHUB_REF_NAME!=='main'||process.env.GITHUB_EVENT_NAME!=='push')throw Error('Staging allowed only after merge to main');
  const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
  let account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
  if(!token)throw Error('Missing authenticated Cloudflare deployment token');
  if(!account) {
    // Some GitHub environments keep only the API token; use the single accessible account.
    // Never print account metadata or select an arbitrary account.
    const response=await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=50',{
      method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw Error('Cannot inspect Cloudflare accounts: HTTP '+response.status);
    const payload=await response.json();
    if(payload?.success!==true||!Array.isArray(payload.result)||payload.result.length!==1) {
      throw Error('Cloudflare account selection not unique; refuse staging');
    }
    account=String(payload.result[0].id||'').trim();
    if(!account)throw Error('Cloudflare account ID unavailable');
  }
  const snapshot=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
  if(snapshot.worker_name!==worker)throw Error('Wrong Worker in snapshot');
  const first=await deploymentState(token,account);
  const baseline=confirmSafeBaseline(snapshot,first.ds,first.detail);
  execFileSync('node',['scripts/create-mp-validation-candidate.mjs'],{stdio:'inherit'});
  execFileSync('node',['--check','tmp/mp-validation-candidate/worker_hotfix.js'],{stdio:'inherit'});
  execFileSync('node',['--test','scripts/test-mp-validation-candidate.mjs'],{stdio:'inherit'});
  const config=stageConfig(fs.readFileSync('wrangler.toml','utf8'));
  fs.writeFileSync('wrangler-mp-stage.toml',config);
  // This command uploads an UNDEPLOYED version. Never use 'wrangler deploy' here.
  const tag='apd-mp-verified-'+String(process.env.GITHUB_SHA||'').slice(0,8);
  if(tag.length<20)throw Error('Missing checked-out release commit');
  execFileSync('npx',['wrangler','versions','upload',
    '--config','./wrangler-mp-stage.toml','--keep-vars','--strict',
    '--preview-alias',alias,'--tag',tag,
    '--message','APDocente signed payments - preview only'],{stdio:'inherit'});
  const after=await deploymentState(token,account);
  if(after.version!==first.version)throw Error('Production version changed unexpectedly during candidate upload');
  confirmSafeBaseline(snapshot,after.ds,after.detail);
  const listed=await getCf(token,account,'/workers/workers/'+worker+'/versions?per_page=50');
  const versions=Array.isArray(listed)?listed:(listed?.versions||[]);
  const candidate=versions.find(x=>x.annotations?.['workers/tag']===tag);
  if(!candidate?.id)throw Error('Uploaded preview candidate could not be found');
  const candidateDetail=await getCf(token,account,'/workers/workers/'+worker+'/versions/'+candidate.id+'?include=modules');
  const bindings=new Map((candidateDetail?.bindings||[]).map(x=>[x.name+':'+x.type,x]));
  for(const old of baseline) {
    if(!bindings.has(old.name+':'+old.type))throw Error('Preview lost production binding '+old.name);
    if(old.namespace_id) {
      const got=bindings.get(old.name+':'+old.type);
      if(String(got.namespace_id||got.id||'')!==old.namespace_id)throw Error('Preview KV binding changed');
    }
  }
  if((candidateDetail.modules||[]).length!==1 ||
     !candidateDetail.modules.some(x=>x.name==='worker_hotfix.js'))throw Error('Invalid preview module shape');
  await smoke(previewUrl,true);
  await smoke(workerUrl,false);
  if((await deploymentState(token,account)).version!==first.version)throw Error('Production changed after smoke');
  console.log('SIGNED PAYMENT PREVIEW: PASS');
  console.log('Unsigned webhook rejected, bindings preserved; live production traffic remains on unchanged version.');
  console.log('No real payment, email, user-plan change or production promotion performed.');
}
