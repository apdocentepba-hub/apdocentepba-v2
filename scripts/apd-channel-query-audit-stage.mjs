// APD-014 offline candidate composed with expiry/email guards.
import assert from 'node:assert/strict';
import {stageEmailDeliveryAudit} from './apd-email-delivery-audit-stage.mjs';
export function uniqueWhatsAppAccount(rows,digits,variants,alternate){
 if(!Array.isArray(rows)||rows.length>=20||!digits)return null;
 const matches=rows.filter(row=>row?.activo===true&&typeof row.id==='string'&&row.id&&variants(row.celular||'').some(v=>v===digits||v===alternate(digits)));
 return matches.length===1?matches[0]:null;
}
export function stageChannelQueryAudit(source){
 const src=stageEmailDeliveryAudit(source).candidate;
 const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Unexpected anchor '+a);return s.replace(a,()=>b);};
 const names=['findUserByWhatsAppNumber','handleTelegramWebhook','handleWhatsAppWebhook'];
 const sections=names.map(name=>{
  const start=src.indexOf('async function '+name+'('),end=src.indexOf('\n__name('+name+',',start);
  assert.ok(start>=0&&end>start,name);
  const old=src.slice(start,end);assert.ok(old.endsWith('\n}'),name);
  return {old,next:old};
 });
 const [identity,tg,wa]=sections;
 identity.next=once(identity.old,'return candidates.find((row) => {\n    const variants = whatsappTestDestinations(row?.celular || "");\n    return variants.includes(digits) || variants.includes(whatsappAllowedListVariant(digits));\n  }) || null;','return apdUniqueWhatsAppAccountAuditV1(candidates,digits,whatsappTestDestinations,whatsappAllowedListVariant);');
 tg.next=once(tg.old,'alerts = await loadTelegramStoredAlerts(env, user.id, safeLimit);','alerts = (await loadTelegramStoredAlerts(env, user.id, safeLimit)).filter(item=>apdStoredAbcOfferOpenAuditV1(item));');
 tg.next=once(tg.next,'alerts = await loadTelegramLiveAlertsWithTimeout(env, user.id, 12e3);','alerts = (await loadTelegramLiveAlertsWithTimeout(env, user.id, 12e3)).filter(item=>apdStoredAbcOfferOpenAuditV1(item));');
 tg.next=once(tg.next,'const reply = buildTelegramQueryDigest(visibleAlertsForRender);','if (!visibleAlertsForRender.length || !visibleBaseAlerts.every(item=>apdStoredAbcOfferOpenAuditV1(item)) || !visibleAlertsForRender.every(item=>apdStoredAbcOfferOpenAuditV1(item))) return json2({ok:true,delivered:false,reason:"deadline_unverified_or_reached",channel_mode:"query_only"});\n    const reply = buildTelegramQueryDigest(visibleAlertsForRender);');
 wa.next=once(wa.old,'const storedAlerts = await waLoadStoredAlerts(env, user.id, 50);','const storedAlerts = (await waLoadStoredAlerts(env, user.id, 50)).filter(item=>apdStoredAbcOfferOpenAuditV1(item));');
 wa.next=once(wa.next,'if (!visibleAlertsForRender.length) {','if (!visibleAlertsForRender.length || !visibleBaseAlerts.every(item=>apdStoredAbcOfferOpenAuditV1(item)) || !visibleAlertsForRender.every(item=>apdStoredAbcOfferOpenAuditV1(item))) {');
 wa.next=once(wa.next,'for (let i = 0; i < visibleAlertsForRender.length; i++) {','for (let i = 0; i < visibleAlertsForRender.length; i++) {\n            if (!apdStoredAbcOfferOpenAuditV1(visibleAlertsForRender[i])) { failedParts += 1; continue; }');
 wa.next=once(wa.next,'if (sendResult?.ok !== false) {','if (sendResult?.ok === true) {');
 wa.next=once(wa.next,'WhatsApp queda reservado para el plan Insigne.','WhatsApp requiere acceso habilitado en tu plan.');
 const prefix=uniqueWhatsAppAccount.toString().replace('function uniqueWhatsAppAccount(','function apdUniqueWhatsAppAccountAuditV1(')+'\n';
 let candidate=src;for(const p of sections)candidate=once(candidate,p.old,p.next);
 candidate=prefix+candidate;
 let reverse=candidate.slice(prefix.length);for(const p of sections)reverse=once(reverse,p.next,p.old);
 assert.equal(reverse,src);
 return {candidate,deployable:false,unrelatedBytesPreserved:true};
}
