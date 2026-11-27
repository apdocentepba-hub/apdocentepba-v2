/**
 * APDocentePBA -- OFFLINE / LAB ONLY reconciliation of expired Expo receipts.
 *
 * Server-only authorization gate, bounded expiry, DB server clock.
 * No Expo HTTP, token, provider client, cron, queue retry or delivery ACK.
 * SQL atomically stores 'uncertain' (or 'late_audit' for revoked rows);
 * this function returns only non-sensitive aggregate counters.
 */
const denied=Object.freeze({
 ok:false,reason:'not_authorized',expired:0,
 provider_calls:0,delivery_to_device_confirmed:false
});
const unavailable=Object.freeze({
 ok:false,reason:'reconciliation_storage_unavailable',expired:0,
 provider_calls:0,delivery_to_device_confirmed:false
});
export function createMobileExpoExpiryReconcilerLab({
 database,authorizeMaintenanceRun
}={}){
 if(typeof database?.expireMissingExpoReceipts!=='function'||
    typeof authorizeMaintenanceRun!=='function')
  throw Error('missing_reconciliation_lab_dependencies');
 return async function expire({fixtureOnly=false,limit=10}={}){
  if(!Number.isInteger(limit)||limit<1||limit>20)
   throw Error('invalid_reconciliation_batch');
  // This lab never runs against production; no scheduling path is exported.
  if(fixtureOnly!==true)return denied;
  try{
   if((await authorizeMaintenanceRun({fixtureOnly,limit}))!==true)
    return denied;
  }catch{return denied;}
  try{
   const expired=await database.expireMissingExpoReceipts({limit});
   if(!Number.isInteger(expired)||expired<0||expired>limit)
    return unavailable;
   return Object.freeze({
    ok:true,expired,provider_calls:0,
    delivery_to_device_confirmed:false
   });
  }catch{return unavailable;}
 };
}
