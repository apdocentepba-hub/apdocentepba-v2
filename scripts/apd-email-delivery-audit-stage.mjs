// APD-013 offline candidate; compose after APD-012, no provider calls.
import assert from 'node:assert/strict';
import {abcOfferDeadlineAudit,stageAbcExpiryAudit} from './apd-abc-expiry-audit-stage.mjs';
export function storedAbcOfferOpen(item,now=Date.now(),check=abcOfferDeadlineAudit){
 if(!item||typeof item!=='object'||!Number.isFinite(now))return false;
 const pending=[{row:item,depth:0}],seen=new Set(),states=[],deadlines=[];
 while(pending.length){
  const {row,depth}=pending.pop();
  if(!row||typeof row!=='object'||seen.has(row))continue;
  if(depth>32||seen.size>=128)return false;
  seen.add(row);
  for(const k of ['estado','estado_oferta','estado_actual','estado_raw']){
   const state=String(row[k]??'').trim().toUpperCase();
   if(state)states.push(state);
  }
  for(const k of ['finoferta','fecha_cierre_raw']){
   if(String(row[k]??'').trim())deadlines.push(String(row[k]).trim());
  }
  for(const k of ['raw','offer_payload'])if(row[k]&&typeof row[k]==='object')pending.push({row:row[k],depth:depth+1});
 }
 return states.length>0&&states.every(s=>s==='PUBLICADA')&&deadlines.length>0&&deadlines.every(d=>check({estado:'PUBLICADA',finoferta:d},now));
}
export function digestReservationConfirmed(key,reservation){
 return typeof key==='string'&&!!key.trim()&&reservation?.ok===true&&reservation?.reserved===true&&reservation?.duplicate===false&&reservation?.dedupe_key===key&&typeof reservation?.id==='string'&&!!reservation.id.trim();
}
export function stageEmailDeliveryAudit(source){
 const first=stageAbcExpiryAudit(source);
 const src=first.candidate;
 const from=src.indexOf('async function runEmailAlertsSweep('),to=src.indexOf('\n__name(runEmailAlertsSweep,',from);
 assert.ok(from>=0&&to>from);
 const old=src.slice(from,to);
 assert.ok(old.endsWith('\n}'));
 const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Unexpected anchor '+a);return s.replace(a,()=>b);};
 let next=once(old,'const storedAlerts = await loadStoredEmailAlerts(env, userId, 80);','const storedAlerts = (await loadStoredEmailAlerts(env, userId, 80)).filter(item=>apdStoredAbcOfferOpenAuditV1(item));');
 next=once(next,'if (!shownCount) {','if (!shownCount || !visibleSource.every(item=>apdStoredAbcOfferOpenAuditV1(item)) || !visibleAlertsForRender.every(item=>apdStoredAbcOfferOpenAuditV1(item))) {');
 next=once(next,'    let reservation = null;\n    if (digestDedupeKey) {','    if (!digestDedupeKey) {\n      failedDigests += 1;\n      pushDebug({user_id:userId,stage:"dedupe_db",reason:"missing_dedupe_key",skipped:true});\n      continue;\n    }\n    let reservation = null;\n    if (digestDedupeKey) {');
 next=once(next,'if (!reservation?.ok) {','if (!apdDigestReservationConfirmedAuditV1(digestDedupeKey,reservation)) {');
 next=once(next,'    let send = null;\n    try {\n      send = await enviarMailBrevo(','    if (!visibleSource.every(item=>apdStoredAbcOfferOpenAuditV1(item)) || !visibleAlertsForRender.every(item=>apdStoredAbcOfferOpenAuditV1(item))) {\n      await finishEmailDigestDeliveryLog(env,reservation,{ok:false,status:0,data:"deadline_reached_before_send"}).catch(()=>null);\n      skippedAlerts += 1;\n      pushDebug({user_id:userId,stage:"pre_send",reason:"deadline_unverified_or_reached",skipped:true});\n      continue;\n    }\n    let send = null;\n    try {\n      send = await enviarMailBrevo(');
 const prefix=storedAbcOfferOpen.toString().replace('function storedAbcOfferOpen(','function apdStoredAbcOfferOpenAuditV1(').replace('check=abcOfferDeadlineAudit','check=apdAbcOfferDeadlineAuditV1')+'\n'+digestReservationConfirmed.toString().replace('function digestReservationConfirmed(','function apdDigestReservationConfirmedAuditV1(')+'\n';
 const candidate=prefix+src.slice(0,from)+next+src.slice(to);
 assert.equal(candidate.slice(prefix.length).replace(next,()=>old),src);
 return {candidate,deployable:false,unrelatedBytesPreserved:true};
}
