// Stage an authorization fix based on LIVE Worker bytes, not stale GitHub code.
// This script never changes production traffic, Cloudflare bindings or the database.
// Wrangler output is always captured to prevent legacy plaintext secrets in CI logs.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {hardenMessagingStatus} from './create-messaging-status-auth-candidate.mjs';
import {compareWorkerModules} from './audit-apd-worker-drift.mjs';
import {stageConfig} from './stage-mp-signed-webhook.mjs';

const worker='ancient-wildflower-cd37';
const alias='apd-private-status';
const site='https://'+worker+'.apdocentepba.workers.dev';
const preview='https://'+alias+'-'+worker+'.apdocentepba.workers.dev';

export function validateOnlyMessagingHandlersChanged(source, patched) {
  const comparison=compareWorkerModules(Buffer.from(source),Buffer.from(patched));
  const changed=[...comparison.functionsChanged].sort();
  if(JSON.stringify(changed)!==JSON.stringify(['handleTelegramStatus','handleWhatsAppStatus'].sort()) ||
     comparison.functionsMissing.length || comparison.exactCodeMatch ||
     comparison.telegramStatusUnsafeIdFallback!==false ||
     comparison.whatsappStatusUnsafeIdFallback!==false) {
       throw Error('Candidate changes outside intended status handlers or insecure fallback remains');
  }
  const reverted=hardenMessagingStatus(source);
  if(reverted!==patched)throw Error('Candidate must be exactly the minimal authorization patch');
  return true;
}
async function cf(token,account,path){
  const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+path;
  const res=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error('Cloudflare metadata read HTTP '+res.status);
  const j=await res.json();
  if(j?.success!==true)throw Error('Cloudflare metadata read rejected');
  return j.result;
}
async function discoverAccount(token) {
  const res=await fetch('https://api.cloudflare.com/client/v4/accounts?per_page=50',{
    headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)
  });
  if(!res.ok)throw Error('Cannot discover Cloudflare account');
  const j=await res.json();
  if(j?.success!==true||!Array.isArray(j.result)||j.result.length!==1)throw Error('Cloudflare account not uniquely identifiable');
  return String(j.result[0].id);
}
async function active(token,account){
  const ds=await cf(token,account,'/workers/scripts/'+worker+'/deployments');
  const versions=(ds?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
  if(versions.length!==1||Number(versions[0].percentage)!==100||!versions[0].version_id)
    throw Error('Live Worker not assigned to one stable version');
  const id=versions[0].version_id;
  const details=await cf(token,account,'/workers/workers/'+worker+'/versions/'+encodeURIComponent(id)+'?include=modules');
  const mod=(details?.modules||[]).find(m=>m.name==='worker_hotfix.js');
  if(typeof mod?.content_base64!=='string'||!Array.isArray(details?.bindings))
    throw Error('Could not validate live Worker module and bindings');
  return {id,source:Buffer.from(mod.content_base64,'base64').toString('utf8'),bindings:details.bindings};
}
async function httpStatus(base,route,method='GET') {
  const res=await fetch(base+route,{method,redirect:'manual',signal:AbortSignal.timeout(15000)});
  return res.status;
}
async function safeSmoke(base,candidate) {
  for(const [route,expected] of [['/api/version',200],['/api/planes',200],['/api/mi-plan',401],['/api/mis-alertas',401]]) {
    const code=await httpStatus(base,route);
    if(code!==expected)throw Error('Unexpected status for public contract '+route+': '+code);
  }
  if(candidate)for(const channel of ['telegram','whatsapp']){
    const path='/api/'+channel+'/status?user_id=00000000-0000-4000-8000-000000000000';
    const code=await httpStatus(base,path);
    if(code!==401)throw Error(channel+' status route permits unauthenticated query: HTTP '+code);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.env.GITHUB_REF_NAME!=='main'||process.env.GITHUB_EVENT_NAME!=='push')
    throw Error('Live-preview upload must run from merged main only');
  const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
  if(!token)throw Error('Cloudflare token is unavailable');
  const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim()||await discoverAccount(token);
  const before=await active(token,account);
  if(before.source.length<500000)throw Error('Live Worker module unexpectedly small');
  const patched=hardenMessagingStatus(before.source);
  validateOnlyMessagingHandlersChanged(before.source,patched);
  fs.mkdirSync('tmp/live-messaging-auth',{recursive:true});
  fs.writeFileSync('tmp/live-messaging-auth/worker_hotfix.js',patched);
  execFileSync('node',['--check','tmp/live-messaging-auth/worker_hotfix.js'],{stdio:['ignore','pipe','pipe']});
  const cfg=stageConfig(fs.readFileSync('wrangler.toml','utf8'))
    .replace('tmp/mp-validation-candidate/worker_hotfix.js','tmp/live-messaging-auth/worker_hotfix.js');
  if(!cfg.includes('main = "tmp/live-messaging-auth/worker_hotfix.js"'))throw Error('Invalid staging config');
  fs.writeFileSync('wrangler-live-messaging-auth.toml',cfg);
  const tag='apd-msg-auth-'+String(process.env.GITHUB_SHA||'').slice(0,8);
  if(tag.length<20)throw Error('Missing release reference');
  try{
    execFileSync('npx',['wrangler','versions','upload',
      '--config','./wrangler-live-messaging-auth.toml','--keep-vars','--no-bundle',
      '--preview-alias',alias,'--tag',tag,
      '--message','Live-based messaging authorization fix, preview only'],{
        stdio:['ignore','pipe','pipe'],encoding:'utf8',maxBuffer:6*1024*1024
      });
  }catch(e){throw Error('Preview version upload failed; output redacted; code '+String(e?.status??'unknown'));}
  const post=await active(token,account);
  if(post.id!==before.id||post.source!==before.source)throw Error('Production changed while preparing preview');
  const list=await cf(token,account,'/workers/workers/'+worker+'/versions?per_page=50');
  const versions=Array.isArray(list)?list:(list?.versions||[]);
  const candidate=versions.find(v=>v.annotations?.['workers/tag']===tag);
  if(!candidate?.id)throw Error('Preview tag absent from Cloudflare');
  const d=await cf(token,account,'/workers/workers/'+worker+'/versions/'+encodeURIComponent(candidate.id)+'?include=modules');
  const bindings=new Map((d.bindings||[]).map(v=>[v.name+':'+v.type,v]));
  for(const original of before.bindings){
    const binding=bindings.get(original.name+':'+original.type);
    if(!binding)throw Error('Candidate lost a deployed Worker binding');
    if(original.type==='kv_namespace' && String(binding.namespace_id||binding.id||'')!==String(original.namespace_id||original.id||'')){
      throw Error('Candidate namespace drift');
    }
  }
  const mod=(d.modules||[]).find(m=>m.name==='worker_hotfix.js');
  if(typeof mod?.content_base64!=='string')throw Error('Candidate Worker module was not exposed for verification');
  const stagedSource=Buffer.from(mod.content_base64,'base64').toString('utf8');
  if(stagedSource.includes('if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId)')) {
    throw Error('Insecure status account lookup still exists in staged Worker');
  }
  await safeSmoke(preview,true);
  await safeSmoke(site,false);
  const final=await active(token,account);
  if(final.id!==before.id)throw Error('Production switched versions unexpectedly');
  console.log('APD_LIVE_MESSAGING_AUTH_PREVIEW_PASS');
  console.log('Both unauthenticated messaging endpoints rejected, all bindings preserved, production unchanged.');
  console.log('No payments, messages, user data writes, credentials or production deployments.');
}
