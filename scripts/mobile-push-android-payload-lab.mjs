/** Android Expo payload, isolated from provider submission.
 * Caller MUST obtain token from server-side authenticated registry bound to device.
 * This module checks HMAC, consent, ownership, plan and official offer freshness.
 * It does not claim/consume an outbox dispatch or contact any provider.
 */
import {evaluateWorkerMobilePushPreflightLab,parseWorkerPushInstant} from "./mobile-push-worker-webcrypto-lab.mjs";
const TOKEN=/^(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;
export async function buildAndroidExpoPayload({claim,context,recipient,hmacSecret,clock=Date.now,cryptoApi=globalThis.crypto}={}){
 const start=clock();
 const result=await evaluateWorkerMobilePushPreflightLab({claim,context,hmacSecret,now:start,cryptoApi});
 if(result.action!=="ready")return {action:result.action,reason:result.reason};
 if(context.device.platform!=="android"||claim.transport!=="expo")return {action:"cancel",reason:"not_android_expo"};
 if(!recipient||recipient.deviceId!==claim.device_id||recipient.userId!==claim.user_id||typeof recipient.token!=="string"||!TOKEN.test(recipient.token))
  return {action:"cancel",reason:"recipient_unverified"};
 const now=clock();
 const expires=parseWorkerPushInstant(context.offer.expires_at);
 // Conservative buffer for provider/network scheduling; skip near closure.
 const ttl=Math.min(120,Math.floor((expires-now-5000)/1000));
 if(!Number.isFinite(now)||now<start||now-start>5000)return {action:"retry",reason:"clock_or_preflight_stale"};
 if(ttl<1)return {action:"cancel",reason:"offer_expired_or_near_close"};
 return {action:"ready",payload:Object.freeze({to:recipient.token,title:"AlertasAPD",
  body:"Hay una nueva oportunidad docente. Consultá las ofertas vigentes.",
  priority:"high",channelId:"apd-alertas",sound:"default",ttl,
  data:Object.freeze({type:"apd_offer",offerKey:claim.source_offer_key})})};
}
