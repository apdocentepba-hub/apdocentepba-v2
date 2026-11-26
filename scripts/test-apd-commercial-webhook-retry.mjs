import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stageCommercialWebhookRetry} from './apd-commercial-stage-webhook-retry.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const source=[
 'async function applyMercadoPagoPayment(env,payment) {\n const parsed=payment;\n if(parsed.plan_code==="COMPLETO")return await apdApplyCompleteApprovalV1(env,payment);\n return {processed:true};\n}\n__name(applyMercadoPagoPayment,"fixture");',
 'async function handleMercadoPagoWebhook(request, env) {\n if(!await apdVerifyMercadoPagoWebhookV1(request, payload, env))return json({ok:false},401);\n const sync=await syncMercadoPagoWebhook();\n return json({ ok: true, sync });\n}\n__name(handleMercadoPagoWebhook,"fixture");',
 'async function fetchMercadoPagoPayment(env,paymentId) {\n return fetch("https://api.mercadopago.com/v1/payments/"+paymentId,{\n headers: {Authorization:"fixture"}\n });\n}\n__name(fetchMercadoPagoPayment,"fixture");'
].join('\n');
test('webhook retry patch preserves other source and denies unverified anchors',()=>{const r=stageCommercialWebhookRetry(source);assert.equal(r.unrelatedBytesPreserved,true);verifyTrialCandidateSyntax(r.candidate);assert.throws(()=>stageCommercialWebhookRetry(source.replace('apdVerifyMercadoPagoWebhookV1','unknown')));});
test('retry transient failure, acknowledge completed and terminal cases, retain authentication',async()=>{
 let sync,auth=true;
 const c={__name:()=>{},payload:{},json:(body,status=200)=>({body,status}),apdVerifyMercadoPagoWebhookV1:async()=>auth,syncMercadoPagoWebhook:async()=>sync,apdApplyCompleteApprovalV1:async()=>({processed:false,reason:'unknown_checkout'})};
 vm.runInNewContext(stageCommercialWebhookRetry(source).candidate,c);
 for(const reason of ['sync_error','missing_access_token','provider_payment_id_mismatch','release_disabled','unknown_checkout','checkout_not_eligible','account_unavailable']){sync={commercial:true,processed:false,reason};assert.equal((await c.handleMercadoPagoWebhook({},{})).status,503);}
 for(const reason of ['payment_under_review','complete_payment_not_approved_reconciliation_required','unsupported_topic']){sync={commercial:true,processed:false,reason};assert.equal((await c.handleMercadoPagoWebhook({},{})).status,200);}
 sync={processed:true};assert.equal((await c.handleMercadoPagoWebhook({},{})).status,200);
 assert.equal((await c.applyMercadoPagoPayment({}, {plan_code:'COMPLETO'})).commercial,true);
 auth=false;assert.equal((await c.handleMercadoPagoWebhook({},{})).status,401);
});
