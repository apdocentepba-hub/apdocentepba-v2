// Stage on the pinned live bytes, retaining the original legacy payment function.
import assert from 'node:assert/strict';
import {applyCompleteApproval} from './apd-commercial-payment-adapter.mjs';
export function stageCommercialPayment(source){
 const name='applyMercadoPagoPayment';
 const matches=[...source.matchAll(/^async function applyMercadoPagoPayment\(env, payment\) \{/gm)];
 assert.equal(matches.length,1,'Payment function anchor changed');
 const start=matches[0].index,end=source.indexOf('\n__name('+name+',',start);
 assert.ok(end>start,'Missing payment function boundary');
 const old=source.slice(start,end);
 assert.ok(old.endsWith('\n}'),'Unexpected function boundary');
 for(const required of ['parseMercadoPagoExternalReference','findCheckoutSessionByExternalReference','findSubscriptionByExternalReference','supabaseInsert'])assert.ok(old.includes(required),'Legacy payment anchor missing');
 const sync=[...source.matchAll(/const payment = await fetchMercadoPagoPayment\(env, resourceId\);\s*return await applyMercadoPagoPayment\(env, payment\);/g)];
 assert.equal(sync.length,1,'Verified provider fetch anchor changed');
 assert.ok(source.includes('apdVerifyMercadoPagoWebhookV1(request, payload, env)'),'Webhook verification anchor missing');
 const prefix=applyCompleteApproval.toString().replace(/^async function applyCompleteApproval\(/,'async function apdApplyCompleteApprovalV1(')+'\n';
 assert.ok(!source.includes('apdApplyCompleteApprovalV1'),'Already staged');
 const fresh=old.replace('function '+name+'(','function apdLegacy_'+name+'(')+
 '\nasync function applyMercadoPagoPayment(env, payment) {\n const parsed=parseMercadoPagoExternalReference(payment?.external_reference);\n if(parsed.plan_code==="COMPLETO")return await apdApplyCompleteApprovalV1(env,payment);\n return await apdLegacy_applyMercadoPagoPayment(env,payment);\n}';
 const syncOld=sync[0][0],syncNew=syncOld.replace('return await applyMercadoPagoPayment','if (parseMercadoPagoExternalReference(payment?.external_reference).plan_code==="COMPLETO" && String(payment?.id)!==String(resourceId)) return {processed:false,reason:"provider_payment_id_mismatch"};\n  return await applyMercadoPagoPayment');
 const candidate=prefix+source.replace(old,()=>fresh).replace(syncOld,()=>syncNew);
 assert.equal(candidate.slice(prefix.length).replace(fresh,()=>old).replace(syncNew,()=>syncOld),source,'Unrelated bytes changed');
 return {candidate,unrelatedBytesPreserved:true,legacyPreserved:true,approvalOnly:true,deployable:false};
}
