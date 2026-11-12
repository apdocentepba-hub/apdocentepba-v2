/**
 * User-authorized release APD-ACCOUNT-HOME-20261112.
 * Promotes an EXACT, already-tested Cloudflare Workers version. Never uploads,
 * rebuilds, or overwrites the current active Worker source.
 * Fails closed if the current production version changed; attempts immediate
 * rollback to the pinned old version on any post-promotion failure.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
const worker='ancient-wildflower-cd37';
const before='c36834b1-0a35-4a3f-9a5e-0cc117a00bd7';
const candidate='3bbc9f42-9f65-4eda-83d1-2a0cf7ff25b2';
const tag='apd-home-pr277-a75d6643';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const configuredId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const runRef=String(process.env.GITHUB_REF_NAME||'');
if(runRef!=='release/apd-account-home-20261112' ||
   process.env.APD_ACCOUNT_HOME_RELEASE !== 'AUTHORIZED_GO_REAL_QA_PASS' ||
   !token)throw Error('APD home release blocked by operator gate');
const cloud=async(path,body)=>{
 const res=await fetch('https://api.cloudflare.com/client/v4'+path,{
  method:body===undefined?'GET':'POST',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(25000)
 });
 const parsed=await res.json().catch(()=>null);
 if(!res.ok||parsed?.success!==true)
  throw Error('Cloudflare request rejected HTTP '+res.status);
 return parsed.result;
};
const accounts=await cloud('/accounts?per_page=50');
if(!Array.isArray(accounts)||!accounts.length)throw Error('Cloudflare accounts unavailable');
const account=configuredId || (accounts.length===1?accounts[0]?.id:'');
if(!account||!accounts.some(x=>x.id===account))
 throw Error('Cloudflare account ambiguous; no release');
const prefix='/accounts/'+encodeURIComponent(account)+'/workers/';
const deploymentPath=prefix+'scripts/'+worker+'/deployments';
const liveVersion=async()=>{
 const result=await cloud(deploymentPath);
 const traffic=(result?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
 if(traffic.length!==1||Number(traffic[0].percentage)!==100||!traffic[0].version_id)
  throw Error('Production Worker no longer pinned to one version at 100%');
 return String(traffic[0].version_id);
};
const promote=(id,message)=>cloud(deploymentPath,{
 strategy:'percentage',versions:[{version_id:id,percentage:100}],
 annotations:{'workers/message':message}
});
const st=(method,url)=>fetch(url,{
 method,redirect:'manual',signal:AbortSignal.timeout(15000),
 ...(method==='PUT'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})
}).then(async res=>{await res.body?.cancel();return res.status});
const production='https://'+worker+'.apdocentepba.workers.dev';
async function smoke(){
 const checks=[
  ['GET','/api/account/home',401],
  ['PUT','/api/account/home',401],
  ['DELETE','/api/account/home',401],
  ['POST','/api/account/home',405],
  ['GET','/api/account/profile',401],
  ['GET','/api/account/preferences',401],
  ['GET','/api/mi-plan',401],
  ['GET','/api/mis-alertas',401],
  ['GET','/api/version',200],
  ['GET','/api/planes',200]
 ];
 for(const [method,path,expected] of checks){
  let actual=null;
  for(let n=0;n<3;n++){
   try{actual=await st(method,production+path)}catch{}
   if(actual===expected)break;
   await new Promise(resolve=>setTimeout(resolve,1200));
  }
  if(actual!==expected)throw Error('APD_HOME_RELEASE_SMOKE_FAILED '+method+' '+path+' expected='+expected+' actual='+actual);
  console.log('APD_HOME_RELEASE_SMOKE '+method+' '+path+' HTTP '+actual);
 }
 const site=await st('GET','https://alertasapd.com.ar/');
 if(site!==200)throw Error('Public website health check HTTP '+site);
 return checks.length+1;
}
let attempted=false;
let completed=false;
try{
 const current=await liveVersion();
 if(current!==before)throw Error('STOP: production Worker changed since QA; expected pinned previous version');
 const versionsRaw=await cloud(prefix+'workers/'+worker+'/versions?per_page=50');
 const list=Array.isArray(versionsRaw)?versionsRaw:versionsRaw?.versions||[];
 const selected=list.find(x=>x.id===candidate);
 if(!selected||selected.annotations?.['workers/tag']!==tag)
  throw Error('QA-approved candidate id/tag missing or replaced');
 const detail=await cloud(prefix+'workers/'+worker+'/versions/'+candidate+'?include=modules');
 const modules=detail?.modules||[];
 if(modules.length!==1||typeof modules[0].content_base64!=='string')
  throw Error('Cloudflare candidate module bytes missing');
 const code=Buffer.from(modules[0].content_base64,'base64').toString('utf8');
 if(!code.includes('handleAccountHomeSecureV1') ||
    !code.includes('getSessionUserByBearer') ||
    !code.includes('user_home_reference?user_id=eq.') ||
    !code.includes('/account/home'))
  throw Error('QA candidate missing endpoint auth or user isolation');
 const types=new Map((detail.bindings||[]).map(x=>[x.name+':'+x.type,x]));
 const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
 const expectedBindings=manifest.bindings||[];
 if(types.size<29 || expectedBindings.some(b=>{
  const curr=types.get(b.name+':'+b.type);
  return !curr||(b.namespace_id&&String(curr.namespace_id||curr.id||'')!==String(b.namespace_id));
 }))throw Error('QA candidate lost any canonical binding or KV namespace');
 const currentAgain=await liveVersion();
 if(currentAgain!==before)throw Error('Production moved between preflight and promotion');
 // Only here can production traffic change. The original deployment remains
 // immutable and is restorable via Cloudflare percentage deployment API.
 attempted=true;
 await promote(candidate,'APD domicile account route, 12 Nov 2026; revertable to '+before.slice(0,8));
 if(await liveVersion()!==candidate)throw Error('Cloudflare did not promote exact tested version');
 const checked=await smoke();
 if(await liveVersion()!==candidate)throw Error('Production Worker changed after post-deploy QA');
 completed=true;
 console.log('APD_HOME_PRODUCTION_RELEASE_SUCCESS '+JSON.stringify({
  version:candidate,previous:before,checks:checked,
  preserved_binding_types:types.size,rollback_version:before,
  changed:'Cloudflare deployment percentage only',
  untouched:['cron triggers','existing users','payments','alert rows','source files']
 }));
}catch(error){
 console.error('APD_HOME_PRODUCTION_RELEASE_STOP '+String(error?.message||error).slice(0,300));
 if(attempted&&!completed){
  try{
   await promote(before,'APD HOME automatic rollback after release gate failure');
   if(await liveVersion()!==before)throw Error('rollback could not verify restored version');
   console.error('APD_HOME_ROLLBACK_OK original Worker restored 100%');
  }catch(rollbackError){
   console.error('APD_HOME_ROLLBACK_CRITICAL '+String(rollbackError?.message||rollbackError).slice(0,300));
  }
 }
 process.exitCode=1;
}
