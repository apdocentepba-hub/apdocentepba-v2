// Read-only production inspection + local manifest metadata reconciliation.
// Does not deploy, access secret values, change subscriptions or write to Cloudflare.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function reconcileManifest(snapshot, deployments, detail, clock=new Date()) {
  if (!snapshot?.version_id || !snapshot?.main_module || !Array.isArray(snapshot?.bindings)) {
    throw Error('Missing verified baseline snapshot');
  }
  const current=deployments?.deployments?.[0];
  const versions=(current?.versions||[]).filter(v=>Number(v.percentage)>0);
  if(versions.length!==1 || Number(versions[0].percentage)!==100 || !versions[0].version_id) {
    throw Error('Worker traffic not pinned to a single version');
  }
  const versionId=String(versions[0].version_id);
  const baselineModule=(snapshot.modules||[]).find(m=>m.name===snapshot.main_module);
  const liveModule=(detail?.modules||[]).find(m=>m.name===snapshot.main_module);
  if (!baselineModule?.sha256 || typeof liveModule?.content_base64!=='string') {
    throw Error('Cannot establish source parity without canonical and live bytes');
  }
  const liveBytes=Buffer.from(liveModule.content_base64,'base64');
  const actualHash=crypto.createHash('sha256').update(liveBytes).digest('hex');
  if(actualHash!==baselineModule.sha256 || liveBytes.length!==baselineModule.bytes) {
    throw Error('Live Worker code differs from canonical; refusing metadata reconciliation');
  }
  const existing=new Map(snapshot.bindings.map(b=>[b.name+':'+b.type,b]));
  const liveBindings=(detail.bindings||[]).map(b=>({
    name:String(b.name||''),
    type:String(b.type||''),
    ...(b.type==='kv_namespace'?{namespace_id:String(b.namespace_id||b.id||'')}:{})
  }));
  if(liveBindings.some(b=>!b.name || !b.type))throw Error('Malformed remote bindings');
  const live=new Map(liveBindings.map(b=>[b.name+':'+b.type,b]));
  if(live.size!==liveBindings.length)throw Error('Duplicate bindings detected');
  for(const [key,prior] of existing) {
    const got=live.get(key);
    if(!got)throw Error('Previously deployed binding disappeared: '+prior.name);
    if(prior.namespace_id && got.namespace_id!==prior.namespace_id) {
      throw Error('KV namespace changed: '+prior.name);
    }
  }
  const additions=[...live.keys()].filter(k=>!existing.has(k));
  if(additions.length>1 || additions.some(k=>k!=='MERCADOPAGO_WEBHOOK_SECRET:secret_text')){
    throw Error('Unexpected binding changes beyond Mercado Pago webhook secret');
  }
  if(!live.has('MERCADOPAGO_WEBHOOK_SECRET:secret_text')) {
    throw Error('Missing expected webhook signature secret binding');
  }
  const bindings=liveBindings.sort((a,b)=>a.name.localeCompare(b.name));
  return {
    ...snapshot,version_id:versionId,captured_at:clock.toISOString(),
    bindings
  };
}

async function inspectCloudflare(token, accountId, workerName, fetcher) {
  async function get(path) {
    const res=await fetcher('https://api.cloudflare.com/client/v4'+path,{
      method:'GET',headers:{Authorization:'Bearer '+token},
      signal:AbortSignal.timeout(15000)
    });
    if(!res.ok)throw Error('Cloudflare inspection HTTP '+res.status);
    const json=await res.json();
    if(json?.success!==true)throw Error('Cloudflare rejected read-only inspection');
    return json.result;
  }
  if(!accountId) {
    const accounts=await get('/accounts?per_page=50');
    if(!Array.isArray(accounts)||accounts.length!==1)throw Error('Cloudflare account not uniquely identified');
    accountId=accounts[0].id;
  }
  const workerPath='/accounts/'+encodeURIComponent(accountId)+'/workers/';
  const deployments=await get('/accounts/'+encodeURIComponent(accountId)+'/workers/scripts/'+encodeURIComponent(workerName)+'/deployments');
  const versions=deployments?.deployments?.[0]?.versions||[];
  const deployed=versions.filter(x=>Number(x.percentage)>0);
  if(deployed.length!==1||Number(deployed[0].percentage)!==100)throw Error('Ambiguous production deployment');
  const detail=await get(workerPath+'workers/'+encodeURIComponent(workerName)+'/versions/'+encodeURIComponent(deployed[0].version_id)+'?include=modules');
  return {deployments,detail};
}
async function assertPublicRoutes(fetcher) {
  const host='https://ancient-wildflower-cd37.apdocentepba.workers.dev';
  for(const [path,want] of [['/api/version',200],['/api/planes',200],['/api/mi-plan',401],['/api/mis-alertas',401]]) {
    const res=await fetcher(host+path,{method:'GET',signal:AbortSignal.timeout(15000)});
    if(res.status!==want)throw Error('Worker smoke '+path+' returned HTTP '+res.status+' instead of '+want);
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.env.GITHUB_REF_NAME!=='main'||process.env.GITHUB_EVENT_NAME!=='push'){
    throw Error('Live metadata reconciliation requires push to main');
  }
  const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
  if(!token)throw Error('Missing private Cloudflare inspection token');
  const name='worker-live/manifest.json';
  const original=JSON.parse(fs.readFileSync(name,'utf8'));
  const {deployments,detail}=await inspectCloudflare(token,String(process.env.CLOUDFLARE_ACCOUNT_ID||''),original.worker_name,fetch);
  const next=reconcileManifest(original,deployments,detail);
  await assertPublicRoutes(fetch);
  if(next.version_id!==original.version_id || next.bindings.length!==original.bindings.length) {
    fs.writeFileSync(name,JSON.stringify(next,null,2)+'\n');
    console.log('Verified unchanged Worker bytes, all bindings retained, signature secret present and GET smoke passed.');
    console.log('Updated local manifest metadata only; no Worker deployment or payment operations.');
  } else {
    console.log('Cloudflare baseline already reconciled; no metadata update needed.');
  }
}
