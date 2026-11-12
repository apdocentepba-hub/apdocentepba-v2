/**
 * APDocentePBA — scoped CORS fix for browser saving home reference.
 * Build the candidate solely from the independently attested active Worker.
 * Never use the stale worker-live/worker_hotfix.js as a deployment baseline.
 * No credentials, production source or user data are persisted in the repo.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
const worker='ancient-wildflower-cd37';
const pinned=JSON.parse(fs.readFileSync(
 'docs/APD_WORKER_APPROVED_LIVE_BASELINE_20261112.json','utf8'));
const oldVersion=pinned.active_version;
const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
if(!token)throw Error('Cloudflare token missing; refusing to build');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const api=async url=>{
 const res=await fetch('https://api.cloudflare.com/client/v4'+url,{
  headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)
 });
 if(!res.ok)throw Error('Cloudflare metadata HTTP '+res.status);
 const json=await res.json();
 if(!json.success)throw Error('Cloudflare metadata failed');
 return json.result;
};
const accounts=await api('/accounts?per_page=50');
let account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
if(!account){
 if(!Array.isArray(accounts)||accounts.length!==1)
  throw Error('Cloudflare account ambiguous');
 account=String(accounts[0]?.id||'');
}
if(!Array.isArray(accounts)||!accounts.some(a=>a.id===account))
 throw Error('Configured Cloudflare account not found');
const root='/accounts/'+encodeURIComponent(account)+'/workers/';
const deployments=()=>api(root+'scripts/'+worker+'/deployments');
const actualVersion=raw=>{
 const active=(raw?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
 if(active.length!==1||Number(active[0].percentage)!==100)
  throw Error('Cloudflare production traffic is not single 100% deployment');
 return String(active[0].version_id||'');
};
if(actualVersion(await deployments())!==oldVersion)
 throw Error('STOP: active Cloudflare Worker changed after approved baseline');
const detail=await api(root+'workers/'+worker+'/versions/'+oldVersion+'?include=modules');
if(detail?.id!==oldVersion||detail?.main_module!==pinned.module.name||
   !Array.isArray(detail.modules)||detail.modules.length!==1||
   detail.modules[0].name!==pinned.module.name)
 throw Error('STOP: approved Cloudflare source shape differs');
const sourceBytes=Buffer.from(detail.modules[0].content_base64||'','base64');
if(sourceBytes.length!==pinned.module.bytes||hash(sourceBytes)!==pinned.module.sha256)
 throw Error('STOP: Cloudflare source SHA256 mismatch');
const original=sourceBytes.toString('utf8');
if(!original.includes('handleAccountHomeSecureV1')||
   !original.includes('user_home_reference?user_id=eq.'))
 throw Error('Approved Worker account/home authorization missing');
const before='if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders2() });';
const after=
`if (request.method === "OPTIONS") {
      const cors = corsHeaders2();
      // Only the authenticated domicile API needs PUT and DELETE from web.
      // Authentication and authorization are independently enforced in its
      // handler; this grants no permissions to other API routes.
      if (new URL(request.url).pathname === "/api/account/home")
        cors["Access-Control-Allow-Methods"] = "GET, PUT, DELETE, OPTIONS";
      return new Response(null, { headers: cors });
    }`;
if(original.split(before).length!==2)
 throw Error('STOP: guarded Worker OPTIONS router anchor changed');
const candidate=original.replace(before,after);
if(candidate.replace(after,before)!==original)
 throw Error('Candidate modifies unrelated production code');
const bindings=detail.bindings||[];
const originalManifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
const byKey=new Map(bindings.map(b=>[b.name+':'+b.type,b]));
if(bindings.length!==29||byKey.size!==29||
 originalManifest.bindings?.some(b=>{
  const current=byKey.get(b.name+':'+b.type);
  return !current||(b.namespace_id&&String(current.namespace_id||current.id||'')!==b.namespace_id);
 }))throw Error('STOP: live binding names/types or KV namespaces changed');
const rawCrons=await api(root+'scripts/'+worker+'/schedules');
const schedules=Array.isArray(rawCrons)?rawCrons:rawCrons.schedules||[];
const cronExpressions=schedules.map(x=>typeof x==='string'?x:String(x?.cron||'')).sort();
if(JSON.stringify(cronExpressions)!==JSON.stringify([...pinned.approved_crons].sort()))
 throw Error('STOP: active Worker cron schedules differ from approved four');
if(actualVersion(await deployments())!==oldVersion)
 throw Error('STOP: production moved during candidate build');
const dir='tmp/apd-home-cors';
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'/worker-cors-candidate.mjs',candidate);
fs.writeFileSync(dir+'/cloudflare-account-id.txt',account);
fs.writeFileSync(dir+'/old-version.txt',oldVersion);
fs.writeFileSync(dir+'/expected-binding-keys.json',
 JSON.stringify([...byKey.keys()].sort()));
const wrangler=fs.readFileSync('wrangler.toml','utf8');
const config=wrangler
 .replace(/^main = .+$/m,'main = "tmp/apd-home-cors/worker-cors-candidate.mjs"')
 .replace(/^crons = .+$/m,'crons = '+JSON.stringify(cronExpressions));
if(wrangler===config||!config.includes('1-59/2 * * * *'))
 throw Error('Failed to pin four existing cron schedules in candidate config');
fs.writeFileSync('wrangler.apd-home-cors.ci.toml',config);
console.log('APD_HOME_CORS_BUILD_PASS '+JSON.stringify({
 original_version:oldVersion,
 source_sha256_verified:true,
 original_bytes:sourceBytes.length,
 exact_code_change:'only OPTIONS for /api/account/home',
 preserved_source_rest:true,
 preserved_bindings:bindings.length,
 preserved_crons:cronExpressions.length,
 production_traffic_percent:100,
 destination:'temporary runner candidate only'
}));
