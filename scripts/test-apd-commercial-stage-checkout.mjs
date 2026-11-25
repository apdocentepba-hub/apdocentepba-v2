import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {commercialRpc,stageCommercialCheckout} from './apd-commercial-stage-checkout.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const fixture='async function handleMercadoPagoCreateCheckoutLink(request, env) {\n return {legacy:true}; // createMercadoPagoCheckoutPreference mercadopago_checkout_sessions\n}\n__name(handleMercadoPagoCreateCheckoutLink,"fixture");\nasync function handlePlanes(env) {\n return {legacy:true}; // subscription_plans\n}\n__name(handlePlanes,"fixture");\n// getSessionUserByBearer\n';
const plans=[{code:'FREE',price_ars:0},{code:'COMPLETO',price_ars:2000},{code:'INSIGNE',price_ars:3000},{code:'TRIAL_14D',price_ars:0}];
const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-key'};
test('stage only two known functions and preserve unrelated bytes',()=>{const r=stageCommercialCheckout(fixture);assert.equal(r.functions.length,2);assert.equal(r.unrelatedBytesPreserved,true);verifyTrialCandidateSyntax(r.candidate);assert.throws(()=>stageCommercialCheckout(fixture+fixture));});
test('RPC names allowlisted, fixed origin, no redirect',async()=>{let calls=0;const r=await commercialRpc(env,'apd_reserve_complete_checkout',{p_user_id:'fixture'},async(u,req)=>{calls++;assert.equal(u.href,'https://fixture.invalid/rest/v1/rpc/apd_reserve_complete_checkout');assert.equal(req.redirect,'error');return new Response('{"ok":true}');});assert.equal(r.ok,true);assert.equal(calls,1);await assert.rejects(commercialRpc(env,'arbitrary',{},async()=>assert.fail('unexpected request')));});
const request=plan=>new Request('https://fixture.invalid/api/mercadopago/create-checkout-link',{method:'POST',body:JSON.stringify({plan_code:plan})});
function context(ready,auth=null){
 const c={__name:()=>{},apdCommercialCoreV1:{ready:()=>ready},supabaseSelect:async()=>plans,normalizePlanOut:p=>p,json:(body,status=200)=>({body,status}),getSessionUserByBearer:async()=>auth,URL,Request,Response,fetch:async()=>assert.fail('network forbidden')};
 vm.runInNewContext(stageCommercialCheckout(fixture).candidate,c);
 return c;
}
test('two public plans only, trial metadata, legacy while inactive',async()=>{const r=await context(true).handlePlanes(env);assert.equal(JSON.stringify(r.body.planes.map(p=>p.code)),'["FREE","COMPLETO"]');assert.equal(r.body.trial_days,14);assert.equal((await context(false).handlePlanes(env)).legacy,true);});
test('no unauthorized complete checkout or new legacy checkout after activation',async()=>{const c=context(true);assert.equal((await c.handleMercadoPagoCreateCheckoutLink(request('COMPLETO'),env)).status,401);assert.equal((await c.handleMercadoPagoCreateCheckoutLink(request('PLUS'),env)).status,409);assert.equal((await context(false).handleMercadoPagoCreateCheckoutLink(request('PLUS'),env)).legacy,true);assert.equal((await context(false).handleMercadoPagoCreateCheckoutLink(request('COMPLETO'),env)).status,409);});
