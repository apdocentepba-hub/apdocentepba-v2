// Read-only forensic comparison. Never print Cloudflare source, secrets, hashes or response bodies.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function compareWorkerModules(local, remote) {
  const expected=Buffer.isBuffer(local)?local:Buffer.from(local);
  const actual=Buffer.isBuffer(remote)?remote:Buffer.from(remote);
  const digest=(buf)=>crypto.createHash('sha256').update(buf).digest('hex');
  const exact=digest(expected)===digest(actual) && expected.length===actual.length;
  let prefix=0;
  while(prefix<expected.length && prefix<actual.length && expected[prefix]===actual[prefix]) prefix++;
  let suffix=0;
  while(suffix<expected.length-prefix && suffix<actual.length-prefix &&
    expected[expected.length-1-suffix]===actual[actual.length-1-suffix]) suffix++;
  const anchors=[
    'getSessionUserByBearer','handleTelegramStatus','handleWhatsAppStatus',
    'requireTelegramWebhookSecret','handleTelegramWebhook','handleWhatsAppWebhook',
    'handleMercadoPagoWebhook','applyMercadoPagoPayment','elegirSuscripcionVigente',
    'resolverPlanUsuario'
  ];
  const textLocal=expected.toString('utf8');
  const textRemote=actual.toString('utf8');
  function body(src,name) {
    const m=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(').exec(src);
    if(!m)return null;
    const start=m.index;
    const end=src.indexOf('\n__name('+name+',',start);
    return end>start ? src.slice(start,end):null;
  }
  const changedFunctions=[];
  const missingFunctions=[];
  for(const name of anchors) {
    const one=body(textLocal,name),two=body(textRemote,name);
    if(!two){missingFunctions.push(name);continue;}
    if(!one || digest(Buffer.from(one))!==digest(Buffer.from(two)))changedFunctions.push(name);
  }
  // Only report presence of a known insecure pattern, never source code or IDs.
  function insecureMessagingFallback(src,name) {
    const fragment=body(src,name);
    return fragment?fragment.includes('if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId)'):null;
  }
  return {
    exactCodeMatch:exact,
    expectedBytes:expected.length,
    currentBytes:actual.length,
    changedByteRegionBefore:expected.length-prefix-suffix,
    changedByteRegionNow:actual.length-prefix-suffix,
    functionsChanged:changedFunctions,
    functionsMissing:missingFunctions,
    telegramStatusUnsafeIdFallback:insecureMessagingFallback(textRemote,'handleTelegramStatus'),
    whatsappStatusUnsafeIdFallback:insecureMessagingFallback(textRemote,'handleWhatsAppStatus')
  };
}

async function getCloudflare(token,path) {
  const response=await fetch('https://api.cloudflare.com/client/v4'+path,{
    method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)
  });
  if(!response.ok) throw Error('Cloudflare read failed: HTTP '+response.status);
  const payload=await response.json();
  if(payload?.success!==true)throw Error('Cloudflare API rejected metadata read');
  return payload.result;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
  if(!token)throw Error('Cloudflare read-only token unavailable');
  const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
  let account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
  if(!account){
    const accounts=await getCloudflare(token,'/accounts?per_page=50');
    if(!Array.isArray(accounts)||accounts.length!==1)throw Error('Account ambiguous; refusing to inspect');
    account=String(accounts[0].id||'');
  }
  const root='/accounts/'+encodeURIComponent(account)+'/workers/';
  const deployments=await getCloudflare(token,root+'scripts/'+encodeURIComponent(manifest.worker_name)+'/deployments');
  const active=(deployments?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
  if(active.length!==1||Number(active[0].percentage)!==100||!active[0].version_id)throw Error('Ambiguous live version');
  const remote=await getCloudflare(token,root+'workers/'+encodeURIComponent(manifest.worker_name)+'/versions/'+encodeURIComponent(active[0].version_id)+'?include=modules');
  const target=(remote?.modules||[]).find(m=>m.name===manifest.main_module);
  if(typeof target?.content_base64!=='string')throw Error('Module bytes unavailable; code parity unverified');
  const local=fs.readFileSync('worker-live/'+manifest.main_module);
  const actual=Buffer.from(target.content_base64,'base64');
  const results=compareWorkerModules(local,actual);
  const bindings=(remote.bindings||[]).map(x=>x.name+':'+x.type);
  results.versionEqualsManifest=String(active[0].version_id)===String(manifest.version_id);
  results.telegramTokenSecretBound=bindings.includes('TELEGRAM_BOT_TOKEN:secret_text');
  results.telegramTokenPlaintextBound=bindings.includes('TELEGRAM_BOT_TOKEN:plain_text');
  results.mpSignatureSecretBound=bindings.includes('MERCADOPAGO_WEBHOOK_SECRET:secret_text');
  // No credentials, no source code excerpts, no raw hash, no IDs.
  console.log('APD_READ_ONLY_DRIFT_AUDIT '+JSON.stringify(results));
}
