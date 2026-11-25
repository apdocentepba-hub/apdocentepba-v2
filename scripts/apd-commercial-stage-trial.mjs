// In-memory integration candidate; never executes the production module.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {claimCompleteTrial} from './apd-commercial-trial-adapter.mjs';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const supported=new Set(['ensureTrialIfNoSubscriptions','ensureTrialIfNoSubscriptions2']);
export function stageTrialHelpers(source){
 const declarations=[...source.matchAll(/^async function (ensureTrialIfNoSubscriptions\w*)\([^\n]*\) \{/gm)];
 assert.ok(declarations.length>0,'No trial helpers');
 assert.equal(new Set(declarations.map(m=>m[1])).size,declarations.length,'Duplicate helper');
 assert.ok(declarations.every(m=>supported.has(m[1])),'Unexpected helper variant; inspect first');
 const replacements=[];
 for(const m of declarations){
  const start=m.index,end=source.indexOf('\n__name('+m[1]+',',start);
  assert.ok(end>start,'Unverified function boundary');
  const old=source.slice(start,end);
  assert.match(old,/\bTRIAL_7D\b/);
  assert.match(old,/user_subscriptions/);
  assert.ok(old.endsWith('\n}'),'Unexpected closing boundary');
  const fresh='async function '+m[1]+'(env, userId, email, source) {\n  return await apdClaimCompleteTrialV1(env,userId);\n}';
  replacements.push({name:m[1],old,fresh});
 }
 assert.ok(!source.includes('apdClaimCompleteTrialV1'),'Candidate already inserted');
 const implementation=claimCompleteTrial.toString().replace(/^async function claimCompleteTrial\(/,'async function apdClaimCompleteTrialV1(');
 assert.match(implementation,/^async function apdClaimCompleteTrialV1\(/);
 const prefix=implementation+'\n';
 let candidate=source;
 for(const r of replacements)candidate=candidate.replace(r.old,()=>r.fresh);
 candidate=prefix+candidate;
 let reversed=candidate.slice(prefix.length);
 for(const r of replacements)reversed=reversed.replace(r.fresh,()=>r.old);
 assert.equal(reversed,source,'Unrelated bytes changed');
 // Only check syntax, never import or run captured production code.
 return {candidate,helpers:replacements.map(r=>r.name),unrelatedBytesPreserved:true};
}
export function verifyTrialCandidateSyntax(candidate){
 const dir=mkdtempSync(path.join(tmpdir(),'apd-commercial-'));
 try{
  const file=path.join(dir,'candidate.mjs');
  fs.writeFileSync(file,candidate,{mode:0o600});
  const check=spawnSync(process.execPath,['--check',file],{stdio:'ignore'});
  assert.equal(check.status,0,'Candidate syntax invalid');
 }finally{rmSync(dir,{recursive:true,force:true});}
}
export function assertObservedFingerprint(bytes,report,expected){
 assert.equal(report.version,expected.observed_active_version,'Active version drift');
 assert.equal(report.module,expected.module,'Entrypoint drift');
 assert.equal(bytes.length,expected.bytes,'Byte count drift');
 assert.equal(digest(bytes),expected.sha256,'SHA256 drift');
 assert.equal(report.binding_count,expected.bindings,'Binding count drift');
}
