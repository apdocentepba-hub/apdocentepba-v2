import assert from 'node:assert/strict';
// Match only the reviewed legacy schedule handler; unknown deployed variants must stop.
export function apdScheduleAllowedAuditV1(resolved,id,active,now){
 const norm=v=>String(v??'').trim().toUpperCase();
 const sub=resolved?.subscription,code=norm(sub?.plan_code),plan=norm(resolved?.plan?.code);
 if(active!==true||!sub||!['ACTIVE','AUTHORIZED','APPROVED'].includes(norm(sub.status)))return false;
 if(['COMPLETO','TRIAL_14D'].includes(code)){
  const end=code==='TRIAL_14D'?sub.trial_ends_at:sub.current_period_ends_at;
  const start=Date.parse(sub.started_at),expiry=Date.parse(end);
  return sub.user_id===id&&norm(sub.source)!==''&&norm(sub.source)!=='FALLBACK_FRONTEND'&&plan===code&&typeof sub.started_at==='string'&&typeof end==='string'&&Number.isFinite(now)&&Number.isFinite(start)&&Number.isFinite(expiry)&&start<=now&&now<expiry;
 }
 const legacy=['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'];
 return legacy.includes(code)&&(!plan||legacy.includes(plan))&&norm(sub.source)!=='FALLBACK_FRONTEND'&&(sub.user_id==null||sub.user_id===id);
}
export function stageScheduleEntitlementAudit(source){
 const marker='async function handleAccountScheduleSecureV1(request,env){';
 const route='if (path === API_URL_PREFIX3 + "/account/schedule") {';
 const old="return isPlanActivo(resolved)&&['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'].includes(String(resolved?.subscription?.plan_code||'').toUpperCase())&&['ACTIVE','AUTHORIZED','APPROVED'].includes(String(resolved?.subscription?.status||'').toUpperCase());";
 const replacement='return apdScheduleAllowedAuditV1(resolved,id,isPlanActivo(resolved),Date.now());';
 assert.ok(!source.includes('apdScheduleAllowedAuditV1'),'Already staged');
 assert.equal(source.split(marker).length,2,'Unknown schedule handler');
 assert.equal(source.split(route).length,2,'Unknown schedule route');
 assert.equal(source.split(old).length,2,'Unknown schedule entitlement');
 const start=source.indexOf(marker),stop=source.indexOf('\n}',start);
 assert.ok(stop>start&&source.indexOf(old)>start&&source.indexOf(old)<stop,'Entitlement outside reviewed handler');
 const prefix=apdScheduleAllowedAuditV1.toString()+'\n';
 const candidate=prefix+source.replace(old,replacement);
 assert.equal(candidate.slice(prefix.length).replace(replacement,old),source);
 return {candidate,unrelatedBytesPreserved:true,deployable:false};
}
