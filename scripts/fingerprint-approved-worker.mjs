// Attest exactly the approved deployed APDocente Worker version (READ ONLY).
// Prints only its SHA-256 digest, module size and two authorization booleans.
import crypto from 'node:crypto';
const worker='ancient-wildflower-cd37';
const tag='apd-msg-auth-2e605fd5';
async function get(token,path){
  const r=await fetch('https://api.cloudflare.com/client/v4'+path,{
    method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Cloudflare metadata HTTP '+r.status);
  const p=await r.json();
  if(p?.success!==true)throw Error('Cloudflare metadata read rejected');
  return p.result;
}
if(process.env.GITHUB_REF_NAME!=='main'||process.env.GITHUB_EVENT_NAME!=='push')
  throw Error('Attestation requires merged source on main');
const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
if(!token)throw Error('Read-only credential unavailable');
let account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
if(!account){
 const list=await get(token,'/accounts?per_page=50');
 if(!Array.isArray(list)||list.length!==1)throw Error('Account lookup ambiguous');
 account=String(list[0].id);
}
const root='/accounts/'+encodeURIComponent(account)+'/workers/';
const dep=await get(token,root+'scripts/'+worker+'/deployments');
const v=(dep?.deployments?.[0]?.versions||[]).filter(x=>Number(x.percentage)>0);
if(v.length!==1||Number(v[0].percentage)!==100||!v[0].version_id)throw Error('Production not in a single version');
const list=await get(token,root+'workers/'+worker+'/versions?per_page=50');
const rows=Array.isArray(list)?list:list?.versions||[];
const verified=rows.find(x=>x.annotations?.['workers/tag']===tag);
if(!verified?.id||verified.id!==v[0].version_id)throw Error('Active release does not match approved tag');
const data=await get(token,root+'workers/'+worker+'/versions/'+encodeURIComponent(verified.id)+'?include=modules');
const mod=(data?.modules||[]).find(x=>x.name==='worker_hotfix.js');
if(typeof mod?.content_base64!=='string')throw Error('Approved module bytes not available');
const code=Buffer.from(mod.content_base64,'base64');
const src=code.toString('utf8');
if(code.length<600000||code.length>1000000)throw Error('Unexpected Worker size');
if(/\b[0-9]{8,12}:[a-zA-Z0-9_-]{30,}\b/.test(src))throw Error('Potential embedded credential');
if(src.includes('if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId)'))
 throw Error('Status authorization guard missing');
const bindings=(data.bindings||[]).map(x=>x.name+':'+x.type);
if(!bindings.includes('MERCADOPAGO_WEBHOOK_SECRET:secret_text')||!bindings.includes('MERCADOPAGO_ACCESS_TOKEN:secret_text'))
 throw Error('Payment bindings incomplete');
console.log('APD_APPROVED_LIVE_MODULE_SHA256 '+crypto.createHash('sha256').update(code).digest('hex'));
console.log('APD_APPROVED_LIVE_MODULE_BYTES '+code.length);
console.log('APD_APPROVED_LIVE_VERSION_TAG_VERIFIED true');
console.log('No source, token values, account IDs or private user data exposed.');
