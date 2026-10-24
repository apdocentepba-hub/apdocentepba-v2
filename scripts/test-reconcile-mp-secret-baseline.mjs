import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {reconcileManifest} from './reconcile-mp-secret-baseline.mjs';
const source=Buffer.from('mock-production-worker-bytes');
const hash=crypto.createHash('sha256').update(source).digest('hex');
const snapshot={
 worker_name:'synthetic-worker',version_id:'previous-cf-version',main_module:'worker_hotfix.js',
 modules:[{name:'worker_hotfix.js',sha256:hash,bytes:source.length}],
 bindings:[{name:'MERCADOPAGO_ACCESS_TOKEN',type:'secret_text'},
 {name:'MERCADOPAGO_WEBHOOK_URL',type:'plain_text'},
 {name:'EMAIL_SWEEP_STATE',type:'kv_namespace',namespace_id:'correct-private-namespace'}],
 schedules:['0 01 * * *']
};
const rollout={deployments:[{versions:[{version_id:'new-cf-version',percentage:100}]}]};
function remote({changedSource=false,missingSecret=false,wrongKv=false,unexpectedBinding=false,missingCode=false}={}) {
 return {
  modules:missingCode?[]:[{name:'worker_hotfix.js',content_base64:(changedSource?Buffer.from('other'):source).toString('base64')}],
  bindings:[{name:'MERCADOPAGO_ACCESS_TOKEN',type:'secret_text'},
   {name:'MERCADOPAGO_WEBHOOK_URL',type:'plain_text'},
   {name:'EMAIL_SWEEP_STATE',type:'kv_namespace',namespace_id:wrongKv?'other':'correct-private-namespace'},
   ...(!missingSecret?[{name:'MERCADOPAGO_WEBHOOK_SECRET',type:'secret_text'}]:[]),
   ...(unexpectedBinding?[{name:'UNEXPECTED',type:'plain_text'}]:[])]
 };
}
test('secret-only deploy preserves Worker code, bindings and schedule',()=>{
 const before=structuredClone(snapshot);
 const next=reconcileManifest(snapshot,rollout,remote(),new Date('2026-10-24T14:00:00Z'));
 assert.equal(next.version_id,'new-cf-version');
 assert.equal(next.bindings.length,snapshot.bindings.length+1);
 assert.deepEqual(next.modules,snapshot.modules);
 assert.deepEqual(next.schedules,snapshot.schedules);
 assert.deepEqual(snapshot,before);
});
test('different bytes or missing module fail closed',()=>{
 assert.throws(()=>reconcileManifest(snapshot,rollout,remote({changedSource:true})),/code differs/);
 assert.throws(()=>reconcileManifest(snapshot,rollout,remote({missingCode:true})),/live bytes/);
});
test('missing secret and unrelated additions fail closed',()=>{
 assert.throws(()=>reconcileManifest(snapshot,rollout,remote({missingSecret:true})),/Missing expected webhook/);
 assert.throws(()=>reconcileManifest(snapshot,rollout,remote({unexpectedBinding:true})),/Unexpected binding/);
});
test('missing bindings and changed namespace fail closed',()=>{
 assert.throws(()=>reconcileManifest(snapshot,rollout,remote({wrongKv:true})),/KV namespace changed/);
 const d=remote();d.bindings=d.bindings.filter(b=>b.name!=='MERCADOPAGO_ACCESS_TOKEN');
 assert.throws(()=>reconcileManifest(snapshot,rollout,d),/binding disappeared/);
});
test('mixed traffic cannot be reconciled',()=>{
 assert.throws(()=>reconcileManifest(snapshot,{deployments:[{versions:[{version_id:'x',percentage:50},{version_id:'y',percentage:50}]}]},remote()),/single version/);
});
