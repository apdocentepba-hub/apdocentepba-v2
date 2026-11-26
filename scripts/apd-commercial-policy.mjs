// Server-side commercial-policy candidate. No billing or database side effects.
// Existing subscriptions are resolved by the verified legacy policy, never rewritten.
export const APD_OFFER=Object.freeze({
 free:Object.freeze({code:'FREE',price_ars:0,max_distritos:1,max_cargos:1}),
 complete:Object.freeze({code:'COMPLETO',price_ars:2000,max_distritos:5,max_cargos:10}),
 trial:Object.freeze({code:'TRIAL_14D',days:14,price_ars:0,max_distritos:5,max_cargos:10})
});
const DAY=86400000;
const validStatuses=new Set(['ACTIVE','AUTHORIZED','APPROVED']);
const normalize=v=>String(v??'').trim().toUpperCase();
const time=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
const free=reason=>({tier:'FREE',complete:false,reason,...APD_OFFER.free});
const complete=(reason,expiresAt,trial=false)=>({tier:'COMPLETO',complete:true,reason,expiresAt,trial,...(trial?APD_OFFER.trial:APD_OFFER.complete)});
const unavailable=reason=>({tier:'UNVERIFIED',complete:false,reason});
/** Only call with authenticated, server-owned subscription and full history. */
export function resolveCommercialAccess({authenticated,subscription,historyVerified,now,legacyAccess}={}){
 if(authenticated!==true||historyVerified!==true||!Number.isFinite(now))return unavailable('unverified');
 if(!subscription)return free('no_subscription');
 const code=normalize(subscription.plan_code),status=normalize(subscription.status);
 if(code==='FREE')return free('free');
 if(code==='TRIAL_14D'||code==='COMPLETO'){
  const expiresAt=code==='TRIAL_14D'?subscription.trial_ends_at:subscription.current_period_ends_at;
  const expiry=time(expiresAt);
  if(!Number.isFinite(expiry))return unavailable('invalid_expiry');
  if(!validStatuses.has(status)||expiry<=now)return free('expired_or_inactive');
  return complete(code==='TRIAL_14D'?'trial':'paid',expiresAt,code==='TRIAL_14D');
 }
 if(!['TRIAL_7D','BASIC','PLUS','PREMIUM','PRO','INSIGNE','SIGNATURE','PLUS_ANUAL','PREMIUM_ANUAL','PRO_ANUAL','INSIGNE_ANUAL','SIGNATURE_ANUAL','BASIC_ANUAL'].includes(code))return unavailable('unknown_plan');
 if(legacyAccess?.verified!==true||typeof legacyAccess.active!=='boolean')return unavailable('legacy_unverified');
 // Leave all existing entitlements, recurring terms and exceptions untouched.
 return legacyAccess.active?{tier:'LEGACY',complete:false,delegateLegacy:true,reason:'preserve_contract'}:free('legacy_expired');
}
/** Must be enforced in the same transaction as insertion, with a unique claim per user. */
export function newTrialDecision({authenticated,historyVerified,existingSubscriptions,trialClaimed,now}={}){
 if(authenticated!==true||historyVerified!==true||!Array.isArray(existingSubscriptions)||trialClaimed!==false||!Number.isFinite(now))return {allowed:false,reason:'unverified_or_used'};
 if(existingSubscriptions.length)return {allowed:false,reason:'existing_account_history'};
 const expiry=new Date(now+APD_OFFER.trial.days*DAY);
 if(!Number.isFinite(expiry.getTime()))return {allowed:false,reason:'invalid_clock'};
 return {allowed:true,requiresAtomicClaim:true,subscription:{plan_code:'TRIAL_14D',status:'ACTIVE',source:'trial_complete_14d',started_at:new Date(now).toISOString(),trial_ends_at:expiry.toISOString(),current_period_ends_at:null,mercadopago_preapproval_id:null}};
}
/** New checkout only; payment must be independently verified by existing payment processor. */
export function checkoutDecision({authenticated,historyVerified,access,target,recurringReference,price}={}){
 if(authenticated!==true||historyVerified!==true||!access||access.tier==='UNVERIFIED')return {allowed:false,reason:'unverified'};
 if(normalize(target)!=='COMPLETO'||price!==APD_OFFER.complete.price_ars)return {allowed:false,reason:'invalid_offer'};
 if(recurringReference||access.tier==='LEGACY'||(access.complete===true&&access.trial!==true))return {allowed:false,reason:'preserve_existing_contract'};
 if(access.tier!=='FREE'&&!(access.tier==='COMPLETO'&&access.trial===true))return {allowed:false,reason:'invalid_access'};
 return {allowed:true,mode:'explicit_checkout',plan_code:'COMPLETO',price_ars:2000,currency:'ARS',requiresProviderVerification:true};
}
export function validatePreferenceLimits(access,{districts,cargos}={}){
 if(!access||!['FREE','COMPLETO'].includes(access.tier)||!Array.isArray(districts)||!Array.isArray(cargos))return false;
 // Existing preferences must not be deleted on downgrade. Enforce only effective selection.
 const valid=a=>a.every(v=>typeof v==='string'&&v.trim().length>0)&&new Set(a.map(normalize)).size===a.length;
 return valid(districts)&&valid(cargos)&&districts.length<=access.max_distritos&&cargos.length<=access.max_cargos;
}
