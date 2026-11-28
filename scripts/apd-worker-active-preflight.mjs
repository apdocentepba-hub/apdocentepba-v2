/** Private operator preflight. GET only, no source/binding values in logs, no deploy. */
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {inspectVersion,inspectCrons,activeVersion} from './apd-commercial-live-preflight.mjs';
import {composeWorkerSnapshot} from './apd-worker-composition.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const required=['/account/profile','/account/preferences','/account/marketing-preferences','/account/schedule','/account/application-diary','/account/favorites','/mi-plan','/mis-alertas','/mercadopago/create-checkout-link'];
export function verifyRouteInventory(before,after){
 const count=(source,key)=>source.split(key).length-1;
 const absent=required.filter(key=>count(before,key)===0);
 const changed=required.filter(key=>count(before,key)!==count(after,key));
 if(absent.length||changed.length)throw Error('Required route inventory drift');
 if(count(before,'/account/career')!==0||count(after,'/account/career')<1)throw Error('Career route inventory drift');
 return required.length;
}
export function verifyTemporaryRecovery(bytes,expectedSha){
 assert.equal(sha(bytes),expectedSha);
 const dir=mkdtempSync(join(tmpdir(),'apd-worker-recovery-'));
 try{
  const backup=join(dir,'original.mjs'),restored=join(dir,'restored.mjs');
  writeFileSync(backup,bytes,{mode:0o600,flag:'wx'});
  const recovered=readFileSync(backup);assert.equal(sha(recovered),expectedSha);
  writeFileSync(restored,recovered,{mode:0o600,flag:'wx'});
  assert.ok(readFileSync(restored).equals(bytes));
  verifyTrialCandidateSyntax(recovered.toString('utf8'));
  return {temporaryReadback:true,localRestore:true,persistentBackup:false,remoteRollbackTested:false};
 }finally{rmSync(dir,{recursive:true,force:true});}
}
export async function inspectActiveComposition({get,manifest,accountId,compose=composeWorkerSnapshot}){
 const worker='ancient-wildflower-cd37';
 if(manifest.worker_name!==worker)throw Error('Wrong Worker');
 const accounts=await get('/accounts?per_page=50');
 if(!Array.isArray(accounts))throw Error('Invalid account list');
 const id=accountId||(accounts.length===1?accounts[0].id:'');
 if(!id||!accounts.some(a=>a.id===id))throw Error('Account not verified');
 const root='/accounts/'+encodeURIComponent(id)+'/workers/';
 const route=root+'scripts/'+worker+'/deployments';
 const scheduleRoute=root+'scripts/'+worker+'/schedules';
 const version=activeVersion(await get(route));
 const details=await get(root+'workers/'+worker+'/versions/'+encodeURIComponent(version)+'?include=modules');
 const info=inspectVersion(details,version,manifest);
 const crons=inspectCrons(await get(scheduleRoute));
 const bytes=Buffer.from(details.modules[0].content_base64,'base64'),source=bytes.toString('utf8');
 if(!Buffer.from(source,'utf8').equals(bytes)||sha(bytes)!==info.sha256)throw Error('Source encoding or digest drift');
 // Only the three audited stages; no commercial re-staging or database operation.
 const r=compose(source);
 if(r.approvedForDeploy!==false||r.sourceSha256!==info.sha256||r.missing.length||sha(r.candidate)!==r.candidateSha256)throw Error('Composition incompatible');
 const routes=verifyRouteInventory(source,r.candidate);
 const recovery=verifyTemporaryRecovery(bytes,info.sha256);
 if(activeVersion(await get(route))!==version)throw Error('Version changed during inspection');
 if(JSON.stringify(inspectCrons(await get(scheduleRoute)))!==JSON.stringify(crons))throw Error('Cron drift during inspection');
 return {version,rollbackVersion:version,sourceSha256:info.sha256,candidateSha256:r.candidateSha256,bindings:info.binding_count,cronCount:crons.length,routeInventory:routes,...recovery,sourceExported:false,approvedForDeploy:false,writes:0};
}
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--live-get-only'||process.env.APD_AUDIT_READ_ACK!=='READ_ACTIVE_APD_NO_WRITE')throw Error('Explicit operator acknowledgement required');
 const token=process.env.CLOUDFLARE_API_TOKEN;
 if(!token)throw Error('Credential unavailable');
 const get=async endpoint=>{
  const response=await fetch('https://api.cloudflare.com/client/v4'+endpoint,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Cloudflare GET rejected');
  const j=await response.json();if(j.success!==true)throw Error('Cloudflare response rejected');return j.result;
 };
 const report=await inspectActiveComposition({get,manifest:JSON.parse(readFileSync('worker-live/manifest.json','utf8')),accountId:process.env.CLOUDFLARE_ACCOUNT_ID});
 console.log('APD_ACTIVE_COMPOSITION_PREFLIGHT '+JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('APD_ACTIVE_COMPOSITION_BLOCKED (sanitized)');process.exitCode=1;});
