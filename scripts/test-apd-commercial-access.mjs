import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialAccessCore} from './apd-commercial-access-core.mjs';
import {APD_OFFER,resolveCommercialAccess} from './apd-commercial-policy.mjs';
import {stageCommercialAccess} from './apd-commercial-stage-access.mjs';
import {stageTrialHelpers,verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const now=Date.parse('2026-11-25T19:00:00Z'),user={id:'fixture',activo:true};
const legacyActive=r=>r.subscription?.status==='ACTIVE'&&r.subscription?.source==='legacy_valid';
const legacyChoose=rows=>rows.find(r=>legacyActive({subscription:r}));
const core=commercialAccessCore({resolveAccess:resolveCommercialAccess,offer:APD_OFFER,legacyChoose,legacyActive,normalizePlan:p=>p,normalizeSub:r=>r,legacyFallback:c=>({code:c})});
const catalog=['FREE','TRIAL_14D','COMPLETO'].map(c=>core.preset(c));
const trial={user_id:user.id,plan_code:'TRIAL_14D',status:'ACTIVE',started_at:'2026-11-25T18:00:00Z',trial_ends_at:'2026-12-09T19:00:00Z'};
const paid={user_id:user.id,plan_code:'COMPLETO',status:'ACTIVE',started_at:'2026-11-25T18:00:00Z',current_period_ends_at:'2026-12-25T19:00:00Z'};
const legacy={user_id:user.id,plan_code:'INSIGNE',status:'ACTIVE',source:'legacy_valid'};
const resolve=(rows,over={})=>core.resolve({catalog,rows,account:user,now,...over});
test('inactive staged catalog delegates, partial activation fails closed',()=>{assert.equal(resolve([],{catalog:catalog.map(p=>({...p,is_active:false}))}).delegateLegacy,true);assert.throws(()=>resolve([],{catalog:catalog.slice(1)}));assert.throws(()=>resolve([],{catalog:catalog.map((p,i)=>({...p,is_active:i!==0}))}));});
test('catalog cannot advertise altered price or limits',()=>{for(const override of [{price_ars:1},{max_cargos:999},{trial_days:7}])assert.throws(()=>resolve([],{catalog:catalog.map(p=>p.code==='TRIAL_14D'?{...p,...override}:p)}));});
test('full access on verified trial; exact expiry falls back to free',()=>{const a=resolve([trial]);assert.equal(a.subscription.plan_code,'TRIAL_14D');assert.equal(core.completeAccess(a,now),true);const end=Date.parse(trial.trial_ends_at);const b=resolve([trial],{now:end});assert.equal(b.subscription.plan_code,'FREE');assert.equal(core.isActive(b,end),true);assert.equal(core.completeAccess(b,end),false);});
test('paid access supersedes trial, pending checkout does not',()=>{assert.equal(resolve([trial,paid]).subscription.plan_code,'COMPLETO');assert.equal(resolve([{...paid,status:'PENDING'},trial]).subscription.plan_code,'TRIAL_14D');});
test('legacy contract retained even with a new current trial',()=>{assert.equal(resolve([trial,legacy]).subscription.plan_code,'INSIGNE');assert.equal(core.completeAccess(resolve([legacy]),now),true);});
test('failed history and unknown ownership/code deny instead of free fallback',()=>{for(const rows of [null,[{...trial,user_id:'other'}],[{...trial,plan_code:'UNKNOWN'}],[{...trial,trial_ends_at:'bad'}]])assert.throws(()=>resolve(rows));assert.throws(()=>resolve([],{account:{...user,activo:false}}));});
test('free marker and matching plan required; premium cannot be forged through plan card',()=>{assert.equal(core.isActive({subscription:{plan_code:'FREE',status:'ACTIVE'}},now),false);assert.equal(core.completeAccess({plan:{code:'COMPLETO'},subscription:{...trial,plan_code:'FREE'}},now),false);assert.equal(core.completeAccess({plan:{code:'FREE'},subscription:trial},now),false);});
const source=['function getPlanPreset(code) {\n return "TRIAL_7D";\n}', 'function elegirSuscripcionVigente(rows) {\n return rows[0]?.trial_ends_at;\n}', 'function isPlanActivo(resolved) {\n return resolved.current_period_ends_at;\n}', 'async function resolverPlanUsuario(env,userId) {\n return "user_subscriptions";\n}'].map(s=>s+'\n__name('+s.match(/function (\w+)/)[1]+', "fixture");\n').join('')+'export default {};';
test('reversible exact-source stage, syntax, remaining references',()=>{const r=stageCommercialAccess(source);assert.equal(r.functions.length,4);assert.equal(r.unrelatedBytesPreserved,true);assert.equal(r.deployable,false);verifyTrialCandidateSyntax(r.candidate);});
test('source anchor drift refuses candidate',()=>{assert.throws(()=>stageCommercialAccess(source.replace('trial_ends_at','unknown')));assert.throws(()=>stageCommercialAccess(source+'\n'+source));});

test('access and trial stage compose in dependency order without duplicate-stage false positive',()=>{
 const helper='async function ensureTrialIfNoSubscriptions(env,userId) {\n return env.insert("user_subscriptions","TRIAL_7D");\n}\n__name(ensureTrialIfNoSubscriptions,"fixture");\n';
 const input=helper+source;
 const a=stageCommercialAccess(input),b=stageTrialHelpers(a.candidate);
 assert.equal(a.unrelatedBytesPreserved,true);assert.equal(b.unrelatedBytesPreserved,true);
 assert.match(b.candidate,/const apdCommercialCoreV1=/);
 assert.match(b.candidate,/apdCommercialCoreV1.ready\(catalog\)/);
 verifyTrialCandidateSyntax(b.candidate);
 assert.throws(()=>stageCommercialAccess(b.candidate));
});

test('courtesy transitions finite legacy rights without rewriting history',()=>{
 const grant={...paid,source:'legacy_transition_30d',started_at:new Date(now).toISOString(),current_period_ends_at:new Date(now+60*86400000).toISOString()};
 const finite={...legacy,current_period_ends_at:new Date(now+30*86400000).toISOString()};
 const before=JSON.stringify([finite,grant]);
 assert.equal(resolve([finite,grant]).subscription.source,'legacy_transition_30d');
 assert.equal(core.completeAccess(resolve([finite,grant]),now),true);
 assert.equal(JSON.stringify([finite,grant]),before);
 assert.equal(resolve([legacy,grant]).subscription.plan_code,'INSIGNE');
 assert.equal(resolve([{...finite,mercadopago_preapproval_id:'fixture'},grant]).subscription.plan_code,'INSIGNE');
 assert.equal(resolve([grant],{now:Date.parse(grant.current_period_ends_at)}).subscription.plan_code,'FREE');
 assert.equal(resolve([{...grant,started_at:new Date(now+1000).toISOString()}]).subscription.plan_code,'FREE');
 assert.throws(()=>resolve([grant,grant]));
 const laterPaid={...paid,started_at:new Date(now-1000).toISOString(),current_period_ends_at:new Date(now+90*86400000).toISOString(),source:'mercadopago_checkout'};
 assert.equal(resolve([grant,laterPaid]).subscription.source,'mercadopago_checkout');
});

test('scheduled paid renewal cannot mask current trial or paid period, starts at exact boundary',()=>{
 const future={...paid,started_at:new Date(now+1000).toISOString(),current_period_ends_at:new Date(now+60*86400000).toISOString(),source:'mercadopago_checkout'};
 assert.equal(resolve([future]).subscription.plan_code,'FREE');
 assert.equal(resolve([future,trial]).subscription.plan_code,'TRIAL_14D');
 assert.equal(resolve([future,paid]).subscription.started_at,paid.started_at);
 assert.equal(core.completeAccess({plan:{code:'COMPLETO'},subscription:future},now),false);
 assert.equal(resolve([paid,future],{now:now+1000}).subscription.started_at,future.started_at);
 const longer={...paid,current_period_ends_at:new Date(now+50*86400000).toISOString()};
 assert.equal(resolve([paid,longer]).subscription.current_period_ends_at,longer.current_period_ends_at);
 assert.equal(resolve([longer,paid]).subscription.current_period_ends_at,longer.current_period_ends_at);
 for(const bad of [null,'bad',paid.current_period_ends_at]){
  const row={...paid,started_at:bad};assert.throws(()=>resolve([row]));assert.equal(core.isActive({plan:{code:'COMPLETO'},subscription:row},now),false);
 }
});
