import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stageCommercialLegacyBilling} from './apd-commercial-stage-legacy-billing.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const fixture=[
'async function handleSubscriptionEnableAutoRenew(request, env) {\n const userId="fixture";\n const current = await arGetCurrentPaidSubscription(env, userId);\n return arMercadoPagoRequest(current);\n}\n__name(handleSubscriptionEnableAutoRenew,"fixture");',
'async function apdProcessExpiryNotices(env) {\n if (String(env.APD_EXPIRY_NOTICES_ENABLED || "").toLowerCase() !== "true") return;\n return apdSendExpiryNoticeOnce();\n}\n__name(apdProcessExpiryNotices,"fixture");',
'async function handleSubscriptionCancelAutoRenew(request,env) { return "legacy cancellation"; }\n__name(handleSubscriptionCancelAutoRenew,"fixture");'].join('\n');
test('new commercial model blocks legacy recurring creation and obsolete notices without affecting cancellation',async()=>{
 let ready=true,code='INSIGNE',provider=0,notices=0;
 const ctx={__name:()=>{},supabaseSelect:async()=>[],apdCommercialCoreV1:{ready:()=>ready},json:(body,status)=>({body,status}),arGetCurrentPaidSubscription:async()=>({plan_code:code}),arMercadoPagoRequest:()=>++provider,apdSendExpiryNoticeOnce:()=>++notices};
 const r=stageCommercialLegacyBilling(fixture);assert.equal(r.unrelatedBytesPreserved,true);verifyTrialCandidateSyntax(r.candidate);vm.runInNewContext(r.candidate,ctx);
 assert.equal((await ctx.handleSubscriptionEnableAutoRenew({},{})).status,409);await ctx.apdProcessExpiryNotices({APD_EXPIRY_NOTICES_ENABLED:'true'});assert.equal(provider,0);assert.equal(notices,0);assert.equal(await ctx.handleSubscriptionCancelAutoRenew({},{}),'legacy cancellation');
 ready=false;assert.equal(await ctx.handleSubscriptionEnableAutoRenew({},{}),1);await ctx.apdProcessExpiryNotices({APD_EXPIRY_NOTICES_ENABLED:'true'});assert.equal(notices,1);
 code='COMPLETO';assert.equal((await ctx.handleSubscriptionEnableAutoRenew({},{})).status,409);assert.equal(provider,1);
});
test('missing legacy guard fails closed',()=>assert.throws(()=>stageCommercialLegacyBilling(fixture.replace('arGetCurrentPaidSubscription(env, userId)','unknown()'))));
