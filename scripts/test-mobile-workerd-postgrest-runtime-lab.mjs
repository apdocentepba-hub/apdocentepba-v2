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
   './fixtures/apd-mobile-postgrest-workerd-fixture-lab.mjs',import.meta.url
  )),
  modulesRules:[{type:'ESModule',include:['**/*.mjs']}]
 });
 await mf.ready;
});
after(async()=>{if(mf)await mf.dispose();});
async function get(mode,method='GET'){
 const response=await mf.dispatchFetch('http://example.invalid/'+mode,{method});
 return {status:response.status,data:await response.json()};
}
for(const [mode,fields,count] of [
 ['ready',{ok:true,ready:1,cancelled:0,retried:0},3],
 ['closed',{ok:true,ready:0,cancelled:1,retried:0},4],
 ['revoked',{ok:true,ready:0,cancelled:1,retried:0},4],
 ['stale-plan',{ok:true,ready:0,cancelled:0,retried:1},4],
 ['source-down',{ok:true,ready:0,cancelled:0,retried:1},4],
 ['db-down',{ok:false,reason:'repository_unavailable'},1],
 ['lease-expired',{ok:true,ready:0,cancelled:0,retried:0},3],
 ['unauthorized',{ok:false,reason:'not_authorized'},0],
 ['redirect',{ok:false,reason:'repository_unavailable'},1],
 ['wrong-device',{ok:true,ready:0,cancelled:0,retried:1},4]
]){
 test('workerd private PostgREST adapter /'+mode,async()=>{
  const r=await get(mode);
  assert.equal(r.status,200);
  for(const [key,value] of Object.entries(fields))
   assert.equal(r.data[key],value,mode+': '+key);
  assert.equal(r.data.request_count,count);
  assert.equal(r.data.provider_calls,0);
  const result=JSON.stringify(r.data);
  for(const secret of ['sb_secret_','PRIVATE_NETWORK_UNAVAILABLE',
   'ABC_PRIVATE_TIMEOUT','FAKE_SERVER_ONLY_SECRET',
   '11111111-1111-4111-8111-111111111111',
   'apdsynthetic123.supabase.co'])
   assert.equal(result.includes(secret),false);
 });
}
test('workerd mock denies arbitrary routes and mutation requests',async()=>{
 assert.equal((await get('send/live')).status,404);
 assert.equal((await get('ready','POST')).status,405);
});
