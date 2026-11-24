import test from 'node:test';
import assert from 'node:assert/strict';
import {accountFavoritesRequest as handle,validateFavoriteRow,validateFavoriteMutation} from './apd-account-favorites-core.mjs';
const req=(method='GET',token='A',body)=>new Request('https://fixture.invalid/api/account/favorites',{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
function fixture(){
 const rows=new Map();let writes=0;
 const deps={
  authenticate:async r=>{const t=r.headers.get('authorization');return ['Bearer A','Bearer B','Bearer E'].includes(t)?{id:t.slice(-1)}:null;},
  entitled:async id=>id!=='E',
  read:async id=>rows.get(id)||null,
  resolveOffer:async key=>key==='missing'?null:{key,status:key==='closed'?'closed':key==='unknown'?'unknown':'open'},
  compareAndSet:async(id,p)=>{const old=rows.get(id);if((old?.revision||0)!==p.revision)return null;writes++;const next={keys:p.keys,revision:p.revision+1};rows.set(id,next);return next;}
 };
 return {deps,rows,writes:()=>writes};
}
const put=(action,key,revision,token='A')=>req('PUT',token,{action,key,revision});
test('authentication and owner isolation; persisted readback',async()=>{
 const f=fixture();assert.equal((await handle(req('GET','bad'),f.deps)).status,401);
 assert.equal((await handle(put('add','D_1',0),f.deps)).status,200);
 assert.deepEqual((await handle(req(),f.deps)).body.favorites,{keys:['D_1'],revision:1});
 assert.deepEqual((await handle(req('GET','B'),f.deps)).body.favorites,{keys:[],revision:0});
 assert.equal(f.writes(),1);
});
test('stale writes and concurrent devices cannot overwrite',async()=>{
 const f=fixture();const results=await Promise.all([handle(put('add','D_1',0),f.deps),handle(put('add','D_2',0),f.deps)]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.writes(),1);
 assert.equal((await handle(put('remove','D_1',0),f.deps)).status,409);
});
test('expired entitlement can remove but not add',async()=>{
 const f=fixture();f.rows.set('E',{keys:['D_1'],revision:1});
 assert.equal((await handle(put('add','D_2',1,'E'),f.deps)).status,403);
 assert.equal((await handle(put('remove','D_1',1,'E'),f.deps)).status,200);
 assert.deepEqual(f.rows.get('E'),{keys:[],revision:2});
});
test('closed and missing rejected; unknown retained without active claim',async()=>{
 const f=fixture();for(const key of ['closed','missing'])assert.equal((await handle(put('add',key,0),f.deps)).status,422);
 assert.equal((await handle(put('add','unknown',0),f.deps)).status,200);
 assert.equal(f.writes(),1);
});
test('duplicate add and absent remove idempotent at current revision',async()=>{
 const f=fixture();await handle(put('add','D_1',0),f.deps);
 assert.equal((await handle(put('add','D_1',1),f.deps)).status,200);
 assert.equal((await handle(put('remove','D_2',1),f.deps)).status,200);assert.equal(f.writes(),1);
});
test('limit and malicious payloads rejected',async()=>{
 const f=fixture();f.rows.set('A',{keys:Array.from({length:50},(_,i)=>'D_'+i),revision:1});
 assert.equal((await handle(put('add','D_51',1),f.deps)).status,409);
 assert.equal((await handle(req('PUT','A',{action:'remove',key:'D_1',revision:1,user_id:'B'}),f.deps)).status,400);
 assert.throws(()=>validateFavoriteMutation({action:'add',key:'../bad',revision:0}));
 assert.throws(()=>validateFavoriteRow({keys:['x','x'],revision:1}));
 assert.equal(f.writes(),0);
});
test('storage failure or invalid acknowledgment fails closed',async()=>{
 const f=fixture();f.deps.compareAndSet=async()=>({keys:['D_wrong'],revision:1});
 assert.equal((await handle(put('add','D_1',0),f.deps)).status,503);
 f.deps.read=async()=>{throw Error('database');};
 assert.equal((await handle(req(),f.deps)).status,503);
});
