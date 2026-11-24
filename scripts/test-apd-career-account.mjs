import test from 'node:test';
import assert from 'node:assert/strict';
import {careerAccountRequest,combineCareerWithSchedule,cleanCareer} from './apd-career-account-core.mjs';
const profile={schema:1,seniorityYears:10,positions:[{id:'c1',schoolKey:'0005MS0004',school:'Escuela de ensayo',role:'Matemática',level:'Secundaria',kind:'modulo',status:'titular',quantity:2,modules:['T1-1'],blocks:[{day:1,start:'14:00',end:'16:00'}]}]};
function fixture(){
 const rows=new Map();
 const deps={authenticate:async req=>({BearerA:{id:'A'},BearerB:{id:'B'}})[req.headers.get('authorization')],entitled:async id=>id==='A',read:async id=>rows.get(id)||null,compareAndSet:async(id,data)=>{if((rows.get(id)?.revision||0)!==data.revision)return null;const result={profile:data.profile,revision:data.revision+1};rows.set(id,result);return result;}};
 const call=(method,auth,data)=>careerAccountRequest(new Request('https://fixture.invalid/api/account/career',{method,headers:{authorization:auth,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})}),deps);
 return {rows,call,deps};
}
test('unauthenticated denied and missing profile distinct from empty',async()=>{
 const {call}=fixture();assert.equal((await call('GET','A')).status,401);
 assert.deepEqual((await call('GET','BearerA')).body.career,{profile:null,revision:0});
});
test('save/readback, owner isolation, expired plan can read but not write',async()=>{
 const {call,rows}=fixture();
 assert.equal((await call('PUT','BearerA',{profile,revision:0})).status,200);
 assert.deepEqual((await call('GET','BearerA')).body.career,{profile,revision:1});
 assert.deepEqual((await call('GET','BearerB')).body.career,{profile:null,revision:0});
 assert.equal((await call('PUT','BearerB',{profile,revision:0})).status,403);
 assert.equal(rows.size,1);
});
test('stale revision, spoofed owner, invalid payload and excess size rejected',async()=>{
 const {call}=fixture();await call('PUT','BearerA',{profile,revision:0});
 assert.equal((await call('PUT','BearerA',{profile,revision:0})).status,409);
 assert.equal((await call('PUT','BearerA',{profile,revision:1,user_id:'B'})).status,400);
 assert.equal((await call('PUT','BearerA',{profile:{...profile,salary:999},revision:1})).status,400);
 assert.equal((await call('PUT','BearerA',{profile:{...profile,positions:[{...profile.positions[0],school:'x'.repeat(70000)}]},revision:1})).status,413);
 assert.equal((await call('GET','BearerA')).body.career.revision,1);
});
test('projection is nonmutating and preserves legacy occupied modules',()=>{
 const legacy=['M1-2','T1-1'];const result=combineCareerWithSchedule(profile,legacy);
 assert.deepEqual(result.modules,legacy);assert.deepEqual(result.unassignedModules,['M1-2']);assert.equal(result.jobs.length,1);assert.deepEqual(legacy,['M1-2','T1-1']);
});
test('unknown fields and excess aggregate blocks are rejected',()=>{
 assert.throws(()=>cleanCareer({...profile,positions:[{...profile.positions[0],unknown:true}]}));
 const p=profile.positions[0];assert.throws(()=>cleanCareer({...profile,positions:[{...p,blocks:Array(42).fill(p.blocks[0])},{...p,id:'c2',modules:[]}]}));
});
test('storage error fails closed',async()=>{
 const {deps}=fixture();deps.read=async()=>{throw Error('private detail');};
 const r=await careerAccountRequest(new Request('https://fixture.invalid',{headers:{authorization:'BearerA'}}),deps);
 assert.equal(r.status,503);assert.ok(!JSON.stringify(r).includes('private detail'));
});
