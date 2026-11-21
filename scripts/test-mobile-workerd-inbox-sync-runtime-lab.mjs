import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
let mf;
before(async()=>{
 mf=new Miniflare({
  modules:true,compatibilityDate:'2026-07-30',
  scriptPath:fileURLToPath(new URL(
   './fixtures/apd-mobile-inbox-sync-workerd-fixture-lab.mjs',
   import.meta.url
  )),
  modulesRules:[{type:'ESModule',include:['**/*.mjs']}]
 });
 await mf.ready;
});
after(async()=>mf?.dispose());
const A='lab_session_user_a_012345678901234567890';
const B='lab_session_user_b_012345678901234567890';
const ID='11111111-1111-4111-8111-111111111111';
const base='https://example.invalid/api/mobile/inbox';
async function request(path=base,{token=A,method='GET',body}={}){
 const res=await mf.dispatchFetch(path,{
  method,
  headers:{...(token?{Authorization:'Bearer '+token}:{}),
   ...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 return {status:res.status,value:await res.json(),headers:res.headers};
}
test('real workerd isolates paginated account A and account B inbox',async()=>{
 const a=await request(base+'?after=0&limit=2');
 const b=await request(base+'?after=0&limit=20',{token:B});
 assert.equal(a.status,200);
 assert.equal(a.value.nextCursor,2);
 assert.equal(a.value.hasMore,true);
 assert.equal(a.value.events[0].id,'DEMO-AVISO-001');
 assert.equal(a.value.events[1].status,'cancelled');
 assert.equal(b.status,200);
 assert.equal(b.value.events.length,1);
 assert.equal(b.value.events[0].id,'DEMO-AVISO-004');
 assert.equal(a.headers.get('cache-control'),'no-store');
 assert.equal(a.headers.get('vary'),'Authorization');
 for(const text of [ID,A,B,'token_hash','user_id']){
  assert.ok(!JSON.stringify(a.value).includes(text));
  assert.ok(!JSON.stringify(b.value).includes(text));
 }
});
test('real workerd paginates with strict per-user cursor',async()=>{
 const page=await request(base+'?after=2&limit=1');
 assert.equal(page.status,200);
 assert.equal(page.value.fromCursor,2);
 assert.equal(page.value.nextCursor,3);
 assert.equal(page.value.hasMore,false);
 assert.equal(page.value.events[0].id,'DEMO-AVISO-002');
});
test('real workerd confirms read only inside own account and once',async()=>{
 const ack={id:'DEMO-AVISO-002',revision:1};
 const first=await request(base+'/read',{method:'POST',body:ack});
 const second=await request(base+'/read',{method:'POST',body:ack});
 assert.equal(first.status,200);
 assert.equal(first.value.ack.alreadyRead,false);
 assert.equal(first.value.ack.cursor,4);
 assert.equal(second.value.ack.alreadyRead,true);
 assert.equal(second.value.ack.cursor,4);
 const more=await request(base+'?after=3');
 assert.equal(more.value.events.length,1);
 assert.equal(more.value.events[0].kind,'read');
 assert.equal(more.value.events[0].read,true);
 const wrong=await request(base+'/read',{token:B,method:'POST',body:ack});
 assert.equal(wrong.status,404);
});
test('real workerd blocks confirmation on a cancelled event',async()=>{
 const result=await request(base+'/read',{
  method:'POST',body:{id:'DEMO-AVISO-001',revision:2}
 });
 assert.equal(result.status,404);
 const old=await request(base+'/read',{
  method:'POST',body:{id:'DEMO-AVISO-001',revision:1}
 });
 assert.equal(old.status,409);
});
test('real workerd rejects client-selected user and nonexistent bearer',async()=>{
 for(const path of [
  base+'?user_id='+ID,
  base+'?after=4&limit=21',
  base+'?after=4&after=0',
  base+'?after=9999'
 ]){
  assert.equal((await request(path)).status,400);
 }
 assert.equal((await request(base,{token:null})).status,401);
 assert.equal((await request(base,{token:ID})).status,401);
});
