// Execute only explicitly bounded candidate functions, not the complete production module.
// The VM receives synthetic services and no production bindings or real fetch.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {claimCompleteTrial} from './apd-commercial-trial-adapter.mjs';
import {completeCheckout} from './apd-commercial-checkout.mjs';
import {commercialRpc} from './apd-commercial-stage-checkout.mjs';
import {applyCompleteApproval} from './apd-commercial-payment-adapter.mjs';
import {effectiveCommercialPreferences} from './apd-commercial-effective-preferences.mjs';

export function extract(source,name){
 const matches=[...source.matchAll(new RegExp('^(?:async )?function '+name+'\\([^\\n]*\\) \\{','gm'))];
 assert.equal(matches.length,1,'Runtime function anchor: '+name);
 const start=matches[0].index,end=source.indexOf('\n__name('+name+',',start);
 assert.ok(end>start,'Runtime boundary: '+name);
 const body=source.slice(start,end);
 assert.ok(body.endsWith('}'),'Runtime closing boundary: '+name);
 // A one-line wrapper is valid; reject a boundary spanning multiple top-level declarations.
 assert.equal([...body.matchAll(/^(?:async )?function [A-Za-z_$][\w$]*\(/gm)].length,1,'Runtime boundary includes another declaration');
 return body;
}
export async function verifyCommercialRuntime(source){
 const coreStart=source.indexOf('const apdCommercialCoreV1=(()=>{');
 assert.ok(coreStart>=0);
 const coreEnd=source.indexOf('\n})();\n',coreStart);
 assert.ok(coreEnd>coreStart);
 const core=source.slice(coreStart,coreEnd+7);
 const names=['getPlanPreset','resolverPlanUsuario','isPlanActivo','normalizePlanOut','normalizeSubscriptionOut','canonicalPlanCode','clampPlanLimit','buildPlanFeatures','buildPlanDistrictSlots','buildPlanCargoSlots','calculateSubscriptionDaysRemaining','resolveSubscriptionEndDate','ensureTrialIfNoSubscriptions','handlePlanes','handleMercadoPagoCreateCheckoutLink','createMercadoPagoCheckoutPreference','applyMercadoPagoPayment'];
 const uid='00000000-0000-4000-8000-000000000007';
 const now=Date.parse('2026-11-25T20:00:00Z');
 let clock=now,rows=[],session=null,reversed=false,providerCalls=0,networkCalls=0,active=true,authenticated=true;
 const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',MERCADOPAGO_CURRENCY_ID:'ARS',MERCADOPAGO_ACCESS_TOKEN:'fixture-only'};
 const catalog=[{code:'FREE',price_ars:0,trial_days:0,max_distritos:1,max_cargos:1,public_visible:true},{code:'TRIAL_14D',price_ars:0,trial_days:14,max_distritos:5,max_cargos:10,public_visible:false},{code:'COMPLETO',price_ars:2000,trial_days:0,max_distritos:5,max_cargos:10,public_visible:true}];
 const iso=t=>new Date(t).toISOString();
 const user={id:uid,activo:true};
 const reference=uid+':COMPLETO:123';
 const checkoutUrl='https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=fixture';
 const ok=v=>new Response(JSON.stringify(v));
 const transport=async(url,request)=>{
  url=new URL(url);
  if(url.href==='https://api.mercadopago.com/checkout/preferences'){
   providerCalls++;
   assert.equal(request.method,'POST');
   const body=JSON.parse(request.body);
   assert.equal(body.items.length,1);assert.equal(body.items[0].unit_price,2000);assert.equal(body.items[0].currency_id,'ARS');assert.equal(body.items[0].id,'COMPLETO');assert.equal(body.external_reference,reference);
   assert.equal(request.headers.Authorization,'Bearer fixture-only');
   assert.equal(body.notification_url,'https://fixture.invalid/api/mercadopago/webhook');
   return ok({id:'fixture',init_point:checkoutUrl});
  }
  networkCalls++;
  assert.equal(url.origin,'https://fixture.invalid');
  assert.equal(request.method,'POST');
  assert.equal(request.redirect,'error');
  const args=JSON.parse(request.body);
  const route=url.pathname.split('/').at(-1);
  if(route==='apd_claim_complete_trial'){
   assert.equal(args.p_user_id,uid);
   if(rows.length)return ok({ok:false,reason:'existing_history'});
   const expires=iso(clock+336*3600000);
   rows.push({id:'trial',user_id:uid,plan_code:'TRIAL_14D',status:'ACTIVE',source:'trial_complete_14d',started_at:iso(clock),trial_ends_at:expires});
   return ok({ok:true,plan_code:'TRIAL_14D',trial_ends_at:expires});
  }
  if(route==='apd_reserve_complete_checkout'){
   assert.equal(args.p_user_id,uid);
   if(session)return ok({ok:true,mode:'reuse',reference,checkout_url:checkoutUrl});
   session='reserved';return ok({ok:true,mode:'create',reference});
  }
  if(route==='apd_finalize_complete_checkout'){
   assert.equal(args.p_user_id,uid);assert.equal(args.p_reference,reference);assert.equal(args.p_url,checkoutUrl);
   session='ready';return ok({ok:true,duplicate:false});
  }
  if(route==='apd_apply_complete_approval'){
   assert.equal(args.p_reference,reference);assert.equal(args.p_amount,2000);assert.equal(session,'ready');
   if(reversed)return ok({ok:false,reason:'payment_under_review'});
   if(rows.some(r=>r.id==='paid'))return ok({ok:true,duplicate:true});
   rows.push({id:'paid',user_id:uid,plan_code:'COMPLETO',status:'ACTIVE',source:'mercadopago_checkout',started_at:iso(clock),current_period_ends_at:iso(clock+720*3600000)});
   return ok({ok:true,duplicate:false});
  }
  if(route==='apd_review_complete_payment'){
   assert.equal(args.p_reference,reference);assert.equal(args.p_disposition,'revoke');
   reversed=true;rows.find(r=>r.id==='paid').status='CANCELLED';return ok({ok:true,duplicate:false,disposition:'revoke'});
  }
  throw Error('Unexpected synthetic RPC');
 };
 const context=vm.createContext({
  URL,Request,Response,AbortSignal,Date:class extends Date{static now(){return clock;}},fetch:transport,
  supabaseSelect:async(_env,path)=>{
   if(path.startsWith('subscription_plans?'))return catalog.map(p=>({...p,is_active:active}));
   if(path.startsWith('user_subscriptions?')){assert.ok(path.includes(uid));return rows.map(r=>({...r}));}
   if(path.startsWith('users?')){assert.ok(path.includes(uid));return [user];}
   throw Error('Unexpected synthetic select');
  },
  getSessionUserByBearer:async()=>authenticated?user:null,
  json:(body,status=200)=>({body,status}),
  parseFechaFlexible:v=>new Date(v),
  parseMercadoPagoExternalReference:v=>({plan_code:v?.split(':')[1]}),
  apdLegacy_elegirSuscripcionVigente:()=>null,apdLegacy_isPlanActivo:()=>false,
  apdLegacy_getPlanPreset:()=>{throw Error('Unexpected legacy preset');},
  apdLegacy_resolverPlanUsuario:()=>({legacy:true}),apdLegacy_handlePlanes:()=>({legacy:true}),
  apdLegacy_ensureTrialIfNoSubscriptions:()=>({legacy:true}),apdLegacy_handleMercadoPagoCreateCheckoutLink:()=>({legacy:true}),
  apdLegacy_applyMercadoPagoPayment:()=>({legacy:true}),planPorCode:()=>{throw Error('Unexpected legacy fallback');},
  apdClaimCompleteTrialV1:claimCompleteTrial,apdCompleteCheckoutV1:completeCheckout,apdCommercialRpcV1:commercialRpc,apdApplyCompleteApprovalV1:applyCompleteApproval,
 },{codeGeneration:{strings:false,wasm:false}});
 // Bind transports explicitly; never allow host defaults to perform network I/O.
 context.apdClaimCompleteTrialV1=(e,id)=>claimCompleteTrial(e,id,transport);
 context.apdCommercialRpcV1=(e,n,a)=>commercialRpc(e,n,a,transport);
 context.apdApplyCompleteApprovalV1=(e,p)=>applyCompleteApproval(e,p,transport);
 vm.runInContext(core+'\n'+names.map(n=>extract(source,n)).join('\n'),context,{timeout:2000});
 const resolve=()=>context.resolverPlanUsuario(env,uid);
 const request=(plan='COMPLETO')=>new Request('https://fixture.invalid/api/mercadopago/create-checkout-link',{method:'POST',body:JSON.stringify({plan_code:plan})});
 active=false;
 assert.equal((await context.ensureTrialIfNoSubscriptions(env,uid)).legacy,true);
 assert.equal((await context.handlePlanes(env)).legacy,true);
 assert.equal(networkCalls,0);
 active=true;
 const plans=await context.handlePlanes(env);
 assert.equal(plans.status,200);assert.equal(JSON.stringify(plans.body.planes.map(p=>[p.code,p.price_ars,p.max_distritos,p.max_cargos])),JSON.stringify([['FREE',0,1,1],['COMPLETO',2000,5,10]]));
 assert.equal((await context.ensureTrialIfNoSubscriptions(env,uid)).created,true);
 assert.equal((await context.ensureTrialIfNoSubscriptions(env,uid)).created,false);
 let snapshot=await resolve();assert.equal(snapshot.subscription.plan_code,'TRIAL_14D');assert.equal(context.isPlanActivo(snapshot),true);
 const prefs={distrito_principal:'AVELLANEDA',otros_distritos:['QUILMES'],cargos:['MAT','FIS'],alertas_activas:true,alertas_whatsapp:true};
 clock+=336*3600000;
 snapshot=await resolve();assert.equal(snapshot.subscription.plan_code,'FREE');assert.equal(context.isPlanActivo(snapshot),true);
 assert.equal(effectiveCommercialPreferences(prefs,snapshot,true).cargos.length,1);
 authenticated=false;assert.equal((await context.handleMercadoPagoCreateCheckoutLink(request(),env)).status,401);assert.equal(providerCalls,0);
 authenticated=true;assert.equal((await context.handleMercadoPagoCreateCheckoutLink(request(),env)).body.checkout_url,checkoutUrl);
 assert.equal((await context.handleMercadoPagoCreateCheckoutLink(request(),env)).body.reused,true);assert.equal(providerCalls,1);
 const payment={id:700,external_reference:reference,live_mode:true,status:'approved',transaction_amount:2000,currency_id:'ARS',transaction_amount_refunded:0,date_approved:iso(clock)};
 assert.equal((await context.applyMercadoPagoPayment(env,payment)).processed,true);
 assert.equal((await context.applyMercadoPagoPayment(env,payment)).duplicate,true);
 snapshot=await resolve();assert.equal(snapshot.subscription.plan_code,'COMPLETO');assert.equal(context.isPlanActivo(snapshot),true);
 assert.equal(effectiveCommercialPreferences(prefs,snapshot,true).cargos.length,2);
 assert.equal((await context.applyMercadoPagoPayment(env,{...payment,status:'refunded',transaction_amount_refunded:2000})).disposition,'revoke');
 assert.equal((await context.applyMercadoPagoPayment(env,payment)).processed,false);
 snapshot=await resolve();assert.equal(snapshot.subscription.plan_code,'FREE');assert.equal(prefs.cargos.length,2);
 return {passed:true,functions:names.length,syntheticProviderCalls:providerCalls,syntheticRpcCalls:networkCalls,productionWrites:0,fullWorkerExecuted:false};
}
