import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticatedScheduleSmoke} from './check-apd-account-schedule-authenticated.mjs';
const accounts=['A','B'].map((label,i)=>({label,id:'00000000-0000-4000-8000-00000000000'+(i+1),token:'fixture-token-'+label.repeat(30)}));
function fixture({wrongEmail=false,nonempty=false,failB=false,unexpectedChange=false}={}){
 const rows=new Map(accounts.map((a,i)=>[a.label,{revision:nonempty&&i===1?1:0,modules:nonempty&&i===1?['M3-3']:[]}]));
 let writes=0;
 const fetcher=async(url,opt)=>{
  const a=accounts.find(x=>'Bearer '+x.token===opt.headers.Authorization);
  assert.ok(a);assert.equal(new URL(url).origin,'https://apd-schedule-pr304-ancient-wildflower-cd37.apdocentepba.workers.dev');
  const route=new URL(url).pathname,respond=(value,status=200)=>new Response(JSON.stringify(value),{status});
  if(route.endsWith('/profile'))return respond({ok:true,user:{id:a.id,email:wrongEmail&&a.label==='B'?'normal@example.invalid':'apd-schedule-qa-'+a.label.toLowerCase()+'@example.invalid',activo:true}});
  if(route.endsWith('/mi-plan'))return respond({ok:true,user_id:a.id,access_active:true,subscription:{plan_code:'INSIGNE'}});
  const row=rows.get(a.label);
  if(opt.method==='GET')return respond({ok:true,schedule:row});
  writes++;const p=JSON.parse(opt.body);
  if(p.revision!==row.revision)return respond({ok:false},409);
  if(failB&&a.label==='B'&&p.modules.length){
   if(unexpectedChange)rows.set('B',{revision:row.revision+2,modules:['M5-5']});
   return respond({ok:false},503);
  }
  const saved={revision:p.revision+1,modules:p.modules};rows.set(a.label,saved);return respond({ok:true,schedule:saved});
 };return {rows,fetcher,writes:()=>writes};
}
test('QA smoke confirms both identities, CAS, cross-account read and cleanup',async()=>{
 const f=fixture();const out=await authenticatedScheduleSmoke({accounts,fetcher:f.fetcher});assert.equal(out.qaSchedulesEmpty,true);assert.equal(f.writes(),5);assert.ok([...f.rows.values()].every(x=>x.modules.length===0));
});
test('wrong QA identity or nonempty schedule prevents all writes',async()=>{
 for(const opts of [{wrongEmail:true},{nonempty:true}]){
  const f=fixture(opts);await assert.rejects(()=>authenticatedScheduleSmoke({accounts,fetcher:f.fetcher}));assert.equal(f.writes(),0);
 }
});
test('failure after first write cleans only owned test values',async()=>{
 const f=fixture({failB:true});await assert.rejects(()=>authenticatedScheduleSmoke({accounts,fetcher:f.fetcher}),/cleanup confirmed/);assert.ok([...f.rows.values()].every(x=>!x.modules.length));
});
test('unexpected concurrent value is never cleared',async()=>{
 const f=fixture({failB:true,unexpectedChange:true});await assert.rejects(()=>authenticatedScheduleSmoke({accounts,fetcher:f.fetcher}),/cleanup unconfirmed/);assert.deepEqual(f.rows.get('B').modules,['M5-5']);assert.deepEqual(f.rows.get('A').modules,[]);
});
test('missing or repeated credentials fail before network',async()=>{
 const noFetch=()=>{throw Error('Must not fetch');};await assert.rejects(()=>authenticatedScheduleSmoke({accounts:[accounts[0],accounts[0]],fetcher:noFetch}));
});
