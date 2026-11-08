/**
 * Full workerd runtime compatibility QA. The fixture is synthetic and
 * executes in a local Miniflare process, NEVER on Cloudflare production.
 * Only node:test's assertions run in Node; the evaluated gate runs in workerd.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';

let mf;
before(async()=>{
 mf=new Miniflare({
  modules:true,
  compatibilityDate:'2026-07-30',
  scriptPath:fileURLToPath(new URL('./fixtures/apd-mobile-workerd-fixture-lab.mjs',import.meta.url)),
  modulesRules:[{type:'ESModule',include:['**/*.mjs']}],
 });
 await mf.ready;
});
after(async()=>{if(mf)await mf.dispose();});

async function request(path,method='GET'){
 const response=await mf.dispatchFetch('http://example.invalid/'+path,{
  method,headers:{'Accept':'application/json'}
 });
 const data=await response.json();
 return {status:response.status,headers:response.headers,data};
}
for(const [mode,action,reason] of [
 ['ready','ready','all_current_checks_passed'],
 ['expired','cancel','offer_already_expired'],
 ['closed','cancel','offer_not_eligible'],
 ['revoked','cancel','device_unsubscribed_or_revoked'],
 ['stale-plan','retry','plan_verification_stale_or_unknown'],
 ['forged-hmac','cancel','event_hmac_mismatch'],
 ['mismatch-user','cancel','sql_claim_context_mismatch'],
 ['missing-context','retry','context_unavailable'],
 ['missing-secret','retry','crypto_or_configuration_unavailable'],
 ['mismatch-transport','cancel','device_ownership_or_transport_mismatch'],
 ['unavailable','retry','context_unavailable']
]){
 test('workerd preflight /case/'+mode,async()=>{
  const r=await request('case/'+mode);
  assert.equal(r.status,200);
  assert.deepEqual(r.data,{action,reason});
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 });
}
for(const [mode,fields] of [
 ['ready',{ok:true,ready:1,cancelled:0,retried:0}],
 ['expired',{ok:true,ready:0,cancelled:1,retried:0}],
 ['closed',{ok:true,ready:0,cancelled:1,retried:0}],
 ['revoked',{ok:true,ready:0,cancelled:1,retried:0}],
 ['stale-plan',{ok:true,ready:0,cancelled:0,retried:1}],
 ['unavailable',{ok:true,ready:0,cancelled:0,retried:1}],
 ['missing-context',{ok:true,ready:0,cancelled:0,retried:1}],
 ['missing-secret',{ok:true,ready:0,cancelled:0,retried:1}],
 ['forged-hmac',{ok:true,ready:0,cancelled:1,retried:0}],
 ['unauthorized',{ok:false,reason:'not_authorized'}]
]){
 test('workerd scheduler /dryrun/'+mode,async()=>{
  const r=await request('dryrun/'+mode);
  assert.equal(r.status,200);
  for(const [field,value] of Object.entries(fields))
   assert.equal(r.data[field],value,field);
  assert.equal(r.data.provider_calls,0);
  if(mode==='unauthorized'){
   assert.equal(r.data.counters.claims,0);
   assert.equal(r.data.counters.lookups,0);
  }else{
   assert.equal(r.data.counters.claims,1);
   assert.equal(r.data.counters.lookups,1);
  }
 });
}
test('workerd fixture rejects unknown routes and non-GET requests',async()=>{
 assert.equal((await request('send/live')).status,404);
 assert.equal((await request('case/ready','POST')).status,405);
});
test('workerd does not expose push token, user ID or HMAC secret to callers',async()=>{
 const r=await request('dryrun/ready');
 const encoded=JSON.stringify(r.data);
 for(const sensitive of [
  '11111111-1111-4111-8111-111111111111',
  'FAKE_SERVER_ONLY_SECRET_FOR_TESTS_DO_NOT_REUSE_123456789',
  'ExpoPushToken[','source_offer_key','token_ciphertext'
 ])assert.ok(!encoded.includes(sensitive),sensitive);
});
