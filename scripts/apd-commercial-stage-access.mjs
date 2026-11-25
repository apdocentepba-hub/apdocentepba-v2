// Exact-source candidate only. Do not deploy until checkout and channel gates are verified.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {commercialAccessCore} from './apd-commercial-access-core.mjs';
export function stageCommercialAccess(source,policySource=fs.readFileSync(new URL('./apd-commercial-policy.mjs',import.meta.url),'utf8')){
 const planNames=['getPlanPreset','elegirSuscripcionVigente','isPlanActivo','resolverPlanUsuario'];
 const originals=[];
 for(const name of planNames){
  const matches=[...source.matchAll(new RegExp('^(?:async )?function '+name+'\\([^\\n]*\\) \\{','gm'))];
  assert.equal(matches.length,1,'Function anchor mismatch: '+name);
  const start=matches[0].index,end=source.indexOf('\n__name('+name+',',start);
  assert.ok(end>start,'Unverified function boundary: '+name);
  const old=source.slice(start,end);
  assert.ok(old.endsWith('\n}'),'Invalid function boundary: '+name);
  originals.push({name,old,renamed:old.replace('function '+name+'(','function apdLegacy_'+name+'(')});
 }
 const checks={getPlanPreset:/TRIAL_7D/,elegirSuscripcionVigente:/trial_ends_at/,isPlanActivo:/current_period_ends_at/,resolverPlanUsuario:/user_subscriptions/};
 for(const r of originals)assert.match(r.old,checks[r.name]);
 assert.ok(!source.includes('apdCommercialCoreV1'),'Already staged');
 assert.ok(!/^import /m.test(policySource),'Unexpected policy dependency');
 const coreCode=commercialAccessCore.toString();
 const prefix='const apdCommercialCoreV1=(()=>{\n'+policySource.replace(/^export /gm,'')+'\n'+coreCode+'\nreturn commercialAccessCore({resolveAccess:resolveCommercialAccess,offer:APD_OFFER,legacyChoose:rows=>apdLegacy_elegirSuscripcionVigente(rows),legacyActive:r=>apdLegacy_isPlanActivo(r),normalizePlan:p=>normalizePlanOut(p),normalizeSub:s=>normalizeSubscriptionOut(s),legacyFallback:c=>planPorCode(c)});\n})();\n';
 const wrappers={
 getPlanPreset:`function getPlanPreset(code) { return apdCommercialCoreV1.preset(code)||apdLegacy_getPlanPreset(code); }`,
 elegirSuscripcionVigente:`function elegirSuscripcionVigente(rows) {
  if(!Array.isArray(rows)||!rows.some(r=>['FREE','COMPLETO','TRIAL_14D'].includes(String(r?.plan_code||'').trim().toUpperCase())))return apdLegacy_elegirSuscripcionVigente(rows);
  return apdCommercialCoreV1.choose(rows,Date.now());
 }`,
 isPlanActivo:`function isPlanActivo(resolved) { return apdCommercialCoreV1.isActive(resolved,Date.now()); }`,
 resolverPlanUsuario:`async function resolverPlanUsuario(env,userId) {
  const catalog=await supabaseSelect(env,"subscription_plans?select=code,nombre,descripcion,price_ars,trial_days,max_distritos,max_cargos,is_active,public_visible,sort_order,mercadopago_plan_id,feature_flags");
  if(!apdCommercialCoreV1.ready(catalog))return await apdLegacy_resolverPlanUsuario(env,userId);
  const [rows,users]=await Promise.all([
   supabaseSelect(env,"user_subscriptions?user_id=eq."+encodeURIComponent(userId)+"&order=created_at.desc&select=id,user_id,plan_code,status,source,started_at,trial_ends_at,current_period_ends_at,mercadopago_preapproval_id"),
   supabaseSelect(env,"users?id=eq."+encodeURIComponent(userId)+"&select=id,activo&limit=2")
  ]);
  if(!Array.isArray(users)||users.length!==1||users[0].id!==userId)throw Error("Account not verified");
  return apdCommercialCoreV1.resolve({catalog,rows,account:users[0],now:Date.now()});
 }`
 };
 let candidate=source;
 for(const r of originals){r.fresh=r.renamed+'\n'+wrappers[r.name];candidate=candidate.replace(r.old,()=>r.fresh);}
 candidate=prefix+candidate;
 let reverse=candidate.slice(prefix.length);
 for(const r of originals)reverse=reverse.replace(r.fresh,()=>r.old);
 assert.equal(reverse,source,'Unrelated code drift');
 // Inventory hardcoded plan references still requiring independent route-by-route review.
 const references=[...source.matchAll(/^([^\n]*\b(?:INSIGNE|TRIAL_7D)\b[^\n]*)$/gm)].map(m=>m.index);
 const declarations=[...source.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)\(/gm)];
 const pending={};
 for(const position of references){
  const owner=declarations.findLast(m=>m.index<=position)?.[1]||'top_level';
  pending[owner]=(pending[owner]||0)+1;
 }
 return {candidate,functions:planNames,unrelatedBytesPreserved:true,remainingPlanReferences:pending,deployable:false};
}
