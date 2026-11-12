/**
 * Controlled promotion of the exact QA-verified immutable Cloudflare Worker.
 * API /api/account/home scoped browser CORS only, no route/auth logic changes.
 * Fails closed on source drift and rolls back on post-deploy smoke failure.
 */
import fs from 'node:fs';
const WORKER='ancient-wildflower-cd37';
const PREVIOUS='3bbc9f42-9f65-4eda-83d1-2a0cf7ff25b2';
const CANDIDATE='8d0d65d9-a338-45d2-b7e9-68879f35b6d8';
const TAG='apd-cors-pr282-c2703d25';
const ORIGIN='https://alertasapd.com.ar';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
const configAccount=String(process.env.CLOUDFLARE_ACCOUNT_ID||'');
if(!token||String(process.env.GITHUB_REF_NAME)!=='release/apd-home-cors-20261112'||
  process.env.APD_HOME_CORS_GO!=='APPROVED_FIX_WITH_ROLLBACK')
 throw Error('Release blocked: operator and branch gates not satisfied');
async function api(path,body){
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{
  method:body===undefined?'GET':'POST',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(25000)
 });
 const json=await response.json().catch(()=>null);
 if(!response.ok||!json?.success)
  throw Error('Cloudflare API failed HTTP '+response.status);
 return json.result;
}
const accounts=await api('/accounts?per_page=50');
const account=configAccount||(accounts.length===1?accounts[0].id:'');
if(!account||!Array.isArray(accounts)||!accounts.some(a=>a.id===account))
 throw Error('Cloudflare account ambiguous or inaccessible');
const root='/accounts/'+encodeURIComponent(account)+'/workers/';
const deployPath=root+'scripts/'+WORKER+'/deployments';
const live=async()=>{
 const dep=await api(deployPath);
 const active=(dep?.deployments?.[0]?.versions||[]).filter(x=>Number(x.percentage)>0);
 if(active.length!==1||Number(active[0].percentage)!==100)
  throw Error('Cloudflare traffic not pinned to single version');
 return String(active[0].version_id||'');
};
const setVersion=(uuid,message)=>api(deployPath,{
 strategy:'percentage',versions:[{version_id:uuid,percentage:100}],
 annotations:{'workers/message':message}
});
const pinned=JSON.parse(fs.readFileSync(
 'docs/APD_WORKER_APPROVED_LIVE_BASELINE_20261112.json','utf8'));
if(pinned.active_version!==PREVIOUS||pinned.expected_binding_count!==29||
  pinned.approved_crons?.length!==4)
 throw Error('Independently approved baseline metadata changed');
const verifyVersion=async()=>{
 const detail=await api(root+'workers/'+WORKER+'/versions/'+CANDIDATE+'?include=modules');
 if(detail?.id!==CANDIDATE||!Array.isArray(detail.modules)||detail.modules.length!==1)
  throw Error('Candidate immutable UUID missing from Cloudflare');
 const tag=String(detail.annotations?.['workers/tag']||'');
 if(tag && tag!==TAG)throw Error('Unexpected candidate release tag');
 const code=Buffer.from(detail.modules[0].content_base64||'','base64').toString('utf8');
 if(!code.includes('handleAccountHomeSecureV1')||
    !code.includes('getSessionUserByBearer')||
    !code.includes('user_home_reference?user_id=eq.')||
    !code.includes('cors["Access-Control-Allow-Methods"] = "GET, PUT, DELETE, OPTIONS"'))
  throw Error('Candidate source failed scoped CORS and authentication anchor checks');
 const bindings=detail.bindings||[];
 const oldManifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
 const liveBindings=new Map(bindings.map(b=>[b.name+':'+b.type,b]));
 if(bindings.length!==29||liveBindings.size!==29||oldManifest.bindings?.some(b=>{
  const actual=liveBindings.get(b.name+':'+b.type);
  return !actual||(b.namespace_id&&String(actual.namespace_id||actual.id||'')!==b.namespace_id);
 }))throw Error('Candidate lost an approved binding or KV namespace');
 return {tag:tag||'absent',bindings:liveBindings.size};
};
const workerUrl='https://'+WORKER+'.apdocentepba.workers.dev';
const pause=()=>new Promise(r=>setTimeout(r,1000));
async function smoke(){
 const preflight=['GET','PUT','DELETE'];
 for(const method of preflight){
  let okay=false,last=0;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const res=await fetch(workerUrl+'/api/account/home',{
     method:'OPTIONS',headers:{Origin:ORIGIN,
      'Access-Control-Request-Method':method,
      'Access-Control-Request-Headers':method==='GET'?'authorization':'authorization,content-type'},
     signal:AbortSignal.timeout(16000)
    });
    last=res.status;
    const allowed=(res.headers.get('access-control-allow-methods')||'').split(',')
      .map(x=>x.trim().toUpperCase());
    const headers=(res.headers.get('access-control-allow-headers')||'').toLowerCase();
    const acao=res.headers.get('access-control-allow-origin')||'';
    okay=res.ok&&allowed.includes(method)&&headers.includes('authorization')&&
     (method==='GET'||headers.includes('content-type'))&&
     (acao==='*'||acao===ORIGIN);
    await res.body?.cancel();
    if(okay)break;
   }catch{}
   await pause();
  }
  if(!okay)throw Error('Production home CORS preflight '+method+' failed; last HTTP '+last);
  console.log('APD_HOME_CORS_PROD_PREFLIGHT '+method+' PASS');
 }
 // A PUT preflight for an unrelated account route must not be widened.
 const unrelated=await fetch(workerUrl+'/api/account/profile',{
  method:'OPTIONS',headers:{Origin:ORIGIN,
   'Access-Control-Request-Method':'PUT',
   'Access-Control-Request-Headers':'authorization,content-type'},
  signal:AbortSignal.timeout(15000)
 });
 const unrelatedMethods=(unrelated.headers.get('access-control-allow-methods')||'')
  .split(',').map(s=>s.trim().toUpperCase());
 if(unrelatedMethods.includes('PUT'))throw Error('CORS widened an unrelated route');
 await unrelated.body?.cancel();
 console.log('APD_HOME_CORS_UNRELATED_ROUTES_UNCHANGED PASS');
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
 for(const [method,path,expected] of checks){
  let actual=0;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const response=await fetch(workerUrl+path,{
     method,
     headers:{Origin:ORIGIN,Authorization:'Bearer invalid-qa-only',
      ...(method==='PUT'?{'Content-Type':'application/json'}:{})},
     ...(method==='PUT'?{body:'{}'}:{}),signal:AbortSignal.timeout(16000)
    });
    actual=response.status;
    await response.body?.cancel();
    if(actual===expected)break;
   }catch{}
   await pause();
  }
  if(actual!==expected)throw Error('Production route '+method+' '+path+
    ' returned HTTP '+actual+' expected '+expected);
  console.log('APD_HOME_CORS_PROD_ROUTE '+method+' '+path+' HTTP '+actual);
 }
 const site=await fetch(ORIGIN+'/',{signal:AbortSignal.timeout(16000)});
 if(site.status!==200)throw Error('APD static website unavailable');
 await site.body?.cancel();
 return {preflight:preflight.length,otherRoutes:checks.length,
  regressionChecks:1,websiteChecks:1};
}
let changed=false,completed=false;
try{
 const initial=await live();
 if(initial!==PREVIOUS)throw Error('STOP: Cloudflare active version changed before release');
 const candidate=await verifyVersion();
 if(await live()!==PREVIOUS)throw Error('STOP: Cloudflare changed during pre-release check');
 changed=true;
 await setVersion(CANDIDATE,'Account-home browser PUT/DELETE scoped CORS fix. Revert '+PREVIOUS.slice(0,8));
 if(await live()!==CANDIDATE)
  throw Error('Cloudflare active version did not match candidate after promotion');
 const checks=await smoke();
 if(await live()!==CANDIDATE)
  throw Error('Cloudflare active version changed during post-release smoke');
 completed=true;
 console.log('APD_HOME_CORS_PRODUCTION_RELEASE_PASS '+JSON.stringify({
  active_version:CANDIDATE,rollback_version:PREVIOUS,
  traffic_percent:100,bindings:candidate.bindings,...checks,
  method_fix_scoped_to:'/api/account/home',
  user_data_access:false
 }));
}catch(error){
 console.error('APD_HOME_CORS_RELEASE_STOP '+String(error?.message||error).slice(0,250));
 if(changed&&!completed){
  try{
   await setVersion(PREVIOUS,'Automatic rollback account-home CORS release');
   if(await live()!==PREVIOUS)throw Error('Cannot verify rollback');
   console.error('APD_HOME_CORS_ROLLBACK_PASS '+PREVIOUS);
  }catch(rollback){
   console.error('APD_HOME_CORS_ROLLBACK_CRITICAL '+String(rollback?.message||rollback).slice(0,220));
  }
 }
 process.exitCode=1;
}
