// Controlled production release of a prevalidated auth-only Worker version.
// Fails closed on changed source/bindings; automatically rolls back on smoke failures.
// Does NOT rotate credentials, send messages/payments, or change any database rows.
import {pathToFileURL} from 'node:url';
import {evaluatePromotionGate} from './check-messaging-release-gate.mjs';
const worker='ancient-wildflower-cd37';
const tag='apd-msg-auth-2e605fd5';
const host='https://'+worker+'.apdocentepba.workers.dev';
const preview='https://apd-private-status-'+worker+'.apdocentepba.workers.dev';

export function assertAuthorizedPromotion(current, candidate, bindingsA, bindingsB) {
  const result=evaluatePromotionGate(current,candidate,bindingsA,bindingsB);
  if(!result.readyToPromote) throw Error('Release refused by exact code and binding parity gate');
  return true;
}

async function api(token,path,body) {
  const res=await fetch('https://api.cloudflare.com/client/v4'+path,{
    method:body?'POST':'GET',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(17000)
  });
  if(!res.ok)throw Error('Cloudflare API HTTP '+res.status);
  const response=await res.json();
  if(response?.success!==true)throw Error('Cloudflare API rejected request');
  return response.result;
}
async function findAccount(token){
  const accounts=await api(token,'/accounts?per_page=50');
  if(!Array.isArray(accounts)||accounts.length!==1)throw Error('Cloudflare account not unique');
  return String(accounts[0].id);
}
async function getDeployed(token,root){
  const response=await api(token,root+'scripts/'+worker+'/deployments');
  const current=(response?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
  if(current.length!==1||Number(current[0].percentage)!==100||!current[0].version_id){
    throw Error('Live Worker version cannot be identified safely');
  }
  return String(current[0].version_id);
}
async function detail(token,root,id) {
  return await api(token,root+'workers/'+worker+'/versions/'+encodeURIComponent(id)+'?include=modules');
}
function source(version) {
  const module=(version?.modules||[]).find(m=>m.name==='worker_hotfix.js');
  if(typeof module?.content_base64!=='string')throw Error('Worker source not available for byte equality gate');
  return Buffer.from(module.content_base64,'base64').toString('utf8');
}
async function status(base,route){
  const response=await fetch(base+route,{
    method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)
  });
  return response.status;
}
async function smoke(base,requireFixedStatus) {
  const checks=[
    ['/api/version',200],['/api/planes',200],
    ['/api/mi-plan',401],['/api/mis-alertas',401],
    ['/api/account/profile',401],['/api/account/preferences',401]
  ];
  if(requireFixedStatus)for(const channel of ['telegram','whatsapp']){
    checks.push(['/api/'+channel+'/status?user_id=00000000-0000-4000-8000-000000000000',401]);
  }
  for(const [route,expected] of checks){
    const actual=await status(base,route);
    if(actual!==expected)throw Error('HTTP smoke refused: '+route+' returned '+actual+', expected '+expected);
  }
}
async function promote(token,root,version,label) {
  await api(token,root+'scripts/'+worker+'/deployments',{
    strategy:'percentage',versions:[{version_id:version,percentage:100}],
    annotations:{'workers/message':label}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.env.GITHUB_REF_NAME!=='main'||process.env.GITHUB_EVENT_NAME!=='push')
    throw Error('Production release only after merged push to main');
  const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
  if(!token)throw Error('Cloudflare release credentials unavailable');
  const account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim()||await findAccount(token);
  const root='/accounts/'+encodeURIComponent(account)+'/workers/';
  let previous=null,releaseAttempted=false,success=false;
  try {
    previous=await getDeployed(token,root);
    const listed=await api(token,root+'workers/'+worker+'/versions?per_page=50');
    const versions=Array.isArray(listed)?listed:(listed?.versions||[]);
    const uploaded=versions.find(v=>v.annotations?.['workers/tag']===tag);
    if(!uploaded?.id)throw Error('Staged authorization candidate not found');
    const candidateId=String(uploaded.id);
    if(candidateId===previous)throw Error('Candidate already active; use separate verification');
    const [oldDetails,newDetails]=await Promise.all([
      detail(token,root,previous),detail(token,root,candidateId)
    ]);
    assertAuthorizedPromotion(source(oldDetails),source(newDetails),oldDetails.bindings||[],newDetails.bindings||[]);
    if((await getDeployed(token,root))!==previous)throw Error('Production changed during release validation');
    await smoke(preview,true);
    await smoke(host,false);
    // Deploying a version does not change routes or Cron triggers.
    releaseAttempted=true;
    await promote(token,root,candidateId,'APD messaging status Bearer-session privacy fix');
    if((await getDeployed(token,root))!==candidateId)throw Error('Candidate did not reach full deployment');
    await smoke(host,true);
    if((await getDeployed(token,root))!==candidateId)throw Error('Active version changed during smoke');
    success=true;
    console.log('APD_AUTH_STATUS_PRODUCTION_RELEASE_PASS');
    console.log('Telegram and WhatsApp state require sessions. Other Worker functions preserved byte-for-byte.');
    console.log('Existing routes and cron triggers retained; no credential or database mutations.');
  } catch(error) {
    const reason=String(error?.message||error);
    if(releaseAttempted&&previous&&!success){
      console.error('Post-deployment validation did not pass; initiating verified rollback.');
      try{
        await promote(token,root,previous,'Automatic rollback after APD messaging status guard failure');
        if((await getDeployed(token,root))!==previous)throw Error('Rollback did not restore original version');
        await smoke(host,false);
        console.log('APD_WORKER_ROLLBACK_VERIFIED');
      }catch(rollbackError){
        console.error('CRITICAL: rollback verification incomplete; inspect Worker deployments.');
      }
    }
    throw Error('APD release not completed: '+reason);
  }
}
