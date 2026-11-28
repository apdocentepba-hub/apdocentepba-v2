// Read-only candidate compatibility report. No uploads, artifacts, writes or secrets in output.
// Run live only in an already authorized private operator environment; never in PR CI with secrets.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {inspectVersion,inspectCrons,activeVersion} from './apd-commercial-live-preflight.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
import {stageAbcExpiryAudit} from './apd-abc-expiry-audit-stage.mjs';
import {stageEmailDeliveryAudit} from './apd-email-delivery-audit-stage.mjs';
import {stageChannelQueryAudit} from './apd-channel-query-audit-stage.mjs';
import {stageChannelEntitlementAudit} from './apd-channel-entitlement-audit-stage.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function assessCompatibility(source){
 const stages=[['expiry',stageAbcExpiryAudit],['email',stageEmailDeliveryAudit],['channel',stageChannelQueryAudit],['entitlement',stageChannelEntitlementAudit]];
 const results=[];
 // Each stage already composes predecessors; never apply twice.
 for(const [name,stage] of stages){
  try{
   const r=stage(source);
   verifyTrialCandidateSyntax(r.candidate);
   if(r.deployable!==false||r.unrelatedBytesPreserved!==true)throw Error('Unverified candidate');
   results.push({name,status:'anchor_and_syntax_pass',candidateSha256:hash(r.candidate)});
  }catch{
   // Assertion errors can contain full module source; deliberately do not print them.
   results.push({name,status:'blocked_source_drift_or_syntax'});
  }
 }
 return {sourceSha256:hash(source),results,approvedForDeploy:false,sourceExported:false};
}
async function main(){
 if(process.argv.includes('--snapshot-only')){
  const source=fs.readFileSync('worker-live/worker_hotfix.js','utf8');
  const report=assessCompatibility(source);
  console.log('APD_AUDIT_COMPATIBILITY '+JSON.stringify({...report,mode:'historical_snapshot',writes:0}));
  if(report.results.some(r=>r.status!=='anchor_and_syntax_pass'))process.exitCode=1;
  return;
 }
 if(!process.argv.includes('--live-get-only')||process.env.APD_AUDIT_READ_ACK!=='READ_ACTIVE_APD_NO_WRITE')throw Error('Explicit read-only operator acknowledgement required');
 const token=process.env.CLOUDFLARE_API_TOKEN;
 if(!token)throw Error('Cloudflare credential missing');
 const get=async endpoint=>{
  const r=await fetch('https://api.cloudflare.com/client/v4'+endpoint,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Cloudflare GET failed');
  const j=await r.json();if(j.success!==true)throw Error('Cloudflare response rejected');
  return j.result;
 };
 const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
 const worker='ancient-wildflower-cd37';
 if(manifest.worker_name!==worker)throw Error('Wrong Worker');
 const accounts=await get('/accounts?per_page=50');
 const id=process.env.CLOUDFLARE_ACCOUNT_ID||(accounts.length===1?accounts[0].id:'');
 if(!id||!accounts.some(a=>a.id===id))throw Error('Account not verified');
 const root='/accounts/'+encodeURIComponent(id)+'/workers/';
 const route=root+'scripts/'+worker+'/deployments';
 const version=activeVersion(await get(route));
 const details=await get(root+'workers/'+worker+'/versions/'+encodeURIComponent(version)+'?include=modules');
 const info=inspectVersion(details,version,manifest);
 const crons=inspectCrons(await get(root+'scripts/'+worker+'/schedules'));
 const report=assessCompatibility(Buffer.from(details.modules[0].content_base64,'base64').toString('utf8'));
 if(activeVersion(await get(route))!==version)throw Error('Active version changed');
 if(report.sourceSha256!==info.sha256)throw Error('Source fingerprint mismatch');
 console.log('APD_AUDIT_COMPATIBILITY '+JSON.stringify({...report,mode:'active_get_only',version,bindings:info.binding_count,cronCount:crons.length,writes:0}));
 if(report.results.some(r=>r.status!=='anchor_and_syntax_pass'))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('APD_AUDIT_COMPATIBILITY_BLOCKED (sanitized)');process.exitCode=1;});
