// APD-002/016. Verified server plan gate; no client supplied entitlement.
import assert from 'node:assert/strict';
import {stageChannelQueryAudit} from './apd-channel-query-audit-stage.mjs';
export function channelAllowedFromResolved(resolved,userId,channel,active,now=Date.now()){
 const sub=resolved?.subscription,plan=resolved?.plan;
 const norm=v=>String(v??'').trim().toUpperCase();
 const code=norm(sub?.plan_code),status=norm(sub?.status);
 if(!userId||sub?.user_id!==userId||!code||norm(plan?.code)!==code||!Number.isFinite(now)||!['telegram','whatsapp'].includes(channel))return false;
 if(['fallback_frontend','catalogo_default'].includes(sub.source)||!['ACTIVE','AUTHORIZED','APPROVED','TRIALING'].includes(status))return false;
 if(code==='FREE')return sub.source==='apd_free_verified'&&status==='ACTIVE'&&active(resolved)===true&&channel==='telegram';
 if(code==='COMPLETO'||code==='TRIAL_14D'){
  const start=Date.parse(sub.started_at),end=Date.parse(code==='TRIAL_14D'?sub.trial_ends_at:sub.current_period_ends_at);
  return ['ACTIVE','AUTHORIZED','APPROVED'].includes(status)&&Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&now<end&&active(resolved)===true;
 }
 const legacy=['TRIAL_7D','BASIC','PLUS','PREMIUM','PRO','INSIGNE','SIGNATURE','PLUS_ANUAL','PREMIUM_ANUAL','PRO_ANUAL','INSIGNE_ANUAL','SIGNATURE_ANUAL','BASIC_ANUAL'];
 if(!legacy.includes(code)||active(resolved)!==true)return false;
 const indefinite=code==='INSIGNE'&&sub.source==='manual_admin_grant'&&status==='ACTIVE'&&!sub.current_period_ends_at;
 if(!indefinite){
  const end=Date.parse(code==='TRIAL_7D'||status==='TRIALING'?sub.trial_ends_at:sub.current_period_ends_at);
  if(!Number.isFinite(end)||end<=now)return false;
 }
 return channel==='telegram'||(plan.feature_flags?.whatsapp===true||code==='INSIGNE');
}
export function stageChannelEntitlementAudit(source){
 const src=stageChannelQueryAudit(source).candidate;
 const changes=[['resolveTelegramEntitlement','allowed: true,','allowed: apdChannelAllowedAuditV1(resolved,userId,"telegram",isPlanActivo),'],['resolveWhatsAppEntitlement','allowed: !!(flags?.whatsapp || planCode === "INSIGNE"),','allowed: apdChannelAllowedAuditV1(resolved,userId,"whatsapp",isPlanActivo),']];
 let next=src;
 for(const [name,old,replacement] of changes){
  const start=next.indexOf('async function '+name+'('),end=next.indexOf('\n__name('+name+',',start);
  assert.ok(start>=0&&end>start);
  const fn=next.slice(start,end);assert.equal(fn.split(old).length,2,name);
  next=next.slice(0,start)+fn.replace(old,replacement)+next.slice(end);
 }
 let reversed=next;for(const [,old,replacement] of changes)reversed=reversed.replace(replacement,old);
 assert.equal(reversed,src);
 return {candidate:channelAllowedFromResolved.toString().replace('function channelAllowedFromResolved(','function apdChannelAllowedAuditV1(')+'\n'+next,deployable:false,unrelatedBytesPreserved:true};
}
