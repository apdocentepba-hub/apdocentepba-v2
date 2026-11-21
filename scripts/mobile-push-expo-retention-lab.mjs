/**
 * APDocentePBA -- Expo ticket PRIVACY RETENTION lab, OFFLINE.
 * Only calls a private database RPC when an explicit per-invocation
 * authorization passes and fixtureOnly=true. No clock override, no
 * external providers, no cron, no token inspection or delivery ACK.
 */
const denied=Object.freeze({
 ok:false,reason:'not_authorized',retired:0,
 provider_calls:0,delivery_to_device_confirmed:false
});
const unavailable=Object.freeze({
 ok:false,reason:'retention_storage_unavailable',retired:0,
 provider_calls:0,delivery_to_device_confirmed:false
});
export function createMobileExpoRetentionLab({
 database,authorizeRetentionRun
}={}){
 if(typeof database?.retireResolvedExpoTickets!=='function'||
    typeof authorizeRetentionRun!=='function')
  throw Error('missing_expo_retention_dependencies');
 return async function run({
  fixtureOnly=false,limit=10,minAgeDays=90
 }={}){
  if(!Number.isInteger(limit)||limit<1||limit>20||
     !Number.isInteger(minAgeDays)||minAgeDays<90||minAgeDays>3650)
   throw Error('invalid_expo_retention_batch');
  if(fixtureOnly!==true)return denied;
  try{
   if((await authorizeRetentionRun({fixtureOnly,limit,minAgeDays}))!==true)
    return denied;
  }catch{return denied;}
  try{
   const retired=await database.retireResolvedExpoTickets({
    limit,minAgeDays
   });
   if(!Number.isInteger(retired)||retired<0||retired>limit)
    return unavailable;
   return Object.freeze({
    ok:true,retired,provider_calls:0,
    delivery_to_device_confirmed:false
   });
  }catch{return unavailable;}
 };
}
