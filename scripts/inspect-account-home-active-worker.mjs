/**
 * Read only Cloudflare active Worker capture for account-home preview.
 * Stores only candidate bytes in tmp/ on the GitHub runner; never writes
 * secrets, production user rows, or the canonical worker-live snapshot.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const name='ancient-wildflower-cd37';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
if(!token)throw Error('Cloudflare token missing');
const root='tmp/apd-account-home';
fs.mkdirSync(root,{recursive:true});
const get=async endpoint=>{
 const response=await fetch('https://api.cloudflare.com/client/v4'+endpoint,{
  headers:{Authorization:'Bearer '+token},
  signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error('Cloudflare metadata HTTP '+response.status);
 const json=await response.json();
 if(json.success!==true)throw Error('Cloudflare metadata rejected');
 return json.result;
};
let id=String(process.env.CONFIGURED_ACCOUNT_ID||'').trim();
const accounts=await get('/accounts?per_page=50');
if(!Array.isArray(accounts)||!accounts.length)throw Error('Cloudflare account inaccessible');
if(!id){
 if(accounts.length!==1)throw Error('Cloudflare account ambiguous');
 id=String(accounts[0].id);
}else if(!accounts.some(a=>a.id===id))throw Error('Cloudflare configured account inaccessible');
const prefix='/accounts/'+encodeURIComponent(id)+'/workers/';
const depPath=prefix+'scripts/'+encodeURIComponent(name)+'/deployments';
const deployment=await get(depPath);
const live=(deployment?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
if(live.length!==1||Number(live[0].percentage)!==100||!live[0].version_id)
 throw Error('Production Worker is not pinned to exactly one 100% version');
const version=String(live[0].version_id);
const details=await get(prefix+'workers/'+encodeURIComponent(name)+'/versions/'+encodeURIComponent(version)+'?include=modules');
const modules=details?.modules||[];
if(modules.length!==1||modules[0]?.name!=='worker_hotfix.js'||
  typeof modules[0].content_base64!=='string')
 throw Error('Unexpected Cloudflare live module shape; refuse staging');
const source=Buffer.from(modules[0].content_base64,'base64');
const code=source.toString('utf8');
if(source.length<100000||source.length>3000000||
 !code.includes('getSessionUserByBearer')||
 !code.includes('handleAccountProfileSecureV1')||
 !code.includes('handleAccountPreferencesSecureV1')||
 !code.includes('async fetch(request, env, ctx)')||
 !code.includes('scheduled('))
 throw Error('Unexpected active Worker source; refuse staging');
if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(code)||
  /\b[0-9]{8,12}:[A-Za-z0-9_-]{30,}\b/.test(code))
 throw Error('Potential embedded secret in active Worker source');
const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
if(manifest.worker_name!==name||manifest.main_module!=='worker_hotfix.js')
 throw Error('Canonical manifest identity changed');
const old=new Map((manifest.bindings||[]).map(b=>[b.name+':'+b.type,b]));
const now=new Map((details.bindings||[]).map(b=>[b.name+':'+b.type,b]));
if(now.size<old.size)throw Error('Live binding count decreased below canonical manifest');
for(const [key,record] of old){
 const current=now.get(key);
 if(!current)throw Error('Active Worker binding is missing/retyped: '+key);
 if(record.namespace_id&&record.namespace_id!==String(current.namespace_id||current.id||''))
  throw Error('Active Worker KV binding changed: '+record.name);
}
fs.writeFileSync(path.join(root,'active-worker.mjs'),source);
fs.writeFileSync(path.join(root,'active-version.txt'),version);
fs.writeFileSync(path.join(root,'account-id.txt'),id);
fs.writeFileSync(path.join(root,'active-binding-keys.json'),
 JSON.stringify([...now.keys()].sort()));
console.log('APD_ACCOUNT_HOME_LIVE_SOURCE_READY '+JSON.stringify({
 live_version:version,matching_old_manifest:version===manifest.version_id,
 bytes:source.length,
 sha256_prefix:crypto.createHash('sha256').update(source).digest('hex').slice(0,12),
 bound_count:now.size,
 mode:'runner_local_only',production_traffic:100
}));
