import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createMobilePushPostgrestAdapterLab} from './mobile-push-postgrest-adapter-lab.mjs';
import {createMobilePushServerRepositoryLab} from './mobile-push-server-repository-lab.mjs';
import {createWorkerMobilePushDryRunLab} from './mobile-push-worker-webcrypto-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEASE='77777777-7777-4777-8777-777777777777';
const OFFER='APD:LAB:SOURCE:456';
const HMAC='FAKE_SERVER_ONLY_SECRET_FOR_TESTS_DO_NOT_REUSE_123456789';
const SECRET='sb_secret_ABCDEF1234567890abcdefXYZABCDEF0';
const HOST='https://apdsynthetic123.supabase.co';
const NOW=Date.parse('2026-11-07T20:00:00Z');
const iso=n=>new Date(n).toISOString();
const EVENT=createHmac('sha256',HMAC).update(JSON.stringify([USER,DEVICE,OFFER])).digest('hex');
const claim={
 event_key:EVENT,user_id:USER,device_id:DEVICE,lease_id:LEASE,
 source_offer_key:OFFER,transport:'expo',attempts:1
};
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json',...headers}
});
function fixture({closed=false,revoked=false,leaseExpired=false,offline=false}={}){
 const requests=[];
 const fakeFetch=async(url,opts)=>{
  const u=new URL(url);
  requests.push({url,opts});
  assert.equal(u.origin,HOST);
  assert.equal(opts.headers.apikey,SECRET);
  assert.equal('Authorization' in opts.headers,false);
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.referrerPolicy,'no-referrer');
  assert.ok(opts.signal);
  if(offline)throw Error('SECRET_PRIVATE_URL_NETWORK_ERROR_DO_NOT_LEAK');
  switch(u.pathname){
   case '/rest/v1/rpc/apd_mobile_claim_push':
    assert.equal(opts.method,'POST');
    assert.deepEqual(JSON.parse(opts.body),{p_limit:10,p_lease_seconds:60});
    return response([claim]);
   case '/rest/v1/apd_mobile_push_outbox':
    assert.equal(opts.method,'GET');
    assert.equal(u.searchParams.get('event_key'),'eq.'+EVENT);
    assert.equal(u.searchParams.get('lease_id'),'eq.'+LEASE);
    assert.equal(u.searchParams.get('status'),'eq.leased');
    assert.equal(u.searchParams.get('limit'),'2');
    assert.equal(u.searchParams.get('select'),
     'event_key,user_id,device_id,source_offer_key,status,lease_id,leased_until');
    return response([{
     event_key:EVENT,user_id:USER,device_id:DEVICE,source_offer_key:OFFER,
     status:'leased',lease_id:LEASE,
     leased_until:iso(NOW+(leaseExpired?-3000:60_000))
    }]);
   case '/rest/v1/apd_mobile_push_devices':
    assert.equal(opts.method,'GET');
    assert.equal(u.searchParams.get('id'),'eq.'+DEVICE);
    assert.equal(u.searchParams.get('user_id'),'eq.'+USER);
    assert.equal(u.searchParams.get('limit'),'2');
    assert.equal(u.searchParams.get('select'),
     'id,user_id,platform,transport,enabled,opted_in,revoked_at');
    return response([{
     id:DEVICE,user_id:USER,platform:'android',
     transport:'expo',enabled:!revoked,opted_in:true,
     revoked_at:revoked?iso(NOW):null
    }]);
   case '/rest/v1/rpc/apd_mobile_cancel_push':
    assert.deepEqual(JSON.parse(opts.body),{p_event_key:EVENT,p_lease_id:LEASE});
    return response(true);
   case '/rest/v1/rpc/apd_mobile_finish_push':
    assert.deepEqual(JSON.parse(opts.body),{
     p_event_key:EVENT,p_lease_id:LEASE,p_sent:false
    });
    return response(!leaseExpired);
   default:throw Error('UNEXPECTED_PATH');
  }
 };
 const db=createMobilePushPostgrestAdapterLab({
  projectUrl:HOST,secretKey:SECRET,fetchImpl:fakeFetch
 });
 const plans={verify:async({userId})=>{
  assert.equal(userId,USER);
  return {user_id:USER,access_active:true,verified_at:iso(NOW-10_000)};
 }};
 const offers={verify:async({userId,sourceOfferKey})=>{
  assert.equal(userId,USER);
  assert.equal(sourceOfferKey,OFFER);
  return {
   source_offer_key:OFFER,matched_user_id:USER,compatible:true,
   published:true,source_current:true,currently_available:true,
   verified_at:iso(NOW-10_000),
   expires_at:iso(NOW+60_000),estado:closed?'CERRADA':'PUBLICADA'
  };
 }};
 const repository=createMobilePushServerRepositoryLab({
  database:db,plans,offers,now:()=>NOW
 });
 const job=createWorkerMobilePushDryRunLab({
  authorizeScheduledRun:async()=>true,
  repository,hmacSecret:HMAC,now:()=>NOW
 });
 return {db,requests,job,repository};
}
test('PostgREST synthetic HTTP → lease → device → plan → ABC → ready (zero sends)',async()=>{
 const f=fixture();
 assert.deepEqual(await f.job({}),{
  ok:true,ready:1,cancelled:0,retried:0,provider_calls:0
 });
 assert.equal(f.requests.length,3);
 assert.deepEqual(f.requests.map(x=>new URL(x.url).pathname),[
  '/rest/v1/rpc/apd_mobile_claim_push',
  '/rest/v1/apd_mobile_push_outbox',
  '/rest/v1/apd_mobile_push_devices'
 ]);
});
test('closed official offer cancels current SQL lease via RPC',async()=>{
 const f=fixture({closed:true});
 const o=await f.job({});
 assert.equal(o.cancelled,1);
 assert.equal(o.provider_calls,0);
 assert.equal(f.requests.length,4);
 assert.equal(new URL(f.requests[3].url).pathname,
  '/rest/v1/rpc/apd_mobile_cancel_push');
});
test('revoked device cancels before an authoritative plan allows anything',async()=>{
 const f=fixture({revoked:true});
 const o=await f.job({});
 assert.equal(o.cancelled,1);
 assert.equal(o.provider_calls,0);
});
test('expired SQL lease is not marked as retried by server or SQL',async()=>{
 const f=fixture({leaseExpired:true});
 const o=await f.job({});
 assert.equal(o.ready,0);
 assert.equal(o.retried,0);
 assert.equal(o.provider_calls,0);
 // A stale SQL lease skips the device read and cannot be marked as sent.
 assert.equal(f.requests.length,3);
 assert.equal(new URL(f.requests[2].url).pathname,
  '/rest/v1/rpc/apd_mobile_finish_push');
});
test('network failure fails closed and no secret/error is reported',async()=>{
 const f=fixture({offline:true});
 const o=await f.job({});
 assert.equal(o.reason,'repository_unavailable');
 assert.equal(o.provider_calls,0);
 assert.ok(!JSON.stringify(o).includes('PRIVATE_URL'));
 assert.ok(!JSON.stringify(o).includes(SECRET));
});
test('no network exists unless a trusted server injects fetch',()=>{
 for(const url of [
  'http://apdsynthetic123.supabase.co',
  'https://apdsynthetic123.supabase.co.evil.invalid',
  'https://apdsynthetic123.supabase.co/other',
  'https://apdsynthetic123.supabase.co?redirect=https://evil.invalid',
  'https://user:pass@apdsynthetic123.supabase.co/',
  'https://127.0.0.1/',
  'https://localhost/',
  'https://apdsynthetic123.supabase.co:444/'
 ]){
  assert.throws(()=>createMobilePushPostgrestAdapterLab({
   projectUrl:url,secretKey:SECRET,fetchImpl:async()=>response([])
  }),/postgrest_configuration_invalid/,url);
 }
 for(const key of ['sb_publishable_12345678901234567890','eyJ.def.ghi','',null])
  assert.throws(()=>createMobilePushPostgrestAdapterLab({
   projectUrl:HOST,secretKey:key,fetchImpl:async()=>response([])
  }),/postgrest_configuration_invalid/);
 assert.throws(()=>createMobilePushPostgrestAdapterLab({
  projectUrl:HOST,secretKey:SECRET
 }),/postgrest_configuration_invalid/);
});
test('bounded claim and false-only retry never issue unsafe requests',async()=>{
 const f=fixture();
 for(const n of [0,11,2.2,NaN])
  await assert.rejects(()=>f.db.claim({limit:n,leaseSeconds:60}),
   /invalid_claim_bounds/);
 await assert.rejects(()=>f.db.retry({
  eventKey:EVENT,leaseId:LEASE,sent:true
 }),/send_unsupported_in_lab/);
 await assert.rejects(()=>f.db.cancel({
  eventKey:'NOT_A_HASH',leaseId:LEASE
 }),/invalid_lease_reference/);
 assert.equal(f.requests.length,0);
});
test('malformed API responses and duplicates are never accepted as valid leases',async()=>{
 for(const kind of ['redirect','unauthorized','html','huge','duplicated']){
  const fakeFetch=async()=>{
   if(kind==='redirect')return new Response(null,{status:302,headers:{Location:'https://evil.invalid'}});
   if(kind==='unauthorized')return response({error:'secret data'},401);
   if(kind==='html')return new Response('<script>steal()</script>',{
    status:200,headers:{'Content-Type':'text/html'}
   });
   if(kind==='huge')return response('x'.repeat(20_000));
   return response([claim,claim]);
  };
  const db=createMobilePushPostgrestAdapterLab({
   projectUrl:HOST,secretKey:SECRET,fetchImpl:fakeFetch
  });
  if(kind==='duplicated'){
   const two=await db.claim({limit:10,leaseSeconds:60});
   assert.equal(two.length,2);
   // Multi-row results are rejected by the outer trusted repository.
  }else{
   await assert.rejects(()=>db.claim({limit:10,leaseSeconds:60}),
    kind==='redirect'||kind==='unauthorized'?
    /postgrest_unavailable/:/postgrest_invalid_response/);
  }
 }
});
test('device lookup uses permitted columns only, never encrypted token',async()=>{
 const f=fixture();
 const device=await f.db.readOwnedDevice({userId:USER,deviceId:DEVICE});
 assert.equal(device.token_available,true);
 assert.equal(device.token_revoked,false);
 assert.ok(!('token_ciphertext' in device));
 assert.ok(!('token_hash' in device));
 assert.equal(f.requests.length,1);
 assert.ok(!f.requests[0].url.includes('token_'));
});
test('an empty or ambiguous device response fails closed',async()=>{
 for(const data of [[],[{id:DEVICE,user_id:USER,platform:'android',transport:'expo',
  enabled:true,opted_in:true,revoked_at:null},{id:DEVICE}]]){
  const db=createMobilePushPostgrestAdapterLab({
   projectUrl:HOST,secretKey:SECRET,fetchImpl:async()=>response(data)
  });
  if(data.length===0)
   assert.equal(await db.readOwnedDevice({userId:USER,deviceId:DEVICE}),null);
  else
   await assert.rejects(()=>db.readOwnedDevice({userId:USER,deviceId:DEVICE}),
    /postgrest_ambiguous_result/);
 }
});
