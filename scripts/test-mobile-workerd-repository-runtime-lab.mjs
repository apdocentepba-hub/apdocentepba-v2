import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';

let mf;
before(async()=>{
 mf=new Miniflare({
  modules:true,
  compatibilityDate:'2026-07-30',
  scriptPath:fileURLToPath(new URL(
   './fixtures/apd-mobile-repository-workerd-fixture-lab.mjs',import.meta.url
  )),
  modulesRules:[{type:'ESModule',include:['**/*.mjs']}]
 });
 await mf.ready;
});
after(async()=>{await mf?.dispose();});
async function check(mode){
 const response=await mf.dispatchFetch('http://example.invalid/'+mode);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 return response.json();
}
for(const [mode,expected] of [
 ['ready',{ok:true,ready:1,cancelled:0,retried:0}],
 ['expired',{ok:true,ready:0,cancelled:1,retried:0}],
 ['closed',{ok:true,ready:0,cancelled:1,retried:0}],
 ['revoked',{ok:true,ready:0,cancelled:1,retried:0}],
 ['inactive',{ok:true,ready:0,cancelled:1,retried:0}],
 ['stale',{ok:true,ready:0,cancelled:0,retried:1}],
 ['offline',{ok:true,ready:0,cancelled:0,retried:1}],
 ['plan-down',{ok:true,ready:0,cancelled:0,retried:1}],
 ['lease-expired',{ok:true,ready:0,cancelled:0,retried:0}],
 ['cross-account',{ok:true,ready:0,cancelled:1,retried:0}],
 ['unauthorized',{ok:false,reason:'not_authorized'}]
]){
 test('workerd SQL + ABC repository: '+mode,async()=>{
  const response=await check(mode);
  for(const [key,value] of Object.entries(expected))
   assert.equal(response[key],value,key);
  assert.equal(response.provider_calls,0);
  if(mode==='unauthorized'){
   assert.equal(response.counts.claim,0);
   assert.equal(response.counts.lease,0);
  }else{
   assert.equal(response.counts.claim,1);
   assert.equal(response.counts.lease,1);
   assert.equal(response.counts.device,
    mode==='lease-expired'?0:1);
  }
 });
}
test('response never contains tokens, offer keys or personal data',async()=>{
 const response=await check('ready');
 const result=JSON.stringify(response);
 for(const word of [
  'token_ciphertext','PRIVATE_ONLY_FIXTURE_DO_NOT_RETURN',
  'APD:LAB:SOURCE:456','FAKE_SERVER_ONLY_SECRET',
  '11111111-1111-4111-8111-111111111111'
 ])assert.ok(!result.includes(word));
});
test('the synthetic repository fixture has no arbitrary API or sender route',async()=>{
 const missing=await mf.dispatchFetch('http://example.invalid/send');
 assert.equal(missing.status,404);
 const method=await mf.dispatchFetch('http://example.invalid/ready',{method:'POST'});
 assert.equal(method.status,405);
});
