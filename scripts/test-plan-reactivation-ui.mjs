import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('plan_checkout_patch.js', 'utf8');
function slice(from, to) {
  const a = code.indexOf(from), b = code.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, 'Required plan policy function not found: ' + from);
  return code.slice(a, b);
}
const policyScript = [
  slice('function normalizePlanCodeSafe(', 'function canalesBox('),
  slice('function planActualCode(', 'function buildPlanCards('),
  slice('function planCardButtonHtml(', 'function buildPlanFeatureList(')
].join('\n');
// Includes currentPlanPrice, isCurrentPlan and transitionPolicy in the bounded section.
const api = vm.runInNewContext(policyScript + '\n({transitionPolicy,isCurrentPlan,planCardButtonHtml})', {window:{}});
const paid = (code, price) => ({code, nombre:code, price_ars:price});
const context = (code, active, price=3000, source='mercadopago_checkout') => ({
  access_active:active,
  plan:{code,price_ars:price},
  subscription:{plan_code:code,status:'ACTIVE',source}
});

test('expired paid plan can repurchase exactly the same plan',()=>{
  const account=context('INSIGNE',false);
  const decision=api.transitionPolicy(paid('INSIGNE',3000),account);
  assert.equal(decision.allowed,true);
  assert.equal(decision.mode,'reactivation_checkout');
  assert.match(decision.actionLabel,/Reactivar/);
  assert.equal(api.isCurrentPlan(paid('INSIGNE',3000),account),false);
  const markup=api.planCardButtonHtml(paid('INSIGNE',3000),account);
  assert.match(markup,/data-plan-checkout="INSIGNE"/);
  assert.doesNotMatch(markup,/\sdisabled[ >]/);
});

test('expired paid account is offered full checkout, not proration or delayed downgrade',()=>{
  const account=context('INSIGNE',false,3000);
  assert.equal(api.transitionPolicy(paid('PLUS',1000),account).mode,'reactivation_checkout');
  assert.equal(api.transitionPolicy(paid('PREMIUM',2000),context('PLUS',false,1000)).mode,'reactivation_checkout');
});

test('expired trial cannot be repeated but can purchase a paid plan',()=>{
  const account=context('TRIAL_7D',false,0,'trial_auto_register');
  assert.equal(api.transitionPolicy(paid('TRIAL_7D',0),account).allowed,false);
  assert.equal(api.transitionPolicy(paid('PLUS',1000),account).mode,'reactivation_checkout');
});

test('expired account cannot be shown a zero-price payment action',()=>{
  assert.equal(api.transitionPolicy(paid('EXPERIMENTAL',0),context('PLUS',false)).allowed,false);
});

test('current special grant remains active and is never offered reactivation',()=>{
  const account=context('INSIGNE',true,3000,'manual_admin_grant');
  assert.equal(api.transitionPolicy(paid('INSIGNE',3000),account).mode,'current');
  assert.equal(api.isCurrentPlan(paid('INSIGNE',3000),account),true);
});

test('active paid upgrades and downgrades remain unchanged',()=>{
  assert.equal(api.transitionPolicy(paid('INSIGNE',3000),context('PLUS',true,1000)).mode,'upgrade_prorated');
  assert.equal(api.transitionPolicy(paid('PLUS',1000),context('INSIGNE',true,3000)).mode,'downgrade_wait');
});

test('unknown entitlement is not classified as expired',()=>{
  const decision=api.transitionPolicy(paid('PLUS',1000),context('PLUS',undefined,1000));
  assert.equal(decision.mode,'current');
});

test('page loads the refreshed plan checkout patch',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/plan_checkout_patch\.js\?v=3/);
  assert.doesNotMatch(html,/plan_checkout_patch\.js\?v=2/);
});
