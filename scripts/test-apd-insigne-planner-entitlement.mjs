import test from 'node:test';
import assert from 'node:assert/strict';
import {hasInsignePlannerAccess,canonicalPlannerPlanCode}
 from './apd-insigne-planner-entitlement.mjs';

const live=(code='INSIGNE',status='active')=>({
 ok:true,access_active:true,plan:{code:'INSIGNE'},
 subscription:{plan_code:code,status,source:'mercadopago_checkout'}
});

test('Plan Insigne active, including annual and legacy Signature, can see private planner',()=>{
 for(const code of ['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL']){
  const value=live(code);
  assert.equal(hasInsignePlannerAccess(value),true,code);
 }
 assert.equal(canonicalPlannerPlanCode('signature'),'INSIGNE');
});
test('trial, Plus, Premium and Pro do NOT unlock the private planner',()=>{
 for(const code of ['TRIAL_7D','PLUS','PLUS_ANUAL','PREMIUM','PREMIUM_ANUAL','PRO','PRO_ANUAL','BASIC']){
  const info=live(code);
  info.plan.code=code;
  assert.equal(hasInsignePlannerAccess(info),false,code);
 }
});
test('never trust plan card alone; subscription identity must be Insigne',()=>{
 const data=live('PLUS');data.plan.code='INSIGNE';
 assert.equal(hasInsignePlannerAccess(data),false);
});
test('never trust mismatched plan or missing subscription',()=>{
 const wrong=live();wrong.plan.code='PREMIUM';
 assert.equal(hasInsignePlannerAccess(wrong),false);
 assert.equal(hasInsignePlannerAccess({...live(),subscription:null}),false);
});
test('deny even Insigne when expired, pending, paused, cancelled or unverified',()=>{
 for(const status of ['cancelled','expired','pending','paused','trialing','unverified']){
  assert.equal(hasInsignePlannerAccess(live('INSIGNE',status)),false,status);
 }
 for(const active of [false,null,undefined,0]){
  assert.equal(hasInsignePlannerAccess({...live(),access_active:active}),false);
 }
 const fallback=live();fallback.subscription.source='fallback_frontend';
 assert.equal(hasInsignePlannerAccess(fallback),false);
 assert.equal(hasInsignePlannerAccess({...live(),ok:false}),false);
 assert.equal(hasInsignePlannerAccess(null),false);
});
test('approved and authorized status accepted only when backend says active',()=>{
 assert.equal(hasInsignePlannerAccess(live('INSIGNE','authorized')),true);
 assert.equal(hasInsignePlannerAccess(live('INSIGNE','approved')),true);
});

test('verified Completo and fourteen-day trial unlock planner only before expiry',()=>{
 const now=Date.parse('2026-11-25T20:00:00Z'),end='2026-12-09T20:00:00Z';
 for(const code of ['COMPLETO','TRIAL_14D']){
  const info={ok:true,access_active:true,plan:{code},subscription:{plan_code:code,status:'ACTIVE',source:'verified',started_at:'2026-11-24T20:00:00Z',trial_ends_at:end,current_period_ends_at:end}};
  assert.equal(hasInsignePlannerAccess(info,now),true);
  assert.equal(hasInsignePlannerAccess(info,Date.parse(end)),false);
  assert.equal(hasInsignePlannerAccess({...info,access_active:false},now),false);
  assert.equal(hasInsignePlannerAccess({...info,plan:{code:'FREE'}},now),false);
  assert.equal(hasInsignePlannerAccess({...info,subscription:{...info.subscription,status:'PENDING'}},now),false);
  assert.equal(hasInsignePlannerAccess({...info,subscription:{...info.subscription,trial_ends_at:null,current_period_ends_at:null}},now),false);
 }
 const free=live('FREE');free.plan.code='FREE';assert.equal(hasInsignePlannerAccess(free,now),false);
});

// Compare the actual browser predicate and server stage on an authenticated fixture.
import {apdScheduleAllowedAuditV1} from './apd-schedule-entitlement-audit-stage.mjs';
test('new plan schedule presentation matches server for shared verified plan fields',()=>{
 const now=Date.parse('2026-11-28T12:00:00Z'),past='2026-11-27T12:00:00Z',future='2026-11-29T12:00:00Z';
 for(const code of ['COMPLETO','TRIAL_14D']){
  const valid={user_id:'A',plan_code:code,status:'ACTIVE',source:'verified',started_at:past,trial_ends_at:future,current_period_ends_at:future};
  for(const [patch,expected] of [[{},true],[{started_at:null},false],[{started_at:future},false],[{started_at:'invalid'},false],[{source:''},false],[{source:' FALLBACK_FRONTEND '},false],[{status:'PENDING'},false],[{trial_ends_at:past,current_period_ends_at:past},false],[{trial_ends_at:null,current_period_ends_at:null},false]]){
   const p={ok:true,access_active:true,plan:{code},subscription:{...valid,...patch}};
   assert.equal(hasInsignePlannerAccess(p,now),expected);
   assert.equal(apdScheduleAllowedAuditV1(p,'A',true,now),expected);
  }
 }
 // Ownership is a server-only check; never treat UI state as authorization.
});
