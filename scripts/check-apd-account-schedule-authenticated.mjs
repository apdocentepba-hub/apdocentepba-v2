/** Explicit operator-only authenticated smoke. Never creates accounts, sessions or plans. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {validateScheduleRow} from './apd-account-schedule-core.mjs';
const preview='https://apd-schedule-pr304-ancient-wildflower-cd37.apdocentepba.workers.dev';
const fixtureMail=label=>'apd-schedule-qa-'+label.toLowerCase()+'@example.invalid';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function authenticatedScheduleSmoke({accounts,fetcher=fetch}){
 assert.ok(Array.isArray(accounts)&&accounts.length===2,'Exactly two dedicated QA accounts required');
 for(const [i,a] of accounts.entries()){
  assert.ok(a?.label===['A','B'][i]&&uuid.test(a.id)&&typeof a.token==='string'&&a.token.length>=24,'Missing QA identity or credential');
 }
 assert.ok(accounts[0].id!==accounts[1].id&&accounts[0].token!==accounts[1].token,'QA identities must differ');
 const call=async(a,path,method='GET',body,expected=200)=>{
  const res=await fetcher(preview+path,{method,redirect:'error',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
   headers:{Origin:'https://alertasapd.com.ar',Authorization:'Bearer '+a.token,...(body?{'Content-Type':'application/json'}:{})},
   signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
  if(res.status!==expected)throw Error('Unexpected HTTP '+res.status+' at '+path.split('?')[0]+' for QA '+a.label);
  const data=await res.json();
  if(expected===200&&data?.ok!==true)throw Error('QA response not confirmed');
  return data;
 };
 const read=async(a,query='')=>{
  const data=await call(a,'/api/account/schedule'+query);
  if(data.schedule?.revision===0&&Array.isArray(data.schedule.modules)&&data.schedule.modules.length===0)return {revision:0,modules:[]};
  if(!data.schedule||typeof data.schedule!=='object'||Array.isArray(data.schedule))throw Error('QA schedule response invalid');
  return validateScheduleRow(data.schedule);
 };
 const write=async(a,modules,revision,expected=200)=>{
  const data=await call(a,'/api/account/schedule','PUT',{modules,revision},expected);
  if(expected===200){const record=validateScheduleRow(data.schedule);assert.equal(record.revision,revision+1);assert.deepEqual(record.modules,modules);return record;}
  assert.equal(data.ok,false);
 };
 const baseline=new Map(),attempted=new Map();
 // Verify both dedicated accounts BEFORE performing any write. Neither can be a real customer.
 for(const a of accounts){
  const p=await call(a,'/api/account/profile');
  if(p.user?.id!==a.id||String(p.user?.email||'').toLowerCase()!==fixtureMail(a.label)||p.user?.activo!==true)
   throw Error('QA identity not dedicated or not active; no writes');
  const plan=await call(a,'/api/mi-plan');
  if(plan.user_id!==a.id||plan.access_active!==true||!['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'].includes(String(plan.subscription?.plan_code||'').toUpperCase()))
   throw Error('QA account lacks confirmed Insigne; no writes');
  const row=await read(a);
  if(row.modules.length!==0)throw Error('QA schedule not empty; refusing to overwrite');
  baseline.set(a.label,row.revision);
 }
 let failure=null,cleanupFailed=false;
 try{
  for(const [i,a] of accounts.entries()){
   const modules=i===0?['M1-1']:['T0-2'],revision=baseline.get(a.label);
   attempted.set(a.label,{modules,revision:revision+1});
   await write(a,modules,revision);
   assert.deepEqual(await read(a),{modules,revision:revision+1});
  }
  const [a,b]=accounts;
  await write(a,['M2-1'],baseline.get('A'),409);
  assert.deepEqual(await read(a,'?user_id='+encodeURIComponent(b.id)),{modules:['M1-1'],revision:baseline.get('A')+1});
  assert.deepEqual(await read(b,'?user_id='+encodeURIComponent(a.id)),{modules:['T0-2'],revision:baseline.get('B')+1});
 }catch(error){failure=error;}
 finally{
  for(const a of accounts){
   const own=attempted.get(a.label);if(!own)continue;
   try{
    const row=await read(a);
    if(row.modules.length){
     // Never clear any concurrent or unexplained change, even on a QA account.
     if(row.revision!==own.revision||JSON.stringify(row.modules)!==JSON.stringify(own.modules))throw Error('Unrecognized QA change');
     await write(a,[],row.revision);
    }
    assert.deepEqual((await read(a)).modules,[]);
   }catch{cleanupFailed=true;}
  }
 }
 if(cleanupFailed)throw Error('QA cleanup unconfirmed; stop rollout and inspect only dedicated fixtures');
 if(failure)throw Error('Authenticated QA failed; fixture cleanup confirmed; do not promote');
 return {ok:true,accounts:2,cas:true,identityIsolation:true,readback:true,qaSchedulesEmpty:true,productionTrafficChanged:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 if(process.argv.length!==3||process.argv[2]!=='--execute-dedicated-qa')throw Error('Explicit --execute-dedicated-qa required');
 const accounts=['A','B'].map(label=>({label,id:process.env['APD_SCHEDULE_QA_'+label+'_ID'],token:process.env['APD_SCHEDULE_QA_'+label+'_TOKEN']}));
 authenticatedScheduleSmoke({accounts}).then(x=>console.log('APD_AUTHENTICATED_QA_PASS '+JSON.stringify(x))).catch(()=>{console.error('APD_AUTHENTICATED_QA_FAIL; do not promote; inspect dedicated fixture cleanup');process.exitCode=1;});
}
