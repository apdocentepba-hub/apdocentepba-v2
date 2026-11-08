/**
 * Future Cloudflare scheduled-job boundary, LAB CONTRACT ONLY.
 * Pure server-side orchestration: NO HTTP route, provider, DB or network.
 * The Worker must inject a trusted scheduler authorizer and repository.
 * Repository implementations must derive claim/context from SQL and ABC,
 * not from a request body, phone or browser.
 *
 * NOTE: this Node test contract is not a deployable Worker. The HMAC
 * evaluator currently imports node:crypto; runtime compatibility remains
 * a separate integration gate.
 */
import {dryRunMobilePushDispatchLab} from './mobile-push-dispatch-preflight-lab.mjs';

const denied=Object.freeze({ok:false,reason:'not_authorized',provider_calls:0});
const unavailable=Object.freeze({ok:false,reason:'repository_unavailable',provider_calls:0});

export function createMobilePushScheduledJobLab({
 authorizeScheduledRun, repository, hmacSecret, now=()=>Date.now()
}={}){
 if(typeof authorizeScheduledRun!=='function'||!repository||
    !['claimReserved','loadVerifiedContext','cancelReserved','retryReserved']
      .every(k=>typeof repository[k]==='function')||
    typeof now!=='function')
  throw Error('missing_trusted_job_dependencies');

 return async function scheduledJob(jobContext){
  // Never trust a caller-supplied "isCron" or "isAdmin" flag.
  let authorized=false;
  try{authorized=(await authorizeScheduledRun(jobContext))===true;}
  catch{return denied;}
  if(!authorized)return denied;

  const outbox={
   claim:({limit})=>repository.claimReserved({limit}),
   cancelEvent:(eventKey,{leaseId})=>
    repository.cancelReserved({eventKey,leaseId}),
   settle:({eventKey,leaseId,sent})=>{
    if(sent===true)throw Error('sending_is_disabled_in_lab');
    return repository.retryReserved({eventKey,leaseId});
   }
  };
  try{
   const result=await dryRunMobilePushDispatchLab({
    outbox,
    // Inputs are derived from an already reserved SQL event, never a client.
    loadContext:(eventKey,deviceId,claim)=>
     repository.loadVerifiedContext({eventKey,deviceId,leaseId:claim.lease_id}),
    hmacSecret,now,limit:10
   });
   return Object.freeze({ok:true,...result});
  }catch{
   // No raw tokens, secrets, SQL errors or source records in responses.
   return unavailable;
  }
 };
}
