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
 const markers=[...source.matchAll(/^async function handleAccountScheduleSecureV1\(request,\s*env\)\s*\{/gm)];
 assert.equal(markers.length,1,'Unknown schedule handler');
 const marker=markers[0][0];
 const route='if (path === API_URL_PREFIX3 + "/account/schedule") {';
 const old="return isPlanActivo(resolved)&&['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'].includes(String(resolved?.subscription?.plan_code||'').toUpperCase())&&['ACTIVE','AUTHORIZED','APPROVED'].includes(String(resolved?.subscription?.status||'').toUpperCase());";
 const replacement='return apdScheduleAllowedAuditV1(resolved,id,isPlanActivo(resolved),Date.now());';
 assert.ok(!source.includes('apdScheduleAllowedAuditV1'),'Already staged');
 assert.equal(source.split(marker).length,2,'Unknown schedule handler');
 assert.equal(source.split(route).length,2,'Unknown schedule route');
 const start=source.indexOf(marker),stop=source.indexOf('\n}',start);
 assert.ok(stop>start,'Unknown schedule boundary');
 const fn=source.slice(start,stop);
 // Match the precise commercial extension emitted by stageCommercialTools; no arbitrary broadening.
 const commercial=/return\s+\(isPlanActivo\(resolved\)\s*&&\s*\[\s*["']INSIGNE["']\s*,\s*["']INSIGNE_ANUAL["']\s*,\s*["']SIGNATURE["']\s*,\s*["']SIGNATURE_ANUAL["']\s*\]\.includes\(String\(resolved\?\.subscription\?\.plan_code\s*\|\|\s*["']["']\)\.toUpperCase\(\)\)\s*&&\s*\[\s*["']ACTIVE["']\s*,\s*["']AUTHORIZED["']\s*,\s*["']APPROVED["']\s*\]\.includes\(String\(resolved\?\.subscription\?\.status\s*\|\|\s*["']["']\)\.toUpperCase\(\)\)\s*\|\|\s*apdCommercialNewToolsV1\(resolved\)\);/g;
 const matches=[...fn.matchAll(commercial)];
 const reviewed=fn.includes(old)?old:(matches.length===1?matches[0][0]:null);
 assert.ok(reviewed&&source.split(reviewed).length===2,'Unknown schedule entitlement');
 const prefix=apdScheduleAllowedAuditV1.toString()+'\n';
 const candidate=prefix+source.replace(reviewed,replacement);
 assert.equal(candidate.slice(prefix.length).replace(replacement,reviewed),source);
 return {candidate,unrelatedBytesPreserved:true,deployable:false};
}
