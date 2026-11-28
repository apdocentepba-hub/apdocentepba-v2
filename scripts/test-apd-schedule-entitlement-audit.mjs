import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stageScheduleEntitlementAudit,apdScheduleAllowedAuditV1} from './apd-schedule-entitlement-audit-stage.mjs';
const builder=readFileSync(new URL('./build-account-schedule-worker-candidate.mjs',import.meta.url),'utf8');
const start=builder.indexOf('async function handleAccountScheduleSecureV1(request,env){');
const stop=builder.indexOf('\n}',start)+2;
const original=builder.slice(start,stop);
const route='\nif (path === API_URL_PREFIX3 + "/account/schedule") {return await handleAccountScheduleSecureV1(request,env);}';
const source=original+route;
const now=Date.now(),past=new Date(now-100000).toISOString(),future=new Date(now+100000).toISOString();
const fixture=code=>({plan:{code},subscription:{user_id:'A',plan_code:code,status:'ACTIVE',source:'fixture',started_at:past,trial_ends_at:future,current_period_ends_at:future}});
test('schedule exact reviewed legacy handler patched reversibly; fail closed on drift',()=>{
 const r=stageScheduleEntitlementAudit(source);
 assert.equal(r.deployable,false);assert.equal(r.unrelatedBytesPreserved,true);
 assert.throws(()=>stageScheduleEntitlementAudit(r.candidate));
 assert.throws(()=>stageScheduleEntitlementAudit(source.replace("return isPlanActivo(resolved)","return true&&isPlanActivo(resolved)")));
 assert.throws(()=>stageScheduleEntitlementAudit(original));
});
test('complete and trial schedule access requires owner, active plan and valid dates',()=>{
 for(const code of ['COMPLETO','TRIAL_14D']){
  const p=fixture(code);assert.equal(apdScheduleAllowedAuditV1(p,'A',true,now),true);
  for(const patch of [{user_id:'B'},{status:'PENDING'},{source:''},{source:'FALLBACK_FRONTEND'},{started_at:future},{started_at:null},{trial_ends_at:past,current_period_ends_at:past},{trial_ends_at:null,current_period_ends_at:null}]){
   assert.equal(apdScheduleAllowedAuditV1({...p,subscription:{...p.subscription,...patch}},'A',true,now),false);
  }
  assert.equal(apdScheduleAllowedAuditV1({...p,plan:{code:'FREE'}},'A',true,now),false);
  assert.equal(apdScheduleAllowedAuditV1(p,'A',false,now),false);
 }
 assert.equal(apdScheduleAllowedAuditV1(fixture('FREE'),'A',true,now),false);
 assert.equal(apdScheduleAllowedAuditV1(fixture('INSIGNE'),'A',true,now),true);
});
test('execute entitlement callback from patched handler with synthetic resolver',async()=>{
 const r=stageScheduleEntitlementAudit(source);
 const s=r.candidate.slice(0,r.candidate.indexOf(route));
 const marker='async function handleAccountScheduleSecureV1(request,env){';
 const prefix=s.slice(0,s.indexOf(marker));
 const begin=s.indexOf('entitled:async id=>{'),end=s.indexOf('\n  },',begin);
 const callback=s.slice(begin+'entitled:'.length,end+4);
 for(const [code,expected] of [['COMPLETO',true],['TRIAL_14D',true],['FREE',false],['INSIGNE',true]]){
  const result=await vm.runInNewContext(prefix+'\n('+callback+')("A")',{env:{},resolverPlanUsuario:async()=>fixture(code),isPlanActivo:()=>true,Date});
  assert.equal(result,expected,code);
 }
});
