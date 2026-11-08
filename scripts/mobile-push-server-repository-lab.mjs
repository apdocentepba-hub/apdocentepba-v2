/**
 * APDocentePBA — trusted database/ABC repository boundary (LAB only).
 *
 * Works with injected server-only persistence, plan and authoritative-offer
 * services. No Supabase/ABC network, credentials, routes or push providers.
 * Never accepts a plan, offer or account status from a mobile request.
 *
 * The database adapter must implement the private SQL claim/lease RPCs,
 * read the current outbox lease under service credentials, and retrieve
 * only the claimed user's device. The offer adapter must do the real ABC
 * recheck plus APD compatibility evaluation before returning a result.
 * DO NOT pass a raw ABC response directly as verified fields.
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const OFFER=/^[A-Za-z0-9_.:|-]{1,160}$/;
const TRANSPORT=new Set(['expo','fcm','apns']);
const PLATFORM=new Set(['android','ios']);

function requireClaim(row){
 if(!row||typeof row!=='object'||!HEX.test(row.event_key||'')||
    !UUID.test(row.user_id||'')||!UUID.test(row.device_id||'')||
    !UUID.test(row.lease_id||'')||!OFFER.test(row.source_offer_key||'')||
    !TRANSPORT.has(row.transport)||!Number.isInteger(row.attempts)||
    row.attempts<1||row.attempts>3)
  throw Error('invalid_sql_claim');
 return Object.freeze({
  event_key:row.event_key,user_id:row.user_id,device_id:row.device_id,
  lease_id:row.lease_id,source_offer_key:row.source_offer_key,
  transport:row.transport,attempts:row.attempts
 });
}
function leaseMatches(record,claim,now){
 if(!record||typeof record!=='object'||record.status!=='leased'||
    record.event_key!==claim.event_key||record.user_id!==claim.user_id||
    record.device_id!==claim.device_id||record.lease_id!==claim.lease_id||
    record.source_offer_key!==claim.source_offer_key)return false;
 const end=Date.parse(record.leased_until);
 return typeof record.leased_until==='string'&&
   Number.isFinite(end)&&end>now;
}
function requiredMethod(parent,key){
 if(!parent||typeof parent[key]!=='function')throw Error('missing_server_dependency');
}
function ensureIds(eventKey,leaseId){
 if(!HEX.test(eventKey||'')||!UUID.test(leaseId||''))
  throw Error('invalid_lease_reference');
}

/** Client interface is intentionally narrow: no plain tokens and no SQL text. */
export function createMobilePushServerRepositoryLab({
 database,plans,offers,now=()=>Date.now()
}={}){
 for(const key of ['claim','readActiveLease','readOwnedDevice','cancel','retry'])
  requiredMethod(database,key);
 requiredMethod(plans,'verify');
 requiredMethod(offers,'verify');
 if(typeof now!=='function')throw Error('invalid_clock');

 const outstanding=new Map();
 const nowMs=()=>{
  const t=Number(now());
  if(!Number.isFinite(t))throw Error('invalid_clock');
  return t;
 };
 return Object.freeze({
  async claimReserved({limit=10}={}){
   if(!Number.isInteger(limit)||limit<1||limit>10)
    throw Error('invalid_claim_limit');
   const rows=await database.claim({limit,leaseSeconds:60});
   if(!Array.isArray(rows)||rows.length>limit)throw Error('invalid_sql_claim_batch');
   const claims=rows.map(requireClaim);
   if(new Set(claims.map(row=>row.event_key)).size!==claims.length)
    throw Error('duplicate_sql_claim');
   outstanding.clear();
   for(const claim of claims)outstanding.set(claim.event_key,claim);
   return claims;
  },
  async loadVerifiedContext({eventKey,deviceId,leaseId,userId,sourceOfferKey}={}){
   ensureIds(eventKey,leaseId);
   const claim=outstanding.get(eventKey);
   if(!claim||claim.lease_id!==leaseId||claim.device_id!==deviceId||
      claim.user_id!==userId||claim.source_offer_key!==sourceOfferKey)
    throw Error('untrusted_claim_reference');

   // Read the CURRENT SQL lease after claim and before contacting sources.
   const row=await database.readActiveLease({eventKey,leaseId});
   if(!leaseMatches(row,claim,nowMs()))throw Error('sql_lease_stale');

   // Each service receives only server-verified identifiers. No client-supplied
   // plan/offer/consent flags can enter the preflight decision.
   const device=await database.readOwnedDevice({
    userId:claim.user_id,deviceId:claim.device_id
   });
   const plan=await plans.verify({userId:claim.user_id});
   const offer=await offers.verify({
    userId:claim.user_id,sourceOfferKey:claim.source_offer_key
   });
   if(!device||!plan||!offer)throw Error('authoritative_lookup_unavailable');

   // Whitelist fields: raw provider token, SQL secrets and user PII never
   // move into the preflight context or its diagnostic response.
   const safeDevice=Object.freeze({
    id:device.id,user_id:device.user_id,platform:device.platform,
    transport:device.transport,
    enabled:device.enabled===true,opted_in:device.opted_in===true,
    token_available:device.token_available===true,
    token_revoked:device.token_revoked===true
   });
   const safePlan=Object.freeze({
    user_id:plan.user_id,access_active:plan.access_active,
    verified_at:plan.verified_at
   });
   const safeOffer=Object.freeze({
    source_offer_key:offer.source_offer_key,
    matched_user_id:offer.matched_user_id,
    compatible:offer.compatible,published:offer.published,
    currently_available:offer.currently_available,
    source_current:offer.source_current,estado:offer.estado,
    verified_at:offer.verified_at,expires_at:offer.expires_at
   });
   return Object.freeze({
    user_id:claim.user_id,device:safeDevice,plan:safePlan,offer:safeOffer
   });
  },
  async cancelReserved({eventKey,leaseId}={}){
   ensureIds(eventKey,leaseId);
   const claim=outstanding.get(eventKey);
   if(!claim||claim.lease_id!==leaseId)return false;
   const applied=await database.cancel({eventKey,leaseId});
   if(applied===true)outstanding.delete(eventKey);
   return applied===true;
  },
  async retryReserved({eventKey,leaseId}={}){
   ensureIds(eventKey,leaseId);
   const claim=outstanding.get(eventKey);
   if(!claim||claim.lease_id!==leaseId)return false;
   // Retry is always p_sent:false; this module never acknowledges delivery.
   const applied=await database.retry({eventKey,leaseId,sent:false});
   if(applied===true)outstanding.delete(eventKey);
   return applied===true;
  }
 });
}
