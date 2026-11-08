import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';

let mf;
before(async()=>{
 mf=new Miniflare({
  modules:true,compatibilityDate:'2026-07-30',
  scriptPath:fileURLToPath(new URL(
   './fixtures/apd-mobile-worker-matcher-workerd-fixture-lab.mjs',
   import.meta.url
  )),
  modulesRules:[{type:'ESModule',include:['**/*.mjs']}]
 });
 await mf.ready;
});
after(async()=>{await mf?.dispose();});
async function check(mode,method='GET'){
 const response=await mf.dispatchFetch('http://example.invalid/'+mode,{method});
 return {status:response.status,body:await response.json()};
}
for(const [mode,action,matcher] of [
 ['ready','ready',1],
 ['district','cancel',1],
 ['cargo','cancel',1],
 ['turno','cancel',1],
 ['nivel','cancel',1],
 ['disabled','retry',0],
 ['closed','cancel',0],
 ['expired','cancel',0],
 ['duplicate','retry',0],
 ['source-down','retry',0],
 ['not-found','retry',0]
]){
 test('native workerd actual Worker match rules /'+mode,async()=>{
  const {status,body}=await check(mode);
  assert.equal(status,200);
  assert.equal(body.action,action,mode);
  assert.equal(body.counts.matcher,matcher,mode);
  assert.equal(body.provider_calls,0);
  assert.ok(body.counts.abc>=1&&body.counts.abc<=2);
  for(const sensitive of [
   'AVELLANEDA','PRECEPTOR','SYNTHETIC_OFFLINE',
   '11111111-1111-4111-8111-111111111111'
  ])assert.ok(!JSON.stringify(body).includes(sensitive),sensitive);
 });
}
test('no real provider or arbitrary HTTP lookup is available',async()=>{
 assert.equal((await check('send-real-push')).status,404);
 assert.equal((await check('ready','POST')).status,405);
});
