import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {applyCompleteApproval as apply} from './apd-commercial-payment-adapter.mjs';
import {stageCommercialPayment} from './apd-commercial-stage-payment.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'};
const valid={id:100,live_mode:true,status:'approved',transaction_amount:2000,currency_id:'ARS',transaction_amount_refunded:0,date_approved:'2026-11-25T19:30:00Z',external_reference:'00000000-0000-4000-8000-000000000001:COMPLETO:123'};
const reply=(v,status=200)=>new Response(JSON.stringify(v),{status});
test('provider-approved payment maps only required fields to atomic RPC',async()=>{
 const result=await apply(env,valid,async(url,req)=>{
  assert.equal(url.href,'https://fixture.invalid/rest/v1/rpc/apd_apply_complete_approval');
  assert.equal(req.method,'POST');assert.equal(req.redirect,'error');
  assert.deepEqual(JSON.parse(req.body),{p_payment_id:'100',p_reference:valid.external_reference,p_status:'approved',p_amount:2000,p_currency:'ARS',p_approved_at:valid.date_approved});
  return reply({ok:true,duplicate:false});
 });
 assert.deepEqual(result,{processed:true,duplicate:false,plan_code:'COMPLETO'});
});
test('reject pending, refunded, partially refunded, incorrect amount, malformed dates, sandbox or reference before RPC',async()=>{
 for(const overrides of [{status:'pending'},{status:'refunded'},{transaction_amount_refunded:1},{transaction_amount_refunded:undefined},{transaction_amount:1999},{currency_id:'USD'},{date_approved:'2026-11-25'},{live_mode:false},{external_reference:'bad:COMPLETO:1'},{id:1e30}]){
  const result=await apply(env,{...valid,...overrides},async()=>assert.fail('RPC must not run'));
  assert.equal(result.processed,false);
 }
});
test('duplicate approval is acknowledged without new entitlement; rejected transaction never succeeds',async()=>{
 assert.equal((await apply(env,valid,async()=>reply({ok:true,duplicate:true}))).duplicate,true);
 assert.equal((await apply(env,valid,async()=>reply({ok:false,reason:'unknown_checkout'}))).processed,false);
});
test('transport and unexpected response errors fail closed',async()=>{
 for(const transport of [async()=>{throw Error('fixture');},async()=>reply({},503),async()=>reply({ok:true}),async()=>reply({ok:false,reason:'unexpected'})])await assert.rejects(apply(env,valid,transport));
});
const source='async function applyMercadoPagoPayment(env, payment) {\n return {legacy:true}; // parseMercadoPagoExternalReference findCheckoutSessionByExternalReference findSubscriptionByExternalReference supabaseInsert\n}\n__name(applyMercadoPagoPayment,"fixture");\nasync function syncMercadoPagoWebhook(env, resourceId){\n const payment = await fetchMercadoPagoPayment(env, resourceId);\n return await applyMercadoPagoPayment(env, payment);\n}\n// apdVerifyMercadoPagoWebhookV1(request, payload, env)\n';
test('exact source patch is reversible and syntax valid',()=>{const r=stageCommercialPayment(source);assert.equal(r.unrelatedBytesPreserved,true);assert.equal(r.legacyPreserved,true);verifyTrialCandidateSyntax(r.candidate);});
test('missing or duplicate provider source anchors rejected',()=>{for(const s of [source.replace('fetchMercadoPagoPayment(env, resourceId)','unverifiedFetch(env, resourceId)'),source.replace('apdVerifyMercadoPagoWebhookV1','unknown'),source+source])assert.throws(()=>stageCommercialPayment(s));});
test('legacy still delegates, provider ID mismatch cannot activate Completo',async()=>{
 const ctx={__name:()=>{},parseMercadoPagoExternalReference:r=>({plan_code:r?.split(':')[1]||''}),fetchMercadoPagoPayment:async()=>valid};
 vm.runInNewContext(stageCommercialPayment(source).candidate,ctx);
 assert.equal((await ctx.applyMercadoPagoPayment({}, {external_reference:'a:PLUS:1'})).legacy,true);
 assert.equal((await ctx.syncMercadoPagoWebhook({},'101')).reason,'provider_payment_id_mismatch');
});
