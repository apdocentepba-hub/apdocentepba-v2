import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {verifyKnownApprovedWorker} from './verify-apd-approved-worker-20261112.mjs';
const code=Buffer.from('getSessionUserByBearer handleAccountHomeSecureV1 handleAccountProfileSecureV1 handleAccountPreferencesSecureV1');
const sha=crypto.createHash('sha256').update(code).digest('hex');
const bindings=Array.from({length:29},(_,i)=>({
 name:'TEST_BINDING_'+i,
 type:i===2?'kv_namespace':'plain_text',
 ...(i===2?{namespace_id:'synthetic-safe'}:{})
}));
const expected={
 worker:'synthetic-worker',
 active_version:'synthetic-approved',
 module:{name:'bundle.js',bytes:code.length,sha256:sha},
 expected_binding_count:29
};
const canonical={bindings:structuredClone(bindings)};
const capture={
 worker_name:'synthetic-worker',version_id:'synthetic-approved',main_module:'bundle.js',
 modules:[{name:'bundle.js',module_sha256:sha}],bindings:structuredClone(bindings)
};
const verify=(m=capture,bytes=code,base=canonical)=>verifyKnownApprovedWorker(m,base,bytes,expected);
test('exact attested Worker source + identity + all binding types accepted',()=>{
 const result=verify();
 assert.equal(result.approved,true);
 assert.equal(result.bindings,29);
});
test('unknown deploy version and changed module name fail closed',()=>{
 assert.throws(()=>verify({...capture,version_id:'another'}),/version/i);
 assert.throws(()=>verify({...capture,main_module:'stale.js'}),/entrypoint/i);
 assert.throws(()=>verify({...capture,modules:[{name:'different.js',module_sha256:sha}]}),/Module name/i);
});
test('a single changed source byte fails SHA even when length and metadata are correct',()=>{
 const changed=Buffer.from(code);changed[3]^=1;
 assert.throws(()=>verify(capture,changed),/SHA256/i);
});
test('missing or retyped bindings and wrong KV namespace fail closed',()=>{
 assert.throws(()=>verify({...capture,bindings:bindings.slice(0,28)}),/bindings/i);
 const wrong=structuredClone(bindings);wrong[0].type='secret_text';
 assert.throws(()=>verify({...capture,bindings:wrong}),/retyped/i);
 const kv=structuredClone(bindings);kv[2].namespace_id='wrong';
 assert.throws(()=>verify({...capture,bindings:kv}),/namespace/i);
});
test('a captured binding with value or content is blocked from attestation',()=>{
 const injected=structuredClone(bindings);injected[0].value='fake-private-value';
 assert.throws(()=>verify({...capture,bindings:injected}),/SECRET LEAK/);
});
