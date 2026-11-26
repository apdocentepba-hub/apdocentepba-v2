import assert from 'node:assert/strict';
// Pass the verified server-side entitlement through all rich-channel render paths.
export function stageCommercialPidChannels(source){
 const original=source,changes=[];
 const swap=(old,next)=>{
  assert.equal(source.split(old).length,2,'PID channel anchor changed');
  source=source.replace(old,()=>next);changes.push({old,next});
 };
 const emailPaths=[['initialEmailPlanCode','resolvedPlanForInitialEmail'],['emailPlanCode','resolvedPlanForEmail']];
 for(const [code,resolved] of emailPaths){
  // The exact active source can omit a redundant visibility calculation, but
  // all actual calls with the old code must be replaced.
  const calls=[...source.matchAll(new RegExp('canShowPidForPlan\\(\\s*'+code+'\\s*\\)','g'))];
  assert.ok(calls.length<=1,'Duplicate PID visibility calculation');
  for(const c of calls)swap(c[0],'canShowPidForPlan('+resolved+')');
  const renders=[...source.matchAll(new RegExp('applyPidVisibilityToAlerts\\(\\s*([\\w$]+)\\s*,\\s*'+code+'\\s*\\)','g'))];
  assert.equal(renders.length,1,'PID email rendering anchor '+code);
  swap(renders[0][0],'applyPidVisibilityToAlerts('+renders[0][1]+', '+resolved+')');
  assert.ok(!new RegExp('canShowPidForPlan\\(\\s*'+code+'\\s*\\)').test(source),'Unconverted visibility');
 }
 for(const name of ['resolveTelegramEntitlement','resolveWhatsAppEntitlement']){
  const m=[...source.matchAll(new RegExp('^async function '+name+'\\([^\\n]*\\) \\{','gm'))];assert.equal(m.length,1);
  const start=m[0].index,end=source.indexOf('\n__name('+name+',',start);assert.ok(end>start);
  const old=source.slice(start,end);
  assert.equal(old.split('const resolved = await resolverPlanUsuario(env, userId);').length,2);
  assert.equal(old.split('return {').length,2);
  const next=old.replace('return {','return {\n    pid_visible: canShowPidForPlan(resolved),');
  swap(old,next);
 }
 swap('visibleAlerts,\n      entitlement?.plan_code\n    );','visibleAlerts,\n      entitlement\n    );');
 swap('visibleAlerts,\n            entitlement?.plan_code\n          );','visibleAlerts,\n            entitlement\n          );');
 swap('return getPlanCodeValue(value) === "INSIGNE" || (typeof value==="object" && apdCommercialNewToolsV1(value));','return getPlanCodeValue(value) === "INSIGNE" || (typeof value==="object" && value!==null && (apdCommercialNewToolsV1(value) || (value.pid_visible===true && ["COMPLETO","TRIAL_14D"].includes(getPlanCodeValue(value)))));');
 let reversed=source;for(const c of changes.toReversed())reversed=reversed.replace(c.next,()=>c.old);
 assert.equal(reversed,original,'Unrelated source changed');
 return {candidate:source,channels:3,unrelatedBytesPreserved:true,deployable:false};
}
