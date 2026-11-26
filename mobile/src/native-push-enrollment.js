/** Native enrollment controller. Dependency-injected, no hardcoded live endpoint,
 * no persistent bearer or push token. Caller must supply an authenticated
 * account session and a stable per-account installation UUID from secure storage.
 */
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const expoToken=v=>typeof v==="string"&&/^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{16,250}\]$/.test(v);
function createNativePushEnrollment({getSession,notifications,request,deviceId,projectId,platform}={}){
 if(typeof getSession!=="function"||typeof request!=="function"||!notifications||!uuid(deviceId)||!uuid(projectId)||!["android","ios"].includes(platform))throw Error("invalid_enrollment_configuration");
 let busy=false;
 const capture=()=>{
  const s=getSession();
  if(!uuid(s?.userId)||typeof s?.bearer!=="string"||s.bearer===s.userId||!/^[A-Za-z0-9._~-]{24,512}$/.test(s.bearer))throw Error("session_required");
  const valid=()=>{const now=getSession();return now?.userId===s.userId&&now?.bearer===s.bearer;};
  return {valid,bearer:s.bearer};
 };
 const ensure=s=>{if(!s.valid())throw Error("session_changed");};
 const call=async(s,method,path,body)=>{
  ensure(s);
  const r=await request({method,path,bearer:s.bearer,...(body?{body}:{})});
  ensure(s);
  if(!r||r.ok!==true)throw Error("enrollment_not_confirmed");
  return r;
 };
 const exclusive=async op=>{
  if(busy)throw Error("enrollment_busy");
  busy=true;try{return await op();}finally{busy=false;}
 };
 return Object.freeze({
  enable:({consent}={})=>exclusive(async()=>{
   if(consent!==true)throw Error("consent_required");
   const s=capture();
   if(platform==="android")await notifications.ensureChannel();
   ensure(s);
   let p=await notifications.getPermissions();
   ensure(s);
   if(p?.granted!==true)p=await notifications.requestPermissions();
   ensure(s);
   if(p?.granted!==true)return {state:"permission_denied"};
   const token=await notifications.getExpoToken(projectId);
   ensure(s);
   if(!expoToken(token))throw Error("invalid_push_token");
   const r=await call(s,"POST","/api/mobile/devices",{device_id:deviceId,platform,transport:"expo",push_token:token,opted_in:true});
   if(r.device?.id!==deviceId||r.device?.enabled!==true||r.device?.opted_in!==true||r.device?.transport!=="expo"||r.device?.platform!==platform)throw Error("enrollment_not_confirmed");
   return {state:"registered",deviceId};
  }),
  disable:()=>exclusive(async()=>{
   const s=capture();
   const r=await call(s,"DELETE","/api/mobile/devices/"+deviceId);
   if(r.revoked!==true)throw Error("revocation_not_confirmed");
   return {state:"revoked",deviceId};
  }),
  status:()=>exclusive(async()=>{
   const s=capture();
   const r=await call(s,"GET","/api/mobile/devices");
   if(!Array.isArray(r.devices))throw Error("enrollment_not_confirmed");
   const matches=r.devices.filter(d=>d?.id===deviceId);
   if(matches.length>1)throw Error("enrollment_not_confirmed");
   const d=matches[0];
   return {state:d?.enabled===true&&d?.opted_in===true?"registered":"not_registered",deviceId};
  })
 });
}
module.exports={createNativePushEnrollment};
