// Offline correlation: a previously captured Published row + a targeted ABC status read.
// The verifier must be injected; this file has NO network, persistence, messaging or Worker wiring.
// Output is a non-deliverable review candidate, NOT independently attested evidence of ABC history.
import {createHash} from 'node:crypto';
import {parseVerifiedClosingTime} from './apd-offer-change-detector.mjs';

const MAX_INTERVAL_MS=48*3600000;
const MAX_OBSERVATION_AGE_MS=12*3600000;
const MAX_FUTURE_MS=5*60000;
const KEY=/^D_[0-9]{1,18}$/;
const normalize=v=>String(v??'').trim().normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toUpperCase();
const fail=reason=>Object.freeze({
 verified:false,reviewCandidate:false,reason,
 notificationAllowed:false,eventsCreated:0,recordsStored:0
});

// Previous observation is the output of the 14-field, source-scoped compact scanner.
// A hash verifies the shape was not mutated after capture; it is NOT a signature of ABC.
function validateCapture(c,sourceOfferKey){
 if(c?.complete!==true||c.fieldCount!==14||
    typeof c.scope!=='string'||!c.scope||
    typeof c.capturedAt!=='string'||!Array.isArray(c.rows)||
    !Number.isSafeInteger(c.sourceTotal)||c.sourceTotal!==c.rows.length||
    !/^[a-f0-9]{64}$/.test(c.digest||'')||c.rows.length>1500)
  return {reason:'prior_capture_not_complete'};
 let seen=0,prior=null,ids=new Set();
 for(const row of c.rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||
     typeof row.source_offer_key!=='string'||ids.has(row.source_offer_key)||
     normalize(row.distrito)!==normalize(c.scope))
    return {reason:'prior_capture_identity_or_scope_invalid'};
  ids.add(row.source_offer_key);
  if(Object.keys(row).length!==14)
    return {reason:'prior_capture_fields_invalid'};
  if(row.source_offer_key===sourceOfferKey){seen++;prior=row;}
 }
 const digest=createHash('sha256').update(JSON.stringify([
  c.scope,c.capturedAt,c.rows
 ])).digest('hex');
 if(digest!==c.digest)return {reason:'prior_capture_digest_changed'};
 if(seen!==1)return {reason:'prior_offer_not_unique_or_missing'};
 if(normalize(prior.estado)!=='PUBLICADA')
  return {reason:'prior_offer_was_not_published'};
 return {row:prior};
}

export function createABCTransitionCorrelator({
 enabled=false,verifier,clock=()=>Date.now()
}={}){
 if(enabled!==true)throw Error('ABC transition correlation disabled');
 if(!verifier||typeof verifier.inspect!=='function'||
    typeof clock!=='function')throw Error('Invalid isolated correlation dependencies');
 return Object.freeze({
  async inspect({previousCapture,sourceOfferKey}={}){
   if(typeof sourceOfferKey!=='string'||!KEY.test(sourceOfferKey))
    return fail('unsupported_official_detail_id');
   const checked=validateCapture(previousCapture,sourceOfferKey);
   if(checked.reason)return fail(checked.reason);
   const earlier=parseVerifiedClosingTime(previousCapture.capturedAt);
   const started=clock();
   if(earlier===null||!Number.isFinite(started)||
      earlier>started+MAX_FUTURE_MS||
      started-earlier>MAX_INTERVAL_MS)
    return fail('prior_capture_outside_observation_window');
   // Correlate by invoking the verifier with the SAME scope and ID as the prior row,
   // instead of accepting a disconnected, caller-supplied status result.
   let result;
   try{
    result=await verifier.inspect({
     district:previousCapture.scope,sourceOfferKey
    });
   }catch{
    // Never expose raw network, JWT or identifiers from an exception.
    return fail('targeted_abc_verification_failed');
   }
   const finished=clock();
   if(!Number.isFinite(finished)||finished<started||
      finished-started>60000||finished-earlier>MAX_INTERVAL_MS||
      finished>started+MAX_FUTURE_MS)
    return fail('verification_time_invalid');
   if(result?.verified!==true||result.source!=='ABC_public_detail_lookup'||
      result.scope!==previousCapture.scope||result.checks!==2||
      result.candidateOnly!==true||result.historicTransitionProven!==false||
      result.notificationAllowed!==false||result.recordsStored!==0||
      result.eventsCreated!==0)
    return fail('targeted_status_result_not_trusted');
   if(result.officialState!=='ANULADA'||
      result.classification!=='officially_annulled')
    return fail('status_is_not_anulada');

   // The hashed candidate ID permits offline deduplication without publishing
   // the official detail identifier or sending personal information to a client.
   const evidenceHash=createHash('sha256').update(JSON.stringify([
    'APD_TRANSITION_CANDIDATE_V1',previousCapture.digest,
    previousCapture.scope,sourceOfferKey,result.officialState
   ])).digest('hex');
   return Object.freeze({
    verified:true,
    reviewCandidate:true,
    evidenceHash,
    sourceScope:previousCapture.scope,
    previousObservedState:'PUBLICADA',
    laterObservedState:'ANULADA',
    previousObservedAt:previousCapture.capturedAt,
    laterVerifiedAt:new Date(finished).toISOString(),
    evidence:'compact_capture_then_targeted_abc_double_read',
    // Input snapshots are still only candidate sources. We do not know the
    // exact transition time or whether the earlier scanner was truly atomic.
    originalCaptureAttestedByABC:false,
    exactStateTransitionTimeKnown:false,
    historicTransitionProven:false,
    notificationAllowed:false,
    candidateOnly:true,
    recordsStored:0,
    eventsCreated:0
   });
  }
 });
}
