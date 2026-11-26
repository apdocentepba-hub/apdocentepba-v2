// Cumulative checkout/catalog candidate. Never deploy directly.
import assert from 'node:assert/strict';
import {recoverCompletePreference} from './apd-commercial-recover-checkout.mjs';
import {completeCheckout} from './apd-commercial-checkout.mjs';

export async function commercialRpc(env,name,args,transport=fetch){
 if(!['apd_reserve_complete_checkout','apd_finalize_complete_checkout'].includes(name))throw Error('Unknown commercial RPC');
 const origin=new URL(env.SUPABASE_URL);
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error('Invalid database endpoint');
 const key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(typeof key!=='string'||!key.trim())throw Error('Database credential unavailable');
 const response=await transport(new URL('/rest/v1/rpc/'+name,origin),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args)});
 if(!response.ok)throw Error('Checkout reconciliation unavailable');
 const result=await response.json();
 if(typeof result?.ok!=='boolean')throw Error('Invalid RPC result');
 return result;
}
export function stageCommercialCheckout(source){
 const names=['handleMercadoPagoCreateCheckoutLink','handlePlanes'];
 const originals=names.map(name=>{
  const matches=[...source.matchAll(new RegExp('^async function '+name+'\\([^\\n]*\\) \\{','gm'))];
  assert.equal(matches.length,1,'Checkout/catalog anchor changed: '+name);
  const start=matches[0].index,end=source.indexOf('\n__name('+name+',',start);
  assert.ok(end>start,'Function boundary not verified');
  const old=source.slice(start,end);
  assert.ok(old.endsWith('\n}'),'Invalid function boundary');
  return {name,old,renamed:old.replace('function '+name+'(','function apdLegacy_'+name+'(')};
 });
 assert.match(originals[0].old,/createMercadoPagoCheckoutPreference/);
 assert.match(originals[0].old,/mercadopago_checkout_sessions/);
 assert.match(originals[1].old,/subscription_plans/);
 assert.ok(source.includes('getSessionUserByBearer'),'Session gate missing');
 assert.ok(!source.includes('apdCommercialRpcV1'),'Already staged');
 const prefix=recoverCompletePreference.toString().replace(/^async function recoverCompletePreference\(/,'async function apdRecoverCompletePreferenceV1(')+'\n'+commercialRpc.toString().replace(/^async function commercialRpc\(/,'async function apdCommercialRpcV1(')+'\n'+completeCheckout.toString().replace(/^async function completeCheckout\(/,'async function apdCompleteCheckoutV1(')+'\n';
 const catalog='subscription_plans?select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,is_active,public_visible,sort_order,mercadopago_plan_id,feature_flags';
 const wrappers={
 handlePlanes:'async function handlePlanes(env) {\n try {\n const catalog=await supabaseSelect(env,"'+catalog+'");\n if(!apdCommercialCoreV1.ready(catalog))return await apdLegacy_handlePlanes(env);\n const planes=["FREE","COMPLETO"].map(code=>normalizePlanOut(catalog.find(p=>p.code===code)));\n return json({ok:true,commercial_model:"free_complete_v1",trial_days:14,founder_price_policy:{active:false},planes});\n }catch{return json({ok:false,message:"No se pudo verificar el catálogo"},503);}\n}',
 handleMercadoPagoCreateCheckoutLink:'async function handleMercadoPagoCreateCheckoutLink(request, env) {\n const body=await request.clone().json().catch(()=>null);\n if(!body||typeof body!=="object")return json({ok:false,message:"Solicitud inválida"},400);\n const target=String(body.plan_code||"").trim().toUpperCase();\n try {\n const catalog=await supabaseSelect(env,"'+catalog+'");\n const ready=apdCommercialCoreV1.ready(catalog);\n if(!ready && target!=="COMPLETO" && target!=="FREE" && target!=="TRIAL_14D")return await apdLegacy_handleMercadoPagoCreateCheckoutLink(request,env);\n if(!ready||target!=="COMPLETO")return json({ok:false,message:"Plan no disponible para una nueva contratación"},409);\n const user=await getSessionUserByBearer(env,request);\n if(!user?.id)return json({ok:false,message:"No autenticado"},401);\n const result=await apdCompleteCheckoutV1({user,body,catalogReady:true,reserve:id=>apdCommercialRpcV1(env,"apd_reserve_complete_checkout",{p_user_id:id}),finalize:(id,reference,url,preference)=>apdCommercialRpcV1(env,"apd_finalize_complete_checkout",{p_user_id:id,p_reference:reference,p_url:url,p_preference_id:preference}),recoverPreference:(id,reference)=>apdRecoverCompletePreferenceV1({env,userId:id,reference,finalize:(owner,ref,url,pref)=>apdCommercialRpcV1(env,"apd_finalize_complete_checkout",{p_user_id:owner,p_reference:ref,p_url:url,p_preference_id:pref})}),createPreference:context=>{if(String(env.MERCADOPAGO_CURRENCY_ID||"ARS")!=="ARS")throw Error("Invalid currency");return createMercadoPagoCheckoutPreference(env,context);},webhookUrl:env.MERCADOPAGO_WEBHOOK_URL||new URL("/api/mercadopago/webhook",request.url).toString()});\n return json(result.body,result.status);\n }catch{return json({ok:false,message:"Contratación no confirmada"},503);}\n}'
 };
 let candidate=source;
 for(const r of originals){r.fresh=r.renamed+'\n'+wrappers[r.name];candidate=candidate.replace(r.old,()=>r.fresh);}
 candidate=prefix+candidate;
 let reversed=candidate.slice(prefix.length);
 for(const r of originals)reversed=reversed.replace(r.fresh,()=>r.old);
 assert.equal(reversed,source,'Unrelated source drift');
 return {candidate,functions:names,unrelatedBytesPreserved:true,deployable:false};
}
