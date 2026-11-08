import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';

let mf;
before(async()=>{
 mf=new Miniflare({
  modules:true,compatibilityDate:'2026-07-30',
  scriptPath:fileURLToPath(new URL(
   './fixtures/apd-mobile-fullchain-workerd-fixture-lab.mjs',import.meta.url
  )),
  modulesRules:[{type:'ESModule',include:['**/*.mjs']}]
 });
 await mf.ready;
});
after(async()=>{await mf?.dispose();});
async function state(name,method='GET'){
 const response=await mf.dispatchFetch('http://example.invalid/'+name,{method});
 return {status:response.status,result:await response.json()};
}
const scenarios=[
 ['ready',1,0,0,true],
 ['district',0,1,0,true],
 ['cargo',0,1,0,true],
 ['turno',0,1,0,true],
 ['nivel',0,1,0,true],
 ['closed',0,1,0,true],
 ['expired',0,1,0,true],
 ['plan-inactive',0,1,0,true],
 ['plan-stale',0,0,1,true],
 ['plan-other',0,0,1,true],
 ['pref-disabled',0,0,1,true],
 ['source-down',0,0,1,true],
 ['source-missing',0,0,1,true],
 ['source-duplicated',0,0,1,true],
 ['stale-before',0,0,0,true],
 ['stolen-after',0,0,0,true],
 ['device-revoked',0,1,0,true],
 ['revoked-after',0,1,0,true],
 ['device-other',0,0,1,true],
 ['no-auth',0,0,0,false],
 ['wrong-hmac',0,1,0,true],
 ['bad-key',0,0,1,true],
 ['database-down',0,0,0,false],
 ['outbox-duplicate',0,0,0,false],
 ['revocation-cancels-lease',0,0,0,true],
 ['prefs-unscoped',0,0,1,true],
 ['prefs-wrong-user',0,0,1,true],
 ['prefs-bad-type',0,0,1,true],
 ['plan-pending',0,1,0,true],
 ['plan-paused',0,1,0,true],
 ['plan-trial-valid',1,0,0,true],
 ['plan-trial-expired',0,1,0,true],
 ['plan-no-expiry',0,1,0,true],
 ['plan-catalog-disabled',0,1,0,true],
 ['plan-expired',0,1,0,true],
 ['plan-unknown',0,1,0,true],
 ['plan-ambiguous',0,0,1,true],
 ['plan-wrong-user',0,0,1,true],
 ['plan-bad-type',0,0,1,true],
 ['plan-catalog-missing',0,1,0,true],
 ['plan-catalog-other',0,0,1,true],
 ['plan-history-overflow',0,0,1,true],
 ['plan-newer-pending',0,1,0,true],
 ['plan-revoked-after',0,1,0,true],
 ['plan-paused-after',0,1,0,true],
 ['plan-expired-after',0,1,0,true],
 ['plan-catalog-disabled-after',0,1,0,true],
 ['plan-account-down-after',0,0,1,true],
 ['dispatch-denied',0,0,1,true],
 ['dispatch-malformed',0,0,0,false],
 ['dispatch-down',0,0,0,false]
];
for(const [mode,ready,cancelled,retried,ok] of scenarios){
 test('private SQL + ABC + actual APD matcher + WebCrypto /'+mode,async()=>{
  const {status,result:r}=await state(mode);
  assert.equal(status,200);
  assert.equal(r.ok,ok,mode+': ok');
  assert.equal(r.ready||0,ready,mode+': ready');
  assert.equal(r.cancelled||0,cancelled,mode+': cancelled');
  assert.equal(r.retried||0,retried,mode+': retried');
  assert.equal(r.provider_calls,0);
  assert.equal(r.prepared||0,ready,mode+': prepared');
  if(mode==='ready'||mode==='plan-trial-valid')
   assert.equal(r.counts.prepare,1);
  if(mode.startsWith('dispatch-'))
   assert.equal(r.counts.prepare,1);
  if(r.counts.prepare===0)
   assert.equal(r.prepared||0,0);
  assert.equal(r.counts.unauthorizedRequests,0);
  assert.ok(r.counts.abc<=2);
  assert.ok(r.counts.lease<=2);
  assert.ok(r.counts.device<=2);
  // Strict full-chain mode always checks twice after a successful fetch.
  if(ready===1||cancelled===1){
   assert.equal(r.counts.lease,2);
   assert.equal(r.counts.device,2);
  }
  if(mode==='stolen-after'||mode==='revocation-cancels-lease'){
   assert.equal(r.counts.lease,2);
   assert.equal(r.counts.device,1);
   assert.equal(r.counts.retry,1);
  }
  if(mode==='revoked-after'){
   assert.equal(r.counts.device,2);
   assert.equal(r.counts.cancel,1);
  }
  if(mode==='plan-revoked-after'||mode==='plan-paused-after'||
     mode==='plan-expired-after'||mode==='plan-catalog-disabled-after'||
     mode==='plan-account-down-after')
   assert.equal(r.counts.plan,2);
  if(mode==='no-auth'){
   assert.equal(r.reason,'not_authorized');
   assert.equal(r.counts.claim,0);
   assert.equal(r.counts.abc,0);
  }
  if(mode==='database-down'||mode==='outbox-duplicate')
   assert.equal(r.reason,'repository_unavailable');
  if(mode==='dispatch-down'||mode==='dispatch-malformed')
   assert.equal(r.reason,'authorization_storage_unavailable');
  const output=JSON.stringify(r);
  for(const word of [
   'sb_secret_','SYNTHETIC_HMAC_WORKER','SOLR-999',
   'AVELLANEDA','PRECEPTOR','D_123',
   '11111111-1111-4111-8111-111111111111',
   'apdsynthetic123.supabase.co','synthetic_abc_timeout'
  ])assert.ok(!output.includes(word),mode+': '+word);
 });
}
test('fixture rejects any operational sender route or unsupported method',async()=>{
 assert.equal((await state('send-real-push')).status,404);
 assert.equal((await state('ready','POST')).status,405);
});
