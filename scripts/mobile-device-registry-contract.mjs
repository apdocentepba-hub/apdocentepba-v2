/**
 * LAB ONLY. Minimal server-side device-registry command contract for APDocentePBA.
 *
 * Dependencies are in-memory and deliberately do NOT talk to Supabase,
 * Cloudflare, Expo or Firebase. Caller MUST verify the bearer session with
 * the production Worker and derive actor.userId on the server, never from
 * user-provided request fields.
 */
import {createHmac} from "node:crypto";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const isUuid=x=>typeof x==="string"&&UUID.test(x);
const validToken=(token,transport)=>{
 if(typeof token!=="string"||token.length>500||token.length<16)return false;
 // Expo token formats; browser prototypes cannot submit arbitrary tokens.
 if(transport==="expo")
  return /^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{16,250}\]$/.test(token);
 // Explicit placeholders for future platform integration; no requests sent.
 if(transport==="fcm")
  return /^[A-Za-z0-9:_-]{64,500}$/.test(token);
 if(transport==="apns")return /^[a-fA-F0-9]{64}$/.test(token);
 return false;
};
export class DeviceRegistryError extends Error{
 constructor(code){super(code);this.code=code;}
}
const reject=code=>{throw new DeviceRegistryError(code);};
const copy=r=>r?Object.freeze({
 id:r.id,user_id:r.user_id,platform:r.platform,transport:r.transport,
 enabled:r.enabled,opted_in:r.opted_in
}):null;

/**
 * Server-only command model; replace Map with transactionally backed storage.
 * Never persist a raw device push token in this prototype.
 */
export function createDeviceRegistryLab({hmacSecret}={}){
 if(typeof hmacSecret!=="string"||hmacSecret.length<32)
  reject("invalid_server_secret");
 const records=new Map();
 const hash=token=>createHmac("sha256",hmacSecret)
   .update("push-token-v1:"+token).digest("hex");
 function actorId(actor){
  if(!isUuid(actor?.userId)||actor?.sessionVerified!==true)
   reject("unauthenticated");
  return actor.userId;
 }
 function register({actor,request}={}){
  const userId=actorId(actor);
  if(!request||typeof request!=="object"||
    !isUuid(request.device_id)||!["android","ios"].includes(request.platform)||
    !["expo","fcm","apns"].includes(request.transport)||
    !validToken(request.push_token,request.transport)||
    request.opted_in!==true)reject("invalid_device_or_consent");
  if(request.platform==="android"&&request.transport==="apns")
   reject("invalid_transport");
  if(request.platform==="ios"&&request.transport==="fcm")
   reject("invalid_transport");
  // A client-supplied user ID is never an authority; reject a conflicting ID
  // instead of silently trusting it.
  if("user_id" in request&&request.user_id!==userId)
   reject("actor_mismatch");
  const existing=records.get(request.device_id);
  if(existing&&existing.user_id!==userId)reject("device_owned_by_other_user");
  const tokenHash=hash(request.push_token);
  for(const other of records.values()){
   if(other.id!==request.device_id&&other.token_hash===tokenHash&&other.enabled)
    reject("token_already_registered");
  }
  const stored={
   id:request.device_id,user_id:userId,
   platform:request.platform,transport:request.transport,
   enabled:true,opted_in:true,token_hash:tokenHash
  };
  records.set(request.device_id,stored);
  return copy(stored);
 }
 function revoke({actor,deviceId}={}){
  const userId=actorId(actor);
  if(!isUuid(deviceId))reject("invalid_device");
  const existing=records.get(deviceId);
  if(!existing)return false;
  if(existing.user_id!==userId)reject("device_owned_by_other_user");
  records.set(deviceId,{...existing,enabled:false,opted_in:false});
  return true;
 }
 function listForUser({actor}={}){
  const userId=actorId(actor);
  return [...records.values()].filter(r=>r.user_id===userId).map(copy);
 }
 function getForUser({actor,deviceId}={}){
  const userId=actorId(actor);
  if(!isUuid(deviceId))reject("invalid_device");
  const r=records.get(deviceId);
  return r?.user_id===userId?copy(r):null;
 }
 return Object.freeze({register,revoke,listForUser,getForUser,
  stats:()=>({records:records.size}),isHash:key=>HASH.test(key)});
}
