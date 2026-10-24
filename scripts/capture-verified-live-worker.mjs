// Safe APDocente canonical capture after the authenticated messaging status release.
// Reads deployed Cloudflare version, verifies it is the approved staged candidate,
// writes ONLY locally to worker-live, and never displays remote code or secrets.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {compareWorkerModules} from './audit-apd-worker-drift.mjs';

const approvedTag='apd-msg-auth-2e605fd5';
const workerName='ancient-wildflower-cd37';
const sha256=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');

export function verifiedCapture(snapshot, previousBytes, deployment, candidate, liveDetails, when=new Date()) {
  if(snapshot?.worker_name!==workerName || snapshot?.main_module!=='worker_hotfix.js') throw Error('Unexpected canonical Worker');
  if(!Array.isArray(snapshot.modules)||snapshot.modules.length!==1||snapshot.modules[0].name!=='worker_hotfix.js') throw Error('Canonical module shape changed');
  if(sha256(previousBytes)!==snapshot.modules[0].sha256 || previousBytes.length!==snapshot.modules[0].bytes)
    throw Error('Existing canonical Worker fails its own integrity check');
  const active=(deployment?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
  if(active.length!==1||Number(active[0].percentage)!==100||!active[0].version_id)
    throw Error('Production has multiple or unknown Worker versions');
  if(!candidate?.id || candidate?.annotations?.['workers/tag']!==approvedTag || String(candidate.id)!==String(active[0].version_id))
    throw Error('Production is not the exact approved messaging authorization candidate');
  if(!Array.isArray(liveDetails?.modules)||liveDetails.modules.length!==1||liveDetails.modules[0].name!=='worker_hotfix.js')
    throw Error('Live module count or name changed');
  if(typeof liveDetails.modules[0].content_base64!=='string')throw Error('Live Worker module bytes unavailable');
  const bytes=Buffer.from(liveDetails.modules[0].content_base64,'base64');
  if(bytes.length<600000||bytes.length>1000000)throw Error('Unexpected Worker module size');
  // Compiled worker code should never contain literal provider API tokens. Any suspicion blocks writing.
  const content=bytes.toString('utf8');
  if(/\b[0-9]{8,12}:[a-zA-Z0-9_-]{30,}\b/.test(content) ||
     /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content))
    throw Error('Potential embedded credential in live module; refuse canonical capture');
  const expected=['handleTelegramStatus','handleWhatsAppStatus','handleTelegramWebhook',
    'handleWhatsAppWebhook','handleMercadoPagoWebhook','applyMercadoPagoPayment'].sort();
  // Compare EVERY byte outside the six previously audited function bodies.
  // A suffix, import, cron handler, unrelated function, or top-level change is NEVER allowed.
  function withoutApprovedBodies(code) {
    let remainder=code;
    for(const name of expected) {
      const start=remainder.indexOf('async function '+name+'(');
      const end=start<0?-1:remainder.indexOf('\\n__name('+name+',',start);
      if(start<0||end<0)throw Error('Audited function boundaries unavailable');
      remainder=remainder.slice(0,start)+'/*APD_AUDITED_BODY:'+name+'*/'+remainder.slice(end);
    }
    return remainder;
  }
  if(withoutApprovedBodies(previousBytes.toString('utf8'))!==withoutApprovedBodies(content)) {
    throw Error('Live Worker has unaudited changes outside approved function bodies');
  }
  const diff=compareWorkerModules(previousBytes,bytes);
  if(diff.exactCodeMatch||JSON.stringify([...diff.functionsChanged].sort())!==JSON.stringify(expected) ||
     diff.functionsMissing.length!==0 || diff.telegramStatusUnsafeIdFallback!==false ||
     diff.whatsappStatusUnsafeIdFallback!==false)
    throw Error('Live Worker changes do not match the previously audited release');
  const oldBindings=new Map((snapshot.bindings||[]).map(b=>[b.name+':'+b.type,b]));
  const activeBindings=(liveDetails.bindings||[]).map(b=>({
    name:String(b.name||''),type:String(b.type||''),
    ...(b.type==='kv_namespace'?{namespace_id:String(b.namespace_id||b.id||'')}:{})
  }));
  if(activeBindings.some(b=>!b.name||!b.type)||activeBindings.length!==oldBindings.size)throw Error('Bindings shape changed');
  const currentBindings=new Map(activeBindings.map(b=>[b.name+':'+b.type,b]));
  if(currentBindings.size!==oldBindings.size)throw Error('Binding types or names changed');
  for(const [key,prior] of oldBindings){
    const actual=currentBindings.get(key);
    if(!actual)throw Error('Required Worker binding removed or retyped');
    if(prior.namespace_id&&actual.namespace_id!==prior.namespace_id)throw Error('KV binding changed');
  }
  if(!currentBindings.has('MERCADOPAGO_WEBHOOK_SECRET:secret_text') ||
     !currentBindings.has('MERCADOPAGO_ACCESS_TOKEN:secret_text'))throw Error('Mercado Pago secrets missing');
  const next={
    ...snapshot,version_id:String(active[0].version_id),captured_at:when.toISOString(),
    modules:[{name:'worker_hotfix.js',sha256:sha256(bytes),bytes:bytes.length}],
    bindings:activeBindings.sort((a,b)=>a.name.localeCompare(b.name))
  };
  return {manifest:next,bytes};
}

async function get(apiToken,path){
  const res=await fetch('https://api.cloudflare.com/client/v4'+path,{
    method:'GET',headers:{Authorization:'Bearer '+apiToken},
    signal:AbortSignal.timeout(15000)
  });
  if(!res.ok)throw Error('Cloudflare metadata request HTTP '+res.status);
  const data=await res.json();
  if(data?.success!==true)throw Error('Cloudflare rejected metadata request');
  return data.result;
}
async function smoke(){
  const host='https://'+workerName+'.apdocentepba.workers.dev';
  const checks=[
    ['/api/version',200],['/api/planes',200],
    ['/api/mi-plan',401],['/api/mis-alertas',401],
    ['/api/account/profile',401],['/api/account/preferences',401],
    ['/api/telegram/status?user_id=00000000-0000-4000-8000-000000000000',401],
    ['/api/whatsapp/status?user_id=00000000-0000-4000-8000-000000000000',401]
  ];
  for(const [path,expected] of checks){
    const r=await fetch(host+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(r.status!==expected)throw Error('Active Worker smoke failed for '+path+' (HTTP '+r.status+')');
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.env.GITHUB_REF_NAME!=='main' || process.env.GITHUB_EVENT_NAME!=='push')
    throw Error('Capture allowed only from a push to main');
  const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
  if(!token)throw Error('Missing Cloudflare read-only credentials');
  let account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
  if(!account){
    const accounts=await get(token,'/accounts?per_page=50');
    if(!Array.isArray(accounts)||accounts.length!==1)throw Error('Cloudflare account is ambiguous');
    account=String(accounts[0].id);
  }
  const snapshot=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
  const oldBytes=fs.readFileSync('worker-live/worker_hotfix.js');
  const root='/accounts/'+encodeURIComponent(account)+'/workers/';
  const dep=await get(token,root+'scripts/'+workerName+'/deployments');
  const versions=await get(token,root+'workers/'+workerName+'/versions?per_page=50');
  const list=Array.isArray(versions)?versions:(versions?.versions||[]);
  const approved=list.find(v=>v.annotations?.['workers/tag']===approvedTag);
  if(!approved?.id)throw Error('Approved version tag not found');
  const live=await get(token,root+'workers/'+workerName+'/versions/'+encodeURIComponent(approved.id)+'?include=modules');
  const result=verifiedCapture(snapshot,oldBytes,dep,approved,live);
  await smoke();
  const second=await get(token,root+'scripts/'+workerName+'/deployments');
  const still=(second?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
  if(still.length!==1 || String(still[0].version_id)!==result.manifest.version_id)
    throw Error('Production version changed mid-verification');
  fs.writeFileSync('worker-live/worker_hotfix.js',result.bytes);
  fs.writeFileSync('worker-live/manifest.json',JSON.stringify(result.manifest,null,2)+'\n');
  console.log('APD_CANONICAL_CAPTURE_VERIFIED');
  console.log('Current production source and version captured; secret values never saved; 8 HTTP contracts passed.');
  console.log('No Cloudflare mutations, payments, emails or subscription changes.');
}
