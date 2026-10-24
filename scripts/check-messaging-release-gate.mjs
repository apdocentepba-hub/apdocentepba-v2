// Read-only release gate for the already staged live-based messaging auth candidate.
// No promotion, checkout actions, emails, remote writes or source/secret logging.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {hardenMessagingStatus} from './create-messaging-status-auth-candidate.mjs';
import {compareWorkerModules} from './audit-apd-worker-drift.mjs';
const worker='ancient-wildflower-cd37';
const tag='apd-msg-auth-a3098c3a';

export function evaluatePromotionGate(live,candidate,liveBindings,candidateBindings) {
  const expected=hardenMessagingStatus(live);
  const exactPatch=candidate===expected;
  const diff=compareWorkerModules(Buffer.from(live),Buffer.from(candidate));
  const changedOnlyTwo=JSON.stringify([...diff.functionsChanged].sort())===
     JSON.stringify(['handleTelegramStatus','handleWhatsAppStatus'].sort()) && diff.functionsMissing.length===0;
  const oldMap=new Map(liveBindings.map(v=>[v.name+':'+v.type,v]));
  const newMap=new Map(candidateBindings.map(v=>[v.name+':'+v.type,v]));
  let bindingsRetained=oldMap.size===newMap.size && liveBindings.length===candidateBindings.length;
  let scalarValuesRetained=true;
  for(const [key,old] of oldMap) {
    const next=newMap.get(key);
    if(!next){bindingsRetained=false;continue;}
    if(old.type==='kv_namespace' && String(old.namespace_id||old.id||'')!==String(next.namespace_id||next.id||''))bindingsRetained=false;
    if(old.type==='plain_text' && String(old.text??old.value??'')!==String(next.text??next.value??''))scalarValuesRetained=false;
  }
  const noUnsafeStatusFallback=diff.telegramStatusUnsafeIdFallback===false&&diff.whatsappStatusUnsafeIdFallback===false;
  return {exactPatch,changedOnlyTwo,bindingsRetained,scalarValuesRetained,noUnsafeStatusFallback,
    readyToPromote:exactPatch&&changedOnlyTwo&&bindingsRetained&&scalarValuesRetained&&noUnsafeStatusFallback};
}
async function get(path,token) {
 const res=await fetch('https://api.cloudflare.com/client/v4'+path,{
   method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('Cloudflare metadata HTTP '+res.status);
 const j=await res.json();
 if(j?.success!==true)throw Error('Cloudflare metadata request failed');
 return j.result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const token=String(process.env.CLOUDFLARE_API_TOKEN||'');
 if(!token)throw Error('No Cloudflare read-only credential available');
 let account=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
 if(!account){
   const list=await get('/accounts?per_page=50',token);
   if(!Array.isArray(list)||list.length!==1)throw Error('Account not uniquely identifiable');
   account=String(list[0].id);
 }
 const base='/accounts/'+encodeURIComponent(account)+'/workers/';
 const deployments=await get(base+'scripts/'+worker+'/deployments',token);
 const liveVersions=(deployments?.deployments?.[0]?.versions||[]).filter(v=>Number(v.percentage)>0);
 if(liveVersions.length!==1||Number(liveVersions[0].percentage)!==100)
   throw Error('Production not on one verified version');
 const ids=await get(base+'workers/'+worker+'/versions?per_page=50',token);
 const versions=Array.isArray(ids)?ids:(ids?.versions||[]);
 const staged=versions.find(v=>v.annotations?.['workers/tag']===tag);
 if(!staged?.id)throw Error('Expected staged candidate not present');
 const getVersion=async id=>await get(base+'workers/'+worker+'/versions/'+encodeURIComponent(id)+'?include=modules',token);
 const [active,candidate]=await Promise.all([getVersion(liveVersions[0].version_id),getVersion(staged.id)]);
 const codeOf=detail=>{
   const m=(detail?.modules||[]).find(x=>x.name==='worker_hotfix.js');
   if(typeof m?.content_base64!=='string')throw Error('Required module unavailable');
   return Buffer.from(m.content_base64,'base64').toString('utf8');
 };
 const report=evaluatePromotionGate(codeOf(active),codeOf(candidate),active.bindings||[],candidate.bindings||[]);
 // Never print code, hashes, secret/variable values or payment data.
 console.log('APD_MESSAGING_RELEASE_GATE '+JSON.stringify(report));
 if(!report.readyToPromote)console.log('Deployment BLOCKED by strict source/binding parity gate.');
}
