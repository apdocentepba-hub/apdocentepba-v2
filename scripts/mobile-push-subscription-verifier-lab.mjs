/**
 * APDocentePBA mobile subscription verification (LAB, server-only).
 * No client-supplied account state, plan, price or payment provider data.
 * Reuses exact user_subscriptions/users/subscription_plans names from Worker.
 *
 * Conservative transport policy (different from older site entitlements):
 * - account must exist and be active
 * - newest subscription must have a permitted status and exact future end
 * - public catalog plan code must exist and is_active=true
 * - absent expiry, fallback trial, PENDING, PAUSED, BETA and INSIGNE bypass
 *   are not mobile-send authorization
 * - no provider, network or billing APIs are called by this module
 */
import {parseWorkerPushInstant}
 from './mobile-push-worker-webcrypto-lab.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAN=new Set(['TRIAL_7D','PLUS','PREMIUM','INSIGNE']);
const STATUS_PAID=new Set(['ACTIVE','AUTHORIZED']);
const STATUS_TRIAL=new Set(['ACTIVE','TRIALING']);
function canonicalCode(value){
 if(typeof value!=='string')return '';
 const text=value.trim().toUpperCase();
 return text==='PRO'?'PREMIUM':text;
}
const inactive=(user_id,at)=>Object.freeze({
 user_id,access_active:false,verified_at:new Date(at).toISOString()
});
function validStamp(value){
 return parseWorkerPushInstant(value);
}
export function createMobilePushSubscriptionVerifierLab({
 database,now=()=>Date.now()
}={}){
 for(const key of ['readAccountActive','readSubscriptionCandidates','readCatalogPlan'])
  if(typeof database?.[key]!=='function')
   throw Error('missing_subscription_database_dependency');
 if(typeof now!=='function')throw Error('invalid_subscription_clock');
 return Object.freeze({
  async verify({userId}={}){
   if(!UUID.test(userId||''))throw Error('invalid_subscription_user');
   const started=Number(now());
   if(!Number.isFinite(started))throw Error('invalid_subscription_clock');
   const account=await database.readAccountActive({userId});
   if(account===null)return inactive(userId,Number(now()));
   if(account.user_id!==userId||typeof account.active!=='boolean')
    throw Error('invalid_authoritative_account');
   if(account.active===false)return inactive(userId,Number(now()));
   const subscriptions=await database.readSubscriptionCandidates({userId});
   if(!Array.isArray(subscriptions)||subscriptions.length>5)
    throw Error('invalid_authoritative_subscriptions');
   if(!subscriptions.length)return inactive(userId,Number(now()));
   let previous=Infinity;
   const ids=new Set();
   for(const row of subscriptions){
    const timestamp=validStamp(row?.created_at);
    if(row?.user_id!==userId||!UUID.test(row?.id||'')||
       ids.has(row.id)||timestamp===null||timestamp>started+5_000||
       timestamp>=previous)
     throw Error('ambiguous_subscription_history');
    previous=timestamp;ids.add(row.id);
   }
   // Newest authoritative record is decisive. Do not fall back to an older
   // ACTIVE row after later PENDING/PAUSED/CANCELLED/EXPIRED transitions.
   const latest=subscriptions[0];
   const code=canonicalCode(latest.plan_code);
   const status=typeof latest.status==='string'?
    latest.status.trim().toUpperCase():'';
   if(!PLAN.has(code))return inactive(userId,Number(now()));
   const allowed=(code==='TRIAL_7D'?STATUS_TRIAL:STATUS_PAID);
   if(!allowed.has(status))return inactive(userId,Number(now()));
   const close=validStamp(code==='TRIAL_7D'?
    latest.trial_ends_at:latest.current_period_ends_at);
   // Explicit finite expiry is mandatory even when the legacy site might
   // treat ACTIVE paid subscriptions lacking a period-end as indefinite.
   if(close===null||close<=Number(now()))
    return inactive(userId,Number(now()));
   const catalog=await database.readCatalogPlan({planCode:code});
   if(catalog===null)return inactive(userId,Number(now()));
   if(catalog.code!==code||typeof catalog.is_active!=='boolean')
    throw Error('invalid_authoritative_catalog');
   const verifiedAt=Number(now());
   if(!Number.isFinite(verifiedAt)||verifiedAt<started||
      verifiedAt-started>15_000)
    throw Error('subscription_verification_stale');
   return Object.freeze({
    user_id:userId,
    access_active:catalog.is_active===true&&close>verifiedAt,
    verified_at:new Date(verifiedAt).toISOString()
   });
  }
 });
}
