import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {composeWorkerSnapshot} from './apd-worker-composition.mjs';
const source=readFileSync(new URL('../worker-live/worker_hotfix.js',import.meta.url),'utf8');
test('compose actual historical source, deterministic and syntax valid, never approve deployment',()=>{
 const a=composeWorkerSnapshot(source),b=composeWorkerSnapshot(source);
 assert.equal(a.candidate,b.candidate);
 assert.equal(a.report.length,3);
 assert.equal(a.report[0].inputSha256,a.sourceSha256);
 assert.equal(a.report[2].outputSha256,a.candidateSha256);
 for(let i=1;i<a.report.length;i++)assert.equal(a.report[i].inputSha256,a.report[i-1].outputSha256);
 assert.equal(a.approvedForDeploy,false);
 assert.ok(a.missing.includes('active_schedule_route_not_in_snapshot'));
 for(const name of ['apdSessionIsCurrentAuditV1','apdAbcOfferDeadlineAuditV1','apdChannelAllowedAuditV1','handleAccountCareerSecureV1','apdPublicSessionRowAuditV1']){
  assert.equal(a.candidate.split('function '+name+'(').length,2,name);
 }
 assert.ok(a.candidate.includes('if (path === API_URL_PREFIX3 + "/account/career")'));
 assert.ok(a.candidate.includes('if (path === API_URL_PREFIX3 + "/account/application-diary")'));
 assert.ok(a.candidate.includes('return await handleAccountPreferencesSecureV1(request, env);'));
 assert.throws(()=>composeWorkerSnapshot(a.candidate));
});
test('fail closed on altered session source before generating a candidate',()=>{
 assert.throws(()=>composeWorkerSnapshot(source.replace('if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {','if (false) {')));
});
