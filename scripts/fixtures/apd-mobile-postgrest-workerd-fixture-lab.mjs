/**
 * PostgREST-over-fetch integration against workerd (synthetic responses).
 * No real Supabase credentials, origin, network requests, ABC or push sender.
 * The service fetch is an explicitly injected in-memory mock.
 */
import {createMobilePushPostgrestAdapterLab} from '../mobile-push-postgrest-adapter-lab.mjs';
import {createMobilePushServerRepositoryLab} from '../mobile-push-server-repository-lab.mjs';
import {createWorkerMobilePushDryRunLab} from '../mobile-push-worker-webcrypto-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEASE='77777777-7777-4777-8777-777777777777';
const OFFER='APD:LAB:SOURCE:456';
const HMAC='FAKE_SERVER_ONLY_SECRET_FOR_TESTS_DO_NOT_REUSE_123456789';
const SECRET='sb_secret_ABCDEF1234567890abcdefXYZABCDEF0';
const PROJECT='https://apdsynthetic123.supabase.co';
const NOW=Date.parse('2026-11-07T20:00:00Z');
const encoder=new TextEncoder();
const iso=x=>new Date(x).toISOString();
const CASES=new Set([
 'ready','closed','revoked','stale-plan','source-down','db-down',
 'lease-expired','unauthorized','redirect','wrong-device'
]);
async function fixtureClaim(){
 const key=await crypto.subtle.importKey('raw',encoder.encode(HMAC),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,
  encoder.encode(JSON.stringify([USER,DEVICE,OFFER]))));
 return {
  event_key:Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join(''),
  user_id:USER,device_id:DEVICE,lease_id:LEASE,
  source_offer_key:OFFER,transport:'expo',attempts:1
 };
}
const json=(d,status=200)=>Response.json(d,{
 status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
export default {
 async fetch(request){
  const u=new URL(request.url);
  const mode=u.pathname.substring(1);
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  if(!CASES.has(mode))return json({error:'not_found'},404);
  const claim=await fixtureClaim();
  const requests=[];
  const fakeFetch=async(url,opts)=>{
   const dbUrl=new URL(url);
   if(dbUrl.origin!==PROJECT||opts.headers.apikey!==SECRET||
      opts.redirect!=='manual'||opts.credentials!=='omit'||
      'Authorization' in opts.headers)
    throw Error('unsafe_server_request');
   requests.push(dbUrl.pathname);
   if(mode==='db-down')throw Error('PRIVATE_NETWORK_UNAVAILABLE');
   if(mode==='redirect')return new Response(null,{
    status:302,headers:{Location:'https://evil.invalid'}
   });
   if(dbUrl.pathname==='/rest/v1/rpc/apd_mobile_claim_push')
    return Response.json([claim]);
   if(dbUrl.pathname==='/rest/v1/apd_mobile_push_outbox')
    return Response.json([{
     event_key:claim.event_key,user_id:USER,device_id:DEVICE,
     source_offer_key:OFFER,status:'leased',lease_id:LEASE,
     leased_until:iso(NOW+(mode==='lease-expired'?-1000:60000))
    }]);
   if(dbUrl.pathname==='/rest/v1/apd_mobile_push_devices')
    return Response.json([{
     id:DEVICE,user_id:mode==='wrong-device'?OTHER:USER,
     platform:'android',transport:'expo',
     enabled:mode!=='revoked',opted_in:true,
     revoked_at:mode==='revoked'?iso(NOW):null
    }]);
   if(dbUrl.pathname==='/rest/v1/rpc/apd_mobile_cancel_push')
    return Response.json(true);
   if(dbUrl.pathname==='/rest/v1/rpc/apd_mobile_finish_push'){
    if(JSON.parse(opts.body).p_sent!==false)
     throw Error('send_unsupported_in_fixture');
    return Response.json(mode!=='lease-expired');
   }
   throw Error('unknown_database_path');
  };
  const database=createMobilePushPostgrestAdapterLab({
   projectUrl:PROJECT,secretKey:SECRET,fetchImpl:fakeFetch
  });
  const plans={async verify({userId}){
   if(userId!==USER)throw Error('wrong_user_plan');
   return {
    user_id:USER,access_active:true,
    verified_at:iso(NOW-(mode==='stale-plan'?700000:30000))
   };
  }};
  const offers={async verify({userId,sourceOfferKey}){
   if(userId!==USER||sourceOfferKey!==OFFER)
    throw Error('wrong_offer_lookup');
   if(mode==='source-down')throw Error('ABC_PRIVATE_TIMEOUT');
   return {source_offer_key:OFFER,matched_user_id:USER,
    compatible:true,published:true,currently_available:true,
    source_current:true,estado:mode==='closed'?'CERRADA':'PUBLICADA',
    verified_at:iso(NOW-30000),expires_at:iso(NOW+300000)};
  }};
  const repository=createMobilePushServerRepositoryLab({
   database,plans,offers,now:()=>NOW
  });
  const job=createWorkerMobilePushDryRunLab({
   authorizeScheduledRun:async()=>mode!=='unauthorized',
   repository,hmacSecret:HMAC,now:()=>NOW
  });
  const state=await job({fixtureOnly:true});
  // No URL, event ID, source key, bearer, apikey or crypto material returned.
  return json({...state,request_count:requests.length,
   paths:requests.map(p=>p.substring(9))});
 }
};
