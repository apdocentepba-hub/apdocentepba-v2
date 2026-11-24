import test from 'node:test';
import assert from 'node:assert/strict';
import {accountScheduleRequest,validateModuleSchedule,validateScheduleWrite} from './apd-account-schedule-core.mjs';
import {createScheduleClient} from './apd-account-schedule-client.mjs';
const req=(method,body,token='A')=>new Request('https://fixture.invalid',{method,headers:{Authorization:token,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
function fixture(){
 const rows=new Map(),deps={
 authenticate:async r=>['A','B','C'].includes(r.headers.get('Authorization'))?{id:r.headers.get('Authorization')}:null,
 entitled:async id=>id!=='C',
 read:async id=>rows.get(id)||null,
 compareAndSet:async(id,p)=>{if((rows.get(id)?.revision||0)!==p.revision)return null;const v={modules:p.modules,revision:p.revision+1};rows.set(id,v);return v;}
 };return {rows,deps,call:(method,body,token)=>accountScheduleRequest(req(method,body,token),deps)};
}
test('strict module IDs, no duplicate or foreign identity',()=>{
 assert.deepEqual(validateModuleSchedule(['T0-2','M1-1']),['M1-1','T0-2']);
 for(const invalid of [['M0-1'],['T6-1'],['M1-8'],['M1-1','M1-1'],null,{}])assert.throws(()=>validateModuleSchedule(invalid));
 assert.throws(()=>validateScheduleWrite({modules:[],revision:0,user_id:'B'}));
});
test('anonymous denied, read empty distinguished, inactive plan cannot write',async()=>{
 const f=fixture();
 assert.equal((await f.call('GET',undefined,'bad')).status,401);
 assert.deepEqual((await f.call('GET')).body.schedule,{modules:[],revision:0});
 assert.equal((await f.call('PUT',{modules:['T0-2'],revision:0},'C')).status,403);
});
test('CAS prevents two devices overwriting and cross-account reads',async()=>{
 const f=fixture();
 const rs=await Promise.all([f.call('PUT',{modules:['M1-1'],revision:0}),f.call('PUT',{modules:['M2-1'],revision:0})]);
 assert.deepEqual(rs.map(x=>x.status).sort(),[200,409]);
 assert.equal((await f.call('GET',undefined,'B')).body.schedule.revision,0);
 assert.equal((await f.call('GET')).body.schedule.revision,1);
 assert.equal((await f.call('PUT',{modules:[],revision:1})).status,200);
 assert.deepEqual((await f.call('GET')).body.schedule,{modules:[],revision:2});
});
test('database outage fails closed',async()=>{
 const f=fixture();f.deps.read=async()=>{throw Error('db error');};
 assert.equal((await f.call('GET')).status,503);
});
test('client requires loaded revision and verifies write against subsequent GET',async()=>{
 const f=fixture();let token='A';
 const client=createScheduleClient({getToken:()=>token,base:'https://fixture.invalid',fetcher:async(url,init)=>{
  const result=await accountScheduleRequest(new Request(url,{...init,headers:{...init.headers,Authorization:token}}),f.deps);
  return new Response(JSON.stringify(result.body),{status:result.status});
 }});
 await assert.rejects(()=>client.persist(['M1-1']));
 await client.reload();
 assert.deepEqual(await client.persist(['T0-2']),{modules:['T0-2'],revision:1});
 token='B';assert.equal(client.peek(),null);assert.equal((await client.reload()).revision,0);
});
test('late response from old account cannot restore private cache',async()=>{
 let token='A',resolve;
 const client=createScheduleClient({getToken:()=>token,base:'https://fixture.invalid',fetcher:()=>new Promise(r=>resolve=r)});
 const old=client.reload();token='B';assert.equal(client.peek(),null);
 resolve(new Response(JSON.stringify({ok:true,schedule:{modules:['M1-1'],revision:1}})));
 await assert.rejects(()=>old);assert.equal(client.peek(),null);
});
