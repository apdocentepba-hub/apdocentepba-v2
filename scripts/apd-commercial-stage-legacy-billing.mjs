import assert from 'node:assert/strict';
// Commercial accounts must never activate legacy recurring billing or receive
// obsolete expiry notices. Existing legacy cancellation remains unchanged.
export function stageCommercialLegacyBilling(source){
 const original=source,changes=[];
 const within=(name,edit)=>{
  const hits=[...source.matchAll(new RegExp('^async function '+name+'\\([^\\n]*\\) \\{','gm'))];assert.equal(hits.length,1,'Legacy billing owner '+name);
  const a=hits[0].index,b=source.indexOf('\n__name('+name+',',a);assert.ok(b>a);
  const old=source.slice(a,b),next=edit(old);assert.notEqual(old,next);
  source=source.slice(0,a)+next+source.slice(b);changes.push({old,next});
 };
 const swap=(s,a,b)=>{assert.equal(s.split(a).length,2,'Legacy billing anchor '+a);return s.replace(a,()=>b);};
 within('handleSubscriptionEnableAutoRenew',fn=>{
  assert.match(fn,/arMercadoPagoRequest/);
  return swap(fn,'const current = await arGetCurrentPaidSubscription(env, userId);',[
   'const commercialCatalog=await supabaseSelect(env,"subscription_plans?select=code,price_ars,trial_days,max_distritos,max_cargos,is_active");',
   '  if(apdCommercialCoreV1.ready(commercialCatalog))return json({ok:false,message:"Las nuevas renovaciones automáticas no están disponibles. Tu acceso vigente se conserva."},409);',
   '  const current = await arGetCurrentPaidSubscription(env, userId);',
   '  if(["FREE","COMPLETO","TRIAL_14D"].includes(String(current?.plan_code||"").toUpperCase()))return json({ok:false,message:"Este plan no tiene renovación automática."},409);'
  ].join('\n'));
 });
 within('apdProcessExpiryNotices',fn=>{
  assert.match(fn,/apdSendExpiryNoticeOnce/);
  const gate=[...fn.matchAll(/if \(String\(env\.APD_EXPIRY_NOTICES_ENABLED \|\| ""\)\.toLowerCase\(\) !== "true"\) return;/g)];
  assert.equal(gate.length,1,'Expiry notice feature gate');
  return swap(fn,gate[0][0],gate[0][0]+'\n  const commercialCatalog=await supabaseSelect(env,"subscription_plans?select=code,price_ars,trial_days,max_distritos,max_cargos,is_active");\n  if(apdCommercialCoreV1.ready(commercialCatalog))return; // New commercial notice copy requires separate approval.');
 });
 let reversed=source;for(const c of changes.toReversed())reversed=reversed.replace(c.next,()=>c.old);assert.equal(reversed,original);
 return {candidate:source,legacyAutoRenewBlocked:true,obsoleteExpiryNoticeSuppressed:true,cancellationPreserved:true,unrelatedBytesPreserved:true,deployable:false};
}
