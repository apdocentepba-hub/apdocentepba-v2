import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';

let mf;
before(async()=>{
 mf=new Miniflare({
  modules:true,compatibilityDate:'2026-07-30',
  scriptPath:fileURLToPath(new URL(
   './fixtures/apd-mobile-abc-workerd-fixture-lab.mjs',import.meta.url)),
  modulesRules:[{type:'ESModule',include:['**/*.mjs']}]
 });
 await mf.ready;
});
after(async()=>{await mf?.dispose();});
async function read(mode,method='GET'){
 const res=await mf.dispatchFetch('http://example.invalid/'+mode,{method});
 return {status:res.status,result:await res.json()};
}
for(const [mode,state,sourceCount,matched] of [
 ['ready','ready',1,1],
 ['closed','cancel',1,0],
 ['expired','cancel',1,0],
 ['unknown','unknown',2,0],
 ['ambiguous','retry',1,0],
 ['wrong-key','retry',1,0],
 ['outage','retry',1,0],
 ['match-no','cancel',1,1],
 ['preferences-off','unknown',1,0],
 ['fallback','ready',2,1],
 ['bad-date','unknown',1,0]
]){
 test('workerd authoritative ABC snapshot /'+mode,async()=>{
  const {status,result}=await read(mode);
  assert.equal(status,200);
  assert.equal(result.state,state,mode);
  assert.equal(result.provider_calls,0);
  assert.equal(result.counts.source,sourceCount);
  assert.equal(result.counts.matcher,matched);
  const output=JSON.stringify(result);
  for(const marker of [
   '11111111-1111-4111-8111-111111111111',
   'apd.oferta.encabezado','PRECEPTOR',
   'FICTIONAL_ABC_IS_DOWN','SOLR-123','D_123'
  ])assert.ok(!output.includes(marker),marker);
 });
}
test('workerd ABC fixture has no generic lookup or POST endpoint',async()=>{
 assert.equal((await read('send-real-push')).status,404);
 assert.equal((await read('ready','POST')).status,405);
});
