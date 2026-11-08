/**
 * APDocentePBA — mobile push event contract (laboratory only).
 *
 * This is a deterministic pre-delivery candidate builder, NOT a sender.
 * Call it only after server authentication, subscription verification,
 * server-side offer matching and device ownership confirmation.
 *
 * There are intentionally NO Expo, Firebase, APNs, Worker, SQL, network,
 * notification-permission prompts or production writes in this module.
 */
import {createHmac} from "node:crypto";

const UID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const GENERIC_TITLE="Nueva oferta APD compatible";
const GENERIC_BODY="Abrí APDocentePBA para consultar los detalles.";

const validId=value=>typeof value==="string"&&UID.test(value);
const validKey=value=>typeof value==="string"&&value.length>0&&
 value.length<=160&&/^[A-Za-z0-9_.:|-]+$/.test(value);

export function buildMobilePushCandidates({
 authenticatedUserId,
 verifiedPlan,
 serverMatchedOffers,
 authorizedDevices,
 existingEventKeys=[],
 hmacSecret,
 now=new Date(),
 maxPerDevice=3
}={}){
 // Missing verification always fails closed; absence of data is NOT consent.
 if(!validId(authenticatedUserId)||verifiedPlan?.access_active!==true||
    !Array.isArray(serverMatchedOffers)||!Array.isArray(authorizedDevices)||
    !Array.isArray(existingEventKeys)||typeof hmacSecret!=="string"||
    hmacSecret.length<32||!Number.isInteger(maxPerDevice)||
    maxPerDevice<1||maxPerDevice>10)return [];
 const timestamp=now instanceof Date?now.getTime():new Date(now).getTime();
 if(!Number.isFinite(timestamp))return [];
 const queued=new Set(existingEventKeys.filter(key=>typeof key==="string"));
 const candidates=[];
 const processedDevices=new Set();
 for(const device of authorizedDevices){
  if(!validId(device?.id)||processedDevices.has(device.id))continue;
  processedDevices.add(device.id);
  if(device.user_id!==authenticatedUserId||device.opted_in!==true||
     device.enabled!==true||!["android","ios"].includes(device.platform)||
     !["expo","fcm","apns"].includes(device.transport))continue;
  const processedOffers=new Set();
  let count=0;
  for(const offer of serverMatchedOffers){
   if(count>=maxPerDevice)break;
   const offerKey=offer?.source_offer_key;
   if(!validKey(offerKey)||processedOffers.has(offerKey))continue;
   processedOffers.add(offerKey);
   // These fields MUST be computed by the trusted server, never accepted
   // directly from a mobile client or from an unchecked public source.
   if(offer.matched_user_id!==authenticatedUserId||
      offer.compatible!==true||offer.published!==true||
      offer.currently_available!==true)continue;
   const expiry=typeof offer.expires_at==="string"
     ?Date.parse(offer.expires_at):NaN;
   if(!Number.isFinite(expiry)||expiry<=timestamp)continue;
   // Stable per-user, per-device, per-offer idempotency key. No raw ID,
   // school name, observations, contact or PID in the push payload.
   const eventKey=createHmac("sha256",hmacSecret)
     .update(JSON.stringify([authenticatedUserId,device.id,offerKey]))
     .digest("hex");
   if(queued.has(eventKey))continue;
   queued.add(eventKey);
   candidates.push({
    device_id:device.id,
    platform:device.platform,
    transport:device.transport,
    event_key:eventKey,
    notification:{
     title:GENERIC_TITLE,
     body:GENERIC_BODY,
     data:{notification_id:eventKey}
    }
   });
   count++;
  }
 }
 return candidates;
}
