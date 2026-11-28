/**
 * APDocentePBA client presentation entitlement for Insigne-only work planner.
 * Consumes ONLY a plan snapshot already returned by authenticated /api/mi-plan.
 *
 * Not an authorization service: all browser JavaScript is inspectable. Future
 * server-owned premium APIs MUST revalidate subscription on the server.
 */
const normalized=v=>String(v??'').trim().toUpperCase();
export function canonicalPlannerPlanCode(raw){
 const value=normalized(raw);
 if(value==='INSIGNE'||value==='INSIGNE_ANUAL'||
    value==='SIGNATURE'||value==='SIGNATURE_ANUAL')return 'INSIGNE';
 return value;
}
export function hasInsignePlannerAccess(snapshot,now=Date.now()){
 if(!snapshot||typeof snapshot!=='object'||
    snapshot.ok===false||snapshot.access_active!==true)return false;
 const subscription=snapshot.subscription;
 if(!subscription||typeof subscription!=='object'||
    normalized(subscription.source)==='FALLBACK_FRONTEND')return false;
 // New complete access requires a matching verified subscription and strict expiry.
 const code=normalized(subscription.plan_code);
 if(['COMPLETO','TRIAL_14D'].includes(code)){
  if(snapshot.ok!==true||normalized(snapshot.plan?.code)!==code||!Number.isFinite(now))return false;
  if(!['ACTIVE','AUTHORIZED','APPROVED'].includes(normalized(subscription.status)))return false;
  if(!normalized(subscription.source))return false;
  const start=subscription.started_at;
  if(typeof start!=='string'||!Number.isFinite(Date.parse(start))||Date.parse(start)>now)return false;
  const end=code==='TRIAL_14D'?subscription.trial_ends_at:subscription.current_period_ends_at;
  if(typeof end!=='string'||!Number.isFinite(Date.parse(end))||Date.parse(end)<=now)return false;
  return true;
 }
 // Legacy access retains exactly the existing Insigne/Signature checks.
 if(canonicalPlannerPlanCode(subscription.plan_code)!=='INSIGNE')return false;
 const status=normalized(subscription.status);
 if(!['ACTIVE','AUTHORIZED','APPROVED'].includes(status))return false;
 // If the backend also returns a plan object, it must not contradict the
 // subscription's code. Omitted plan code is fine, since the subscription
 // is the authoritative field in an authenticated /api/mi-plan snapshot.
 const planCode=snapshot.plan?.code;
 if(planCode&&canonicalPlannerPlanCode(planCode)!=='INSIGNE')return false;
 return true;
}
