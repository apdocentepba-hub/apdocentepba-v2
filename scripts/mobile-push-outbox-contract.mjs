/**
 * APDocentePBA offline outbox contract. In-memory ONLY, no actual delivery.
 * Production MUST implement durable unique key, atomic SQL claim/lease,
 * authorization, device revocation, and provider retries separately.
 */
const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createPushOutboxLab({clock=()=>Date.now(),maxAttempts=3}={}){
 if(typeof clock!=="function"||!Number.isInteger(maxAttempts)||
    maxAttempts<1||maxAttempts>8)throw Error("invalid_lab_configuration");
 const events=new Map();
 let leaseSeq=0;
 const clone=r=>r?Object.freeze({
  event_key:r.event_key,device_id:r.device_id,status:r.status,
  attempts:r.attempts,next_attempt_ms:r.next_attempt_ms,
  leased_until_ms:r.leased_until_ms
 }):null;
 const now=()=>{const ms=Number(clock());if(!Number.isFinite(ms))throw Error("invalid_time");return ms;};
 function validate(row){
  return row&&HEX.test(row.event_key)&&UUID.test(row.device_id)&&
   ["expo","fcm","apns"].includes(row.transport)&&
   ["android","ios"].includes(row.platform)&&
   row.notification?.title==="Nueva oferta APD compatible"&&
   row.notification?.body==="Abrí APDocentePBA para consultar los detalles."&&
   Object.keys(row.notification?.data||{}).length===1&&
   row.notification?.data?.notification_id===row.event_key;
 }
 function enqueue(candidates=[]){
  if(!Array.isArray(candidates))throw Error("invalid_batch");
  const current=now();let created=0,duplicates=0,rejected=0;
  for(const row of candidates){
   if(!validate(row)){rejected++;continue;}
   if(events.has(row.event_key)){duplicates++;continue;}
   events.set(row.event_key,{
    event_key:row.event_key,device_id:row.device_id,
    transport:row.transport,platform:row.platform,
    status:"pending",attempts:0,next_attempt_ms:current,
    leased_until_ms:null,lease_id:null
   });created++;
  }
  return Object.freeze({created,duplicates,rejected});
 }
 function claim({limit=10,leaseMs=30000}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100||
     !Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>300000)throw Error("invalid_claim");
  const current=now(),claimed=[];
  for(const row of events.values()){
   if(claimed.length>=limit)break;
   if(row.status==="leased"&&row.leased_until_ms<=current){
    if(row.attempts>=maxAttempts){row.status="dead";row.lease_id=null;row.leased_until_ms=null;continue;}
    row.status="pending";row.lease_id=null;row.leased_until_ms=null;
   }
   if(row.status!=="pending"||row.next_attempt_ms>current)continue;
   if(row.attempts>=maxAttempts){row.status="dead";continue;}
   row.attempts++;
   row.status="leased";
   row.lease_id="LAB-LEASE-"+(++leaseSeq);
   row.leased_until_ms=current+leaseMs;
   claimed.push(Object.freeze({
    event_key:row.event_key,device_id:row.device_id,transport:row.transport,
    lease_id:row.lease_id,attempts:row.attempts
   }));
  }
  return claimed;
 }
 function settle({eventKey,leaseId,sent=false}={}){
  const row=events.get(eventKey),current=now();
  if(!row||row.status!=="leased"||row.lease_id!==leaseId||
     row.leased_until_ms<=current)return false;
  row.lease_id=null;row.leased_until_ms=null;
  if(sent){row.status="sent";row.next_attempt_ms=null;}
  else if(row.attempts>=maxAttempts){row.status="dead";row.next_attempt_ms=null;}
  else{row.status="pending";row.next_attempt_ms=current+Math.min(60000,1000*(2**(row.attempts-1)));}
  return true;
 }
 function cancelEvent(eventKey,{leaseId}={}){
  if(typeof eventKey!=="string"||!HEX.test(eventKey))return false;
  const row=events.get(eventKey);
  if(!row||!["pending","leased"].includes(row.status))return false;
  // A stale claim cannot cancel a new lease obtained after its expiry.
  if(row.status==="leased"&&row.lease_id!==leaseId)return false;
  if(row.status==="pending"&&leaseId!==undefined)return false;
  row.status="cancelled";row.lease_id=null;
  row.leased_until_ms=null;row.next_attempt_ms=null;
  return true;
 }
 function cancelDevice(deviceId){
  if(typeof deviceId!=="string"||!UUID.test(deviceId))throw Error("invalid_device");
  let cancelled=0;
  for(const row of events.values()){
   if(row.device_id!==deviceId||!["pending","leased"].includes(row.status))continue;
   row.status="cancelled";row.lease_id=null;row.leased_until_ms=null;row.next_attempt_ms=null;cancelled++;
  }
  return cancelled;
 }
 return Object.freeze({enqueue,claim,settle,cancelEvent,cancelDevice,
  get:key=>clone(events.get(key)),summary:()=>{
   const counts={pending:0,leased:0,sent:0,dead:0,cancelled:0};
   for(const row of events.values())counts[row.status]++;
   return Object.freeze({...counts,total:events.size});
  }});
}
