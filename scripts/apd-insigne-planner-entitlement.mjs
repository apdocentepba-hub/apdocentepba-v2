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
export function hasInsignePlannerAccess(snapshot){
 if(!snapshot||typeof snapshot!=='object'||
    snapshot.ok===false||snapshot.access_active!==true)return false;
 const subscription=snapshot.subscription;
 if(!subscription||typeof subscription!=='object'||
    normalized(subscription.source)==='FALLBACK_FRONTEND')return false;
 // Require the actual subscription's paid plan, not just a plan card.
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
