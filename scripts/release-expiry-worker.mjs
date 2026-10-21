// Deliberately gated, one-off APD Worker release. Never run outside main.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const WORKER = 'ancient-wildflower-cd37';
const WORKER_URL = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev';
const PREVIEW_URL = 'https://apd-expiry-release-ancient-wildflower-cd37.apdocentepba.workers.dev';
const SITE_URL = 'https://alertasapd.com.ar';
const MANIFEST_PATH = 'worker-live/manifest.json';
const secret = String(process.env.CLOUDFLARE_API_TOKEN || '');
const short = String(process.env.GITHUB_SHA || '').slice(0,8);
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
if (process.env.GITHUB_REF_NAME !== 'main' || process.env.GITHUB_EVENT_NAME !== 'push') {
  throw new Error('Release must run from a push to main only.');
}
if (!secret || !short) throw new Error('Missing required deployment authentication/context.');
const canonical = JSON.parse(fs.readFileSync(MANIFEST_PATH,'utf8'));
if (!canonical?.version_id || canonical?.main_module !== 'worker_hotfix.js')
  throw new Error('Canonical production baseline unavailable.');
if (fs.readFileSync('worker-live/worker_hotfix.js','utf8').includes('APD_EXPIRY_NOTICE_V1: notification only')) {
  console.log('Release already present in canonical Worker; skipping repeat deployment.');
  process.exit(0);
}
let accountId = '';
let oldVersion = '';
let newVersion = '';
let deployed = false;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function cf(path, body) {
  const response = await fetch('https://api.cloudflare.com/client/v4' + path,{
    method: body ? 'POST' : 'GET',
    headers: {'Authorization':'Bearer '+secret,'Content-Type':'application/json'},
    body: body ? JSON.stringify(body):undefined
  });
  const json = await response.json().catch(()=>null);
  if (!response.ok || !json?.success) {
    const code = (json?.errors||[]).map(x=>x.code).join(',');
    throw new Error('Cloudflare API rejected request: '+response.status+' codes '+code);
  }
  return json.result;
}
async function activeVersion(){
 const x=await cf('/accounts/'+accountId+'/workers/scripts/'+WORKER+'/deployments');
 const d=x?.deployments?.[0];
 const live=(d?.versions||[]).filter(z=>Number(z.percentage)>0);
 if(live.length!==1 || Number(live[0].percentage)!==100 || !live[0].version_id)
   throw new Error('Production is not on one fully promoted version');
 return live[0].version_id;
}
async function httpCode(url,{method='GET'}={}){
 for(let attempt=0;attempt<5;attempt++){
  try{const resp=await fetch(url,{method,redirect:'follow',signal:AbortSignal.timeout(13000)});return resp.status;}
  catch(err){if(attempt===4)throw err;await sleep(1800);}
 }
}
async function smoke(base){
 const checks=[
  ['/api/version',200],['/api/planes',200],
  ['/api/mi-plan',401],['/api/mis-alertas',401],
  ['/api/historico-resumen',401]
 ];
 for(const [route,expected] of checks){
  const got=await httpCode(base+route);
  if(got!==expected)throw new Error('HTTP contract '+route+': '+got+' expected '+expected);
 }
 const site=await httpCode(SITE_URL+'/');
 if(site!==200) throw new Error('Public site health '+site);
 console.log('HTTP contracts verified on '+new URL(base).hostname);
}
async function promote(id,label){
 return await cf('/accounts/'+accountId+'/workers/scripts/'+WORKER+'/deployments',{
  strategy:'percentage',
  versions:[{version_id:id,percentage:100}],
  annotations:{'workers/message':label}
 });
}
async function rollback(reason){
 if(!deployed || !oldVersion) return;
 console.error('Post-deploy verification failed; rolling back to original production version.');
 await promote(oldVersion,'Automatic rollback after APD expiry release failure');
 const restored=await activeVersion();
 if(restored!==oldVersion)throw new Error('Rollback verification FAILED: '+reason);
 deployed=false;
 console.log('Production rollback verified.');
}
async function release(){
 const accounts=await cf('/accounts?per_page=50');
 const configured=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
 if(configured){
  if(!accounts.some(x=>x.id===configured))throw new Error('Configured Cloudflare account not accessible');
  accountId=configured;
 }else if(accounts.length===1){accountId=accounts[0].id;}
 else throw new Error('Cloudflare account selection ambiguous');
 oldVersion=await activeVersion();
 if(oldVersion!==canonical.version_id)throw new Error('Production moved since canonical capture. Refusing deploy.');
 console.log('Canonical live source verified, production version unchanged.');
 execFileSync('node',['scripts/create-expiry-guard-candidate.mjs'],{stdio:'inherit'});
 execFileSync('node',['--input-type=module','--check'],{
   input:fs.readFileSync('tmp/expiry-candidate/worker_hotfix.js'),
   stdio:['pipe','inherit','inherit']
 });
 execFileSync('node',['scripts/test-expiry-entitlements.mjs'],{stdio:'inherit'});
 const cfg=fs.readFileSync('wrangler.toml','utf8');
 const needle='main = "worker-live/worker_hotfix.js"';
 if(!cfg.includes(needle)||cfg.includes('[vars]'))throw new Error('Unexpected Wrangler config, do not guess vars');
 const next=cfg.replace(needle,'main = "tmp/expiry-candidate/worker_hotfix.js"')+
  '\n[vars]\nAPD_EXPIRY_NOTICES_ENABLED = "true"\n';
 fs.writeFileSync('wrangler-expiry-release.toml',next);
 const tag='apd-expiry-release-'+short;
 execFileSync('npx',['wrangler','versions','upload',
  '--config','./wrangler-expiry-release.toml',
  '--preview-alias','apd-expiry-release',
  '--tag',tag,
  '--message','Verified APD subscription expiry guard '+short],{stdio:'inherit'});
 if((await activeVersion())!==oldVersion)
   throw new Error('Candidate upload changed production traffic unexpectedly');
 const versionsRes=await cf('/accounts/'+accountId+'/workers/workers/'+WORKER+'/versions?per_page=50');
 const versions=Array.isArray(versionsRes)?versionsRes:(versionsRes?.versions||[]);
 const candidate=versions.find(x=>x.annotations?.['workers/tag']===tag);
 if(!candidate?.id)throw new Error('Uploaded candidate tag missing');
 newVersion=candidate.id;
 const details=await cf('/accounts/'+accountId+'/workers/workers/'+WORKER+'/versions/'+newVersion+'?include=modules');
 if(details.main_module!==canonical.main_module || !Array.isArray(details.modules) || details.modules.length!==1)
   throw new Error('Unexpected candidate module shape');
 const actual=new Map((details.bindings||[]).map(x=>[x.name+':'+x.type,x]));
 for (const expected of canonical.bindings || []){
  const got=actual.get(expected.name+':'+expected.type);
  if(!got)throw new Error('Candidate lost required binding '+expected.name);
  if(expected.namespace_id && String(got.namespace_id||got.id||'')!==expected.namespace_id)
    throw new Error('Candidate KV binding mismatch '+expected.name);
 }
 if(!actual.get('APD_EXPIRY_NOTICES_ENABLED:plain_text'))
   throw new Error('Expiry notices opt-in flag absent from candidate');
 console.log('Candidate retains all existing bindings; announcement mails gated and limited.');
 await smoke(PREVIEW_URL);
 if((await activeVersion())!==oldVersion)throw new Error('Production version moved during preview smoke');
 // Traffic changes only after verifying the exact candidate and its original baseline.
 // Mark promotion as attempted before the remote call so a lost API response
 // cannot leave a newly deployed version without rollback coverage.
 deployed=true;
 await promote(newVersion,'APD verified expiry/paywall update '+short);
 if((await activeVersion())!==newVersion)throw new Error('Candidate failed to reach 100% deployment');
 await smoke(WORKER_URL);
 const deployedMetadata=await cf('/accounts/'+accountId+'/workers/workers/'+WORKER+'/versions/'+newVersion+'?include=modules');
 const mod=deployedMetadata?.modules?.find(x=>x.name==='worker_hotfix.js');
 if(!mod?.content_base64)throw new Error('Missing authoritative deployed module bytes for canonical capture');
 const bytes=Buffer.from(mod.content_base64,'base64');
 if(bytes.length<500000)throw new Error('Unexpectedly small deployed Worker');
 const manifest={...canonical,
  schema_version:2,version_id:newVersion,captured_at:new Date().toISOString(),
  modules:[{name:'worker_hotfix.js',sha256:sha(bytes),bytes:bytes.length}],
  bindings:(deployedMetadata.bindings||[]).map(x=>({
   name:String(x.name||''),type:String(x.type||''),
   ...(x.type==='kv_namespace'?{namespace_id:String(x.namespace_id||x.id||'')}:{})
  }))
 };
 delete manifest.version_number; // Version detail may omit numeric version; avoid stale metadata.
 fs.writeFileSync('worker-live/worker_hotfix.js',bytes);
 fs.writeFileSync(MANIFEST_PATH,JSON.stringify(manifest,null,2)+'\n');
 execFileSync('node',['scripts/test-live-source-equivalence.mjs'],{stdio:'inherit'});
 execFileSync('node',['scripts/test-account-security-contract.mjs'],{stdio:'inherit'});
 execFileSync('node',['scripts/test-mercadopago-status-mapping.mjs'],{stdio:'inherit'});
 execFileSync('node',['scripts/test-worker-packaging-guard-regression.mjs'],{stdio:'inherit'});
 execFileSync('git',['config','user.name','github-actions[bot]']);
 execFileSync('git',['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
 execFileSync('git',['add','worker-live/worker_hotfix.js',MANIFEST_PATH]);
 execFileSync('git',['commit','-m','chore: capture verified live APD expiry release '+short],{stdio:'inherit'});
 execFileSync('git',['push','origin','HEAD:main'],{stdio:'inherit'});
 console.log('APD expiry Worker released and canonical snapshot pushed: '+newVersion);
}
try{await release();}
catch(err){
 console.error('RELEASE FAILED:',String(err?.message||err));
 try { await rollback(String(err?.message||err)); }
 catch(rb){console.error('URGENT rollback error:',String(rb?.message||rb));}
 process.exitCode=1;
}
