/**
 * Upload scoped CORS fix into Cloudflare 0%-traffic immutable version.
 * Never promote and never call authenticated mutation with a real token.
 * Preview smoke is anonymous, including all PUT/DELETE denial checks.
 */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=name=>fs.readFileSync('tmp/apd-home-cors/'+name,'utf8').trim();
const oldVersion=read('old-version.txt');
const account=read('cloudflare-account-id.txt');
const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
const worker='ancient-wildflower-cd37';
const previewAlias='apd-home-cors-pr282';
const preview='https://'+previewAlias+'-'+worker+'.apdocentepba.workers.dev';
const tag='apd-cors-pr282-'+String(process.env.GITHUB_SHA||'').slice(0,8);
const origin='https://alertasapd.com.ar';
if(!token||tag.length<20)throw Error('Missing guarded upload metadata');
const api=async pathname=>{
 const response=await fetch('https://api.cloudflare.com/client/v4'+pathname,{
  headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error('Cloudflare metadata HTTP '+response.status);
 const json=await response.json();
 if(!json.success)throw Error('Cloudflare returned a rejected response');
 return json.result;
};
const prefix='/accounts/'+encodeURIComponent(account)+'/workers/';
const deploymentPath=prefix+'scripts/'+worker+'/deployments';
const activeVersion=async()=>{
 const data=await api(deploymentPath);
 const traffic=(data.deployments?.[0]?.versions||[]).filter(x=>Number(x.percentage)>0);
 if(traffic.length!==1||Number(traffic[0].percentage)!==100)
  throw Error('Production Worker split traffic, fail closed');
 return String(traffic[0].version_id);
};
if(await activeVersion()!==oldVersion)throw Error('Production Worker drift before candidate upload');
const uploaded=spawnSync('npx',['--no-install','wrangler','versions','upload',
 'tmp/apd-home-cors/worker-cors-candidate.mjs',
 '--config','wrangler.apd-home-cors.ci.toml',
 '--preview-alias',previewAlias,'--tag',tag,
 '--message','APD scoped CORS account/home GET PUT DELETE; no production traffic',
 '--keep-vars','--strict'],{
 encoding:'utf8',timeout:180000,
 env:{...process.env,CLOUDFLARE_API_TOKEN:token}
});
if(uploaded.status!==0)throw Error('Scoped CORS candidate upload failed, exit '+uploaded.status);
if(await activeVersion()!==oldVersion)
 throw Error('STOP: deployment changed during 0%-traffic staging');
const versions=await api(prefix+'workers/'+worker+'/versions?per_page=50');
const list=Array.isArray(versions)?versions:versions?.versions||[];
const matched=list.find(x=>x.annotations?.['workers/tag']===tag);
if(!matched?.id)throw Error('Cannot verify immutable staged UUID');
const candidate=await api(prefix+'workers/'+worker+'/versions/'+matched.id+'?include=modules');
if(candidate.id!==matched.id||!Array.isArray(candidate.modules)||candidate.modules.length!==1)
 throw Error('Staged version module verification failed');
const compiled=Buffer.from(candidate.modules[0].content_base64||'','base64').toString('utf8');
if(!compiled.includes('handleAccountHomeSecureV1')||
   !compiled.includes('cors["Access-Control-Allow-Methods"] = "GET, PUT, DELETE, OPTIONS"'))
 throw Error('Staged bundle missing scoped account/home CORS correction');
const expectedBindings=JSON.parse(read('expected-binding-keys.json'));
const now=new Set((candidate.bindings||[]).map(b=>b.name+':'+b.type));
if(now.size!==29||expectedBindings.some(key=>!now.has(key)))
 throw Error('Staged version lost Cloudflare bindings');
const methods=['GET','PUT','DELETE'];
for(const method of methods){
 const response=await fetch(preview+'/api/account/home',{
  method:'OPTIONS',
  headers:{
   Origin:origin,'Access-Control-Request-Method':method,
   'Access-Control-Request-Headers':method==='GET'?'authorization':'authorization,content-type'
  },redirect:'manual',signal:AbortSignal.timeout(15000)
 });
 const allowed=(response.headers.get('access-control-allow-methods')||'')
  .split(',').map(s=>s.trim().toUpperCase());
 const acao=response.headers.get('access-control-allow-origin')||'';
 const headers=(response.headers.get('access-control-allow-headers')||'')
  .toLowerCase();
 if(!response.ok||!allowed.includes(method)||
    !(acao==='*'||acao===origin)||!headers.includes('authorization')||
    (method!=='GET'&&!headers.includes('content-type')))
  throw Error('Preview browser CORS preflight rejected '+method);
 await response.body?.cancel();
 console.log('APD_CORS_PREVIEW_PREFLIGHT '+method+' PASS');
}
const probes=[
 ['GET','/api/account/home',401],
 ['PUT','/api/account/home',401],
 ['DELETE','/api/account/home',401],
 ['POST','/api/account/home',405],
 ['GET','/api/account/profile',401],
 ['GET','/api/version',200],
 ['GET','/api/planes',200]
];
for(const [method,path,expected] of probes){
 const response=await fetch(preview+path,{
  method,headers:{Origin:origin,Authorization:'Bearer invalid-qa-only',
   ...(method==='PUT'?{'Content-Type':'application/json'}:{})},
  ...(method==='PUT'?{body:'{}'}:{}),
  redirect:'manual',signal:AbortSignal.timeout(15000)
 });
 const acao=response.headers.get('access-control-allow-origin')||'';
 if(response.status!==expected||!(acao==='*'||acao===origin))
  throw Error('Preview HTTP '+method+' '+path+' actual '+response.status+' expected '+expected);
 await response.body?.cancel();
 console.log('APD_CORS_PREVIEW_HTTP '+method+' '+path+' HTTP '+response.status);
}
if(await activeVersion()!==oldVersion)
 throw Error('STOP: active Worker changed during preview checks');
fs.writeFileSync('tmp/apd-home-cors/candidate-id.txt',String(candidate.id)+'\n');
console.log('APD_HOME_CORS_STAGE_PASS '+JSON.stringify({
 old_version:oldVersion,
 candidate_version:candidate.id,
 candidate_tag:tag,
 preview_checks:methods.length+probes.length,
 bindings_preserved:now.size,
 production_traffic_previous_version_percent:100,
 scope:'Cloudflare immutable 0%-traffic candidate; no authenticated writes'
}));
