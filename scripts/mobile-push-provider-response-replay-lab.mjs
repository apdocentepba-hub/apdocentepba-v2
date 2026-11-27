/**
 * APDocentePBA — strictly OFFLINE provider response & replay simulator.
 * Lab only: no fetch, no SDK, no credentials, no sender or token handling.
 *
 * Expo ticket = Expo queued it, NOT FCM/APNs or device acceptance.
 * Expo receipt OK = underlying push provider accepted, NOT device delivered.
 * FCM HTTP v1 success = FCM accepted the message, NOT device delivered.
 * HTTP timeouts/5xx/429 => uncertain, NEVER blind automatic retry.
 * An unknown receipt after quarantine or revocation is audit-only and
 * NEVER turns the SQL event back into 'sent'. See Expo & Firebase docs.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9_-]{8,200}$/;
const states=new Set([
 'prepared','awaiting_receipt','provider_accepted',
 'invalid_device','rejected','uncertain','revoked'
]);
const safe=Object.freeze({delivery_to_device_confirmed:false,provider_calls:0});
function classified(state,{receiptId=null,reason='unverified'}={}){
 return Object.freeze({state,receiptId,reason});
}
function isOkStatus(status){return Number.isInteger(status)&&status===200;}
function statusError(body){
 return body&&typeof body==='object'&&!Array.isArray(body)&&
   Array.isArray(body.errors)&&body.errors.length>0;
}
/** Expo's successful ticket means enqueue, not confirmed downstream delivery. */
export function classifyExpoPushTicketLab({httpStatus,body}={}){
 if(!isOkStatus(httpStatus)){
  return classified(httpStatus===400?'rejected':'uncertain',{
   reason:httpStatus===400?'provider_rejected_request':'request_outcome_unknown'
  });
 }
 if(!body||typeof body!=='object'||statusError(body))
  return classified('uncertain',{reason:'invalid_ticket_envelope'});
 const ticket=Array.isArray(body.data)?body.data.length===1?body.data[0]:null:body.data;
 if(!ticket||typeof ticket!=='object')
  return classified('uncertain',{reason:'missing_or_ambiguous_ticket'});
 if(ticket.status==='ok'&&typeof ticket.id==='string'&&ID.test(ticket.id))
  return classified('awaiting_receipt',{
   receiptId:ticket.id,reason:'expo_ticket_only'
  });
 if(ticket.status==='error'&&ticket.details?.error==='DeviceNotRegistered')
  return classified('invalid_device',{reason:'token_not_registered'});
 if(ticket.status==='error')
  return classified('rejected',{reason:'expo_ticket_rejected'});
 return classified('uncertain',{reason:'invalid_ticket'});
}
/** Missing receipt is not success: Expo recommends checking after ~15 min. */
export function classifyExpoPushReceiptLab({httpStatus,body,receiptId}={}){
 if(typeof receiptId!=='string'||!ID.test(receiptId))
  return classified('uncertain',{reason:'receipt_id_invalid'});
 if(!isOkStatus(httpStatus)||!body||typeof body!=='object'||
    statusError(body)||!body.data||typeof body.data!=='object'||
    Array.isArray(body.data))
  return classified('uncertain',{reason:'receipt_lookup_unknown'});
 if(!Object.prototype.hasOwnProperty.call(body.data,receiptId))
  return classified('awaiting_receipt',{reason:'receipt_not_yet_available'});
 const receipt=body.data[receiptId];
 if(!receipt||typeof receipt!=='object')
  return classified('uncertain',{reason:'receipt_invalid'});
 if(receipt.status==='ok')
  return classified('provider_accepted',{reason:'expo_receipt_provider_accepted'});
 if(receipt.status==='error'&&receipt.details?.error==='DeviceNotRegistered')
  return classified('invalid_device',{reason:'token_not_registered'});
 if(receipt.status==='error')
  return classified('rejected',{reason:'expo_receipt_rejected'});
 return classified('uncertain',{reason:'receipt_invalid'});
}
/** FCM success accepts for delivery; it does not confirm display on device. */
export function classifyFcmHttpV1Lab({httpStatus,body}={}){
 if(httpStatus===200&&typeof body?.name==='string'&&
    /^projects\/[A-Za-z0-9_-]{2,100}\/messages\/[A-Za-z0-9_:%.-]{1,200}$/.test(body.name))
  return classified('provider_accepted',{reason:'fcm_message_accepted'});
 if(httpStatus===404&&body?.error?.status==='NOT_FOUND'&&
    Array.isArray(body.error.details)&&
    body.error.details.some(x=>
      x?.['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError'&&
      x?.errorCode==='UNREGISTERED'))
  return classified('invalid_device',{reason:'token_not_registered'});
 if(httpStatus===400)
  return classified('rejected',{reason:'fcm_bad_request'});
 // FCM 429/500/503 and all unknown or ambiguous HTTP responses may have
 // unknown server outcomes; never auto retry on this lab.
 return classified('uncertain',{reason:'fcm_response_unknown'});
}
/**
 * State machine with exactly ONE synthetic submission per SQL dispatch UUID.
 * The only inputs are caller-supplied fixtures. NEVER accepts a token,
 * target URL, fetch function, Authorization header or plaintext payload.
 */
export function createMobilePushProviderReplayLab({dispatchId,transport}={}){
 if(!UUID.test(dispatchId||'')||!['expo','fcm'].includes(transport))
  throw Error('invalid_provider_replay_identity');
 let state='prepared',attempts=0,receiptId=null,lateReceipt=false;
 let lastReason='not_submitted';
 return Object.freeze({
  submit(response){
   if(state!=='prepared'||attempts!==0)
    return Object.freeze({applied:false,reason:'submission_already_consumed'});
   attempts=1;
   const r=transport==='expo'?
    classifyExpoPushTicketLab(response):classifyFcmHttpV1Lab(response);
   if(!states.has(r.state))throw Error('invalid_provider_replay_transition');
   state=r.state;receiptId=r.receiptId;
   lastReason=r.reason;
   return Object.freeze({applied:true,state,reason:lastReason});
  },
  receipt(response){
   if(transport!=='expo'||attempts!==1||receiptId===null)
    return Object.freeze({applied:false,reason:'no_pending_expo_receipt'});
   const r=classifyExpoPushReceiptLab({...response,receiptId});
   if(state==='awaiting_receipt'){
    if(r.state!=='awaiting_receipt'){
     state=r.state;lastReason=r.reason;
    }
    return Object.freeze({applied:true,state,reason:lastReason});
   }
   // The SQL authorization may already have been revoked/quarantined.
   // A late provider receipt cannot reopen it or establish device delivery.
   if(state==='uncertain'||state==='revoked'){
    lateReceipt=true;
    return Object.freeze({applied:false,reason:'late_receipt_audit_only'});
   }
   return Object.freeze({applied:false,reason:'receipt_already_resolved'});
  },
  timeout(){
   if(state==='prepared'||state==='awaiting_receipt'){
    state='uncertain';lastReason='provider_outcome_unknown';
    return true;
   }
   return false;
  },
  revoke(){
   if(state==='revoked')return false;
   state='revoked';lastReason='device_revoked_no_new_dispatch';
   return true;
  },
  snapshot(){
   return Object.freeze({
    state,transport,submission_attempts:attempts,
    receipt_pending:state==='awaiting_receipt',
    late_receipt_audit_only:lateReceipt,
    reason:lastReason,...safe
   });
  }
 });
}
