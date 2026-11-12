/**
 * One-off safe stage on an exact fresh Cloudflare baseline.
 * Version URL shares production resources: only unauthenticated read-only
 * smoke requests are executed. Never deploys or changes traffic.
 */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const root='tmp/apd-account-home/';
const read=name=>fs.readFileSync(root+name,'utf8').trim();
const live=read('active-worker.mjs');
const candidate=read('worker-home-candidate.mjs');
const mark='\n// Authenticated home reference.';
const start=candidate.indexOf(mark),end=candidate.indexOf('async function handleAccountPreferencesSecureV1',start);
if(start<0||end<start)throw Error('New handler missing');
const withoutHandler=candidate.slice(0,start)+candidate.slice(end);
const route='    if (path === API_URL_PREFIX3 + "/account/home") {\n'+
 '      return await handleAccountHomeSecureV1(request, env);\n    }\n';
if(withoutHandler.split(route).length!==2||withoutHandler.replace(route,'')!==live)
 throw Error('Candidate changed unrelated production Worker code');
const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
const schedules=manifest.schedules;
if(!Array.isArray(schedules)||schedules.length!==4)throw Error('Four existing cron expressions required');
const base=fs.readFileSync('wrangler.toml','utf8');
const toml=base
 .replace(/^main = .+$/m,'main = "tmp/apd-account-home/worker-home-candidate.mjs"')
 .replace(/^crons = .+$/m,'crons = '+JSON.stringify(schedules));
if(toml===base||!toml.includes('"1-59/2 * * * *"'))throw Error('Cannot produce four-cron safe config');
fs.writeFileSync('wrangler.account-home.ci.toml',toml);
console.log('APD_HOME_CANDIDATE_DIFF only one endpoint and its handler; four cron expressions in staged config');
const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
const account=read('account-id.txt'),worker='ancient-wildflower-cd37';
const before=read('active-version.txt');
const tag='apd-home-pr277-'+String(process.env.GITHUB_SHA||'').slice(0,8);
if(!token||!account||tag.length<20)throw Error('Missing CI metadata');
const cli=spawnSync('npx',['--no-install','wrangler','versions','upload',
 'tmp/apd-account-home/worker-home-candidate.mjs',
 '--config','wrangler.account-home.ci.toml',
 '--preview-alias','apd-home-pr277','--tag',tag,
 '--message','Account home isolated route candidate: no production traffic',
 '--keep-vars','--strict'],{
 cwd:'.',encoding:'utf8',timeout:180000,
 env:{...process.env,CLOUDFLARE_API_TOKEN:token}
});
if(cli.status!==0){
 // Do not emit raw CLI output because it may contain unmasked providers.
 console.log('APD_HOME_STAGE_UPLOAD_FAILED '+JSON.stringify({
  exit_code:cli.status,reason:'Wrangler failed to upload isolated 0%-traffic version'}));
 throw Error('Version upload failed; production untouched by this workflow');
}
const api=async pathname=>{
 const res=await fetch('https://api.cloudflare.com/client/v4'+pathname,{
  method:'GET',headers:{Authorization:'Bearer '+token},
  signal:AbortSignal.timeout(20000)
 });
 if(!res.ok)throw Error('Cloudflare API HTTP '+res.status);
 const data=await res.json();
 if(!data.success)throw Error('Cloudflare API returned failed status');
 return data.result;
};
const basePath='/accounts/'+encodeURIComponent(account)+'/workers/';
const deployments=await api(basePath+'scripts/'+worker+'/deployments');
const active=(deployments.deployments?.[0]?.versions||[]).filter(x=>Number(x.percentage)>0);
if(active.length!==1||Number(active[0].percentage)!==100||active[0].version_id!==before)
 throw Error('STOP: active production Worker changed from pinned preflight version');
const versions=await api(basePath+'workers/'+worker+'/versions?per_page=50');
const all=Array.isArray(versions)?versions:versions.versions||[];
const staged=all.find(x=>x.annotations?.['workers/tag']===tag);
if(!staged?.id)throw Error('Staged Cloudflare version missing after upload');
const details=await api(basePath+'workers/'+worker+'/versions/'+staged.id+'?include=modules');
const expected=JSON.parse(read('active-binding-keys.json'));
const actual=(details.bindings||[]).map(x=>x.name+':'+x.type);
if(expected.some(key=>!actual.includes(key)))
 throw Error('Staged version is missing active Worker bindings');
// Wrangler bundles the generated entry point under its candidate filename,
// not the original captured worker_hotfix.js name.
if(details.modules?.length!==1||typeof details.modules[0]?.content_base64!=='string')
 throw Error('Unexpected staged Worker module shape');
const compiled=Buffer.from(details.modules[0].content_base64,'base64').toString('utf8');
if(!compiled.includes('handleAccountHomeSecureV1')||
   !compiled.includes('/account/home'))
 throw Error('Compiled Worker is missing the new account route');
// Use no valid bearer tokens; never write an account in the live database.
const preview='https://apd-home-pr277-ancient-wildflower-cd37.apdocentepba.workers.dev';
const checks=[
 ['GET','/api/account/home',401],
 ['PUT','/api/account/home',401],
 ['DELETE','/api/account/home',401],
 ['POST','/api/account/home',405],
 ['GET','/api/account/profile',401],
 ['GET','/api/mis-alertas',401],
 ['GET','/api/version',200],
 ['GET','/api/planes',200]
];
for(const [method,path,expectedStatus] of checks){
 const res=await fetch(preview+path,{method,redirect:'manual',
  signal:AbortSignal.timeout(20000),
  ...(method==='PUT'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})
 });
 if(res.status!==expectedStatus)throw Error('Preview '+method+' '+path+
  ' returned HTTP '+res.status+'; expected '+expectedStatus);
 console.log('APD_HOME_PREVIEW '+method+' '+path+' HTTP '+res.status);
}
console.log('APD_ACCOUNT_HOME_STAGE_PASS '+JSON.stringify({
 active_version:before,candidate_version:staged.id,
 unchanged_production_percentage:100,preview_http_checks:checks.length,
 bindings_preserved:true,scope:'version_url_with_production_resources_read_only_tests'
}));
