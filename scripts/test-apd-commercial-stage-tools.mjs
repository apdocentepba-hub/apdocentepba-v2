import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stageCommercialTools} from './apd-commercial-stage-tools.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const make=(name,v)=>'function '+name+'('+v+') {\n return isPlanActivo('+v+")&&['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'].includes(String("+v+"?.subscription?.plan_code||'').toUpperCase())&&['ACTIVE','AUTHORIZED','APPROVED'].includes(String("+v+"?.subscription?.status||'').toUpperCase());\n}\n";
const source=make('handleAccountScheduleSecureV1','resolved')+make('handleAccountFavoritesSecureV1','p')+make('handleAccountDiarySecureV1','p')+'function canShowPidForPlan(value) {\n return getPlanCodeValue(value) === "INSIGNE";\n}\n';
test('three account gates and PID patched reversibly, syntax checked',()=>{const r=stageCommercialTools(source);assert.equal(r.accountGates.length,3);assert.equal(r.unrelatedBytesPreserved,true);assert.equal(r.deployable,false);verifyTrialCandidateSyntax(r.candidate);});
test('unexpected gate owner, missing anchor or duplicate denied',()=>{for(const s of [source.replace('handleAccountScheduleSecureV1','unexpected'),source.replace('return getPlanCodeValue(value) === "INSIGNE";','return true;'),source+make('unexpected','p')])assert.throws(()=>stageCommercialTools(s));});
test('new plan code requires server entitlement, legacy checks unchanged',()=>{
 const r=stageCommercialTools(source);
 const context={isPlanActivo:p=>p.active===true,apdCommercialCoreV1:{completeAccess:p=>p.active===true&&p.plan?.code===p.subscription?.plan_code&&p.subscription?.status==='ACTIVE'},getPlanCodeValue:p=>typeof p==='string'?p:p.plan?.code};
 vm.runInNewContext(r.candidate,context);
 for(const name of r.accountGates){
  const gate=context[name];
  for(const code of ['COMPLETO','TRIAL_14D','INSIGNE']){
   const a={active:true,plan:{code},subscription:{plan_code:code,status:'ACTIVE'}};
   assert.equal(gate(a),true);
   assert.equal(gate({...a,active:false}),false);
   assert.equal(gate({...a,subscription:{...a.subscription,status:'PENDING'}}),false);
  }
  assert.equal(gate({active:true,plan:{code:'COMPLETO'},subscription:{plan_code:'FREE',status:'ACTIVE'}}),false);
 }
 assert.equal(context.canShowPidForPlan('COMPLETO'),false);
 assert.equal(context.canShowPidForPlan('INSIGNE'),true);
 assert.equal(context.canShowPidForPlan({active:true,plan:{code:'TRIAL_14D'},subscription:{plan_code:'TRIAL_14D',status:'ACTIVE'}}),true);
});
