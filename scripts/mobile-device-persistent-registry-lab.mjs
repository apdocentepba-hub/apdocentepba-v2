import {protectMobilePushToken} from './mobile-push-token-crypto-lab.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const actorId=a=>{if(a?.sessionVerified!==true||!uuid(a.userId))throw Error('unauthenticated');return a.userId;};
export function createPersistentMobileRegistryLab({adapter,encryptionKey,hmacKey}={}){
 if(!adapter||!['registerDeviceLab','revokeDeviceLab','listOwnedDevicesLab'].every(k=>typeof adapter[k]==='function')||!encryptionKey||!hmacKey||encryptionKey===hmacKey)throw Error('invalid_configuration');
 return Object.freeze({
  async register({actor,request}){
   const userId=actorId(actor);
   if(!request||!uuid(request.device_id)||!['android','ios'].includes(request.platform)||request.transport!=='expo'||request.opted_in!==true||typeof request.push_token!=='string'||!/^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{16,250}\]$/.test(request.push_token)||Object.keys(request).some(k=>!['device_id','platform','transport','push_token','opted_in'].includes(k)))throw Error('invalid_registration');
   const keys=await protectMobilePushToken({token:request.push_token,encryptionKey,hmacKey});
   return adapter.registerDeviceLab({userId,deviceId:request.device_id,platform:request.platform,transport:request.transport,tokenHash:keys.token_hash,tokenCiphertext:keys.token_ciphertext});
  },
  revoke:({actor,deviceId})=>adapter.revokeDeviceLab({userId:actorId(actor),deviceId}),
  listForUser:({actor})=>adapter.listOwnedDevicesLab({userId:actorId(actor)}),
  async getForUser({actor,deviceId}){const rows=await adapter.listOwnedDevicesLab({userId:actorId(actor),deviceId});if(rows.length>1)throw Error('ambiguous_device');return rows[0]||null;}
 });
}
