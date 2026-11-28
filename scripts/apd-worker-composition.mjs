/** Offline only. Never import or run the captured Worker, never access Cloudflare. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {stageSessionAdminAudit} from './apd-session-admin-audit-stage.mjs';
import {stageChannelEntitlementAudit} from './apd-channel-entitlement-audit-stage.mjs';
import {buildCareerWorkerCandidate} from './build-apd-career-worker-candidate.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function composeWorkerSnapshot(source){
 const stages=[['session_admin',stageSessionAdminAudit],['expiry_email_channels',stageChannelEntitlementAudit],['career_routes',buildCareerWorkerCandidate]];
 let candidate=source;const report=[];
 for(const [name,stage] of stages){
  const result=stage(candidate);
  assert.ok(result.unrelatedBytesPreserved===true&&result.deployable===false,'Stage contract');
  assert.ok(typeof result.candidate==='string'&&result.candidate!==candidate,'No change');
  verifyTrialCandidateSyntax(result.candidate);
  report.push({name,inputSha256:sha(candidate),outputSha256:sha(result.candidate)});
  candidate=result.candidate;
 }
 // Presence alone is not an authenticated functional test.
 const missing=[];
 if(!source.includes('/account/schedule'))missing.push('active_schedule_route_not_in_snapshot');
 if(!source.includes('/account/application-diary'))missing.push('active_diary_route_not_in_snapshot');
 return {candidate,report,sourceSha256:sha(source),candidateSha256:sha(candidate),missing,approvedForDeploy:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3||process.argv[2]!=='--snapshot-only')throw Error('Offline snapshot only');
  const {candidate,...report}=composeWorkerSnapshot(readFileSync('worker-live/worker_hotfix.js','utf8'));
  console.log('APD_WORKER_COMPOSITION '+JSON.stringify({...report,writes:0,sourceExported:false}));
 }catch{console.error('APD_WORKER_COMPOSITION_BLOCKED (sanitized)');process.exitCode=1;}
}
