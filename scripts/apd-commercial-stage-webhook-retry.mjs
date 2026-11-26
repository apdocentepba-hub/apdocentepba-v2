import assert from 'node:assert/strict';
export function stageCommercialWebhookRetry(source){
 const changes=[],original=source;
 const replaceWithin=(name,old,fresh)=>{
  const matches=[...source.matchAll(new RegExp('^async function '+name+'\\([^\\n]*\\) \\{','gm'))];
  assert.equal(matches.length,1,'Webhook anchor '+name);
  const start=matches[0].index,end=source.indexOf('\n__name('+name+',',start);
  assert.ok(end>start);
  const fn=source.slice(start,end);
  assert.equal(fn.split(old).length,2,'Webhook exact anchor '+name);
  const next=fn.replace(old,()=>fresh);
  source=source.slice(0,start)+next+source.slice(end);
  changes.push({fn,next});
 };
 assert.ok(source.includes('apdVerifyMercadoPagoWebhookV1(request, payload, env)'),'Missing authentication');
 replaceWithin('applyMercadoPagoPayment','if(parsed.plan_code==="COMPLETO")return await apdApplyCompleteApprovalV1(env,payment);','if(parsed.plan_code==="COMPLETO")return {...await apdApplyCompleteApprovalV1(env,payment),commercial:true};');
 replaceWithin('handleMercadoPagoWebhook','return json({ ok: true, sync });', 'if (sync?.reason==="sync_error" || sync?.reason==="missing_access_token" || sync?.reason==="provider_payment_id_mismatch" || (sync?.commercial===true && ["release_disabled","unknown_checkout","checkout_not_eligible","account_unavailable"].includes(sync.reason))) return json({ok:false,retry:true,message:"Conciliación pendiente"},503);\n  return json({ ok: true, sync });');
 replaceWithin('fetchMercadoPagoPayment','headers: {','redirect:"error",\n    signal:AbortSignal.timeout(10000),\n    headers: {');
 let reversed=source;for(const c of changes.toReversed())reversed=reversed.replace(c.next,()=>c.fn);
 assert.equal(reversed,original,'Unrelated source modified');
 return {candidate:source,unrelatedBytesPreserved:true,retryable:true,deployable:false};
}
