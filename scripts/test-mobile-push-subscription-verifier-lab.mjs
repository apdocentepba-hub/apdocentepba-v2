import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobilePushSubscriptionVerifierLab}
 from './mobile-push-subscription-verifier-lab.mjs';
import {createMobilePushPostgrestAdapterLab}
 from './mobile-push-postgrest-adapter-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const SUB='99999999-9999-4999-8999-999999999999';
const NOW=Date.parse('2026-11-08T10:00:00Z');
const ISO=t=>new Date(t).toISOString();
const KEY='sb_secret_SYNTHETIC_NO_REAL_SUPABASE_CREDENTIALS_12345';
const PROJECT_URL='https://apdsynthetic123.supabase.co';
const candidate=()=>({
 id:SUB,user_id:USER,plan_code:'PLUS',status:'ACTIVE',
 created_at:ISO(NOW-24*3600_000),trial_ends_at:null,
 current_period_ends_at:ISO(NOW+3*3600_000)
});
const reply=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json'}
});
function fixture({account={user_id:USER,active:true},
 subscriptions=[candidate()],catalog={code:'PLUS',is_active:true},
 clock=()=>NOW,throwAccount=false,throwSubscriptions=false,throwCatalog=false
}={}){
 const calls={account:0,subscription:0,catalog:0};
 const database={
  async readAccountActive({userId}){
   calls.account++;assert.equal(userId,USER);
   if(throwAccount)throw Error('SECRET_ACCOUNT_NETWORK_FAILURE');
   return account;
  },
  async readSubscriptionCandidates({userId}){
   calls.subscription++;assert.equal(userId,USER);
   if(throwSubscriptions)throw Error('SECRET_SUBSCRIPTION_ERROR');
   return subscriptions;
  },
  async readCatalogPlan({planCode}){
   calls.catalog++;
   if(throwCatalog)throw Error('SECRET_CATALOG_NETWORK_FAILURE');
   assert.ok(['PLUS','PREMIUM','INSIGNE','TRIAL_7D'].includes(planCode));
   return catalog?.code===planCode?catalog:null;
  }
 };
 const verifier=createMobilePushSubscriptionVerifierLab({database,now:clock});
 return {verifier,calls};
}
test('authorized account + paid future end + catalog returns minimal verified context',async()=>{
 const f=fixture();
 assert.deepEqual(await f.verifier.verify({userId:USER}),{
  user_id:USER,access_active:true,verified_at:ISO(NOW)
 });
 assert.deepEqual(f.calls,{account:1,subscription:1,catalog:1});
 const output=JSON.stringify(await f.verifier.verify({userId:USER}));
 assert.ok(!/mercadopago|plan_code|payer|status|email/.test(output));
});
test('official alias PRO requires PREMIUM catalog, never auto-fallback to PLUS',async()=>{
 const row={...candidate(),plan_code:' PRO '};
 const f=fixture({subscriptions:[row],catalog:{code:'PREMIUM',is_active:true}});
 assert.equal((await f.verifier.verify({userId:USER})).access_active,true);
});
test('7-day trial only allowed with TRIALING or ACTIVE and explicit future trial end',async()=>{
 const base={...candidate(),plan_code:'TRIAL_7D',status:'TRIALING',
  trial_ends_at:ISO(NOW+3600_000),current_period_ends_at:null};
 const accepted=fixture({subscriptions:[base],catalog:{code:'TRIAL_7D',is_active:true}});
 assert.equal((await accepted.verifier.verify({userId:USER})).access_active,true);
 for(const row of [
  {...base,trial_ends_at:null},
  {...base,trial_ends_at:ISO(NOW-1000)},
  {...base,status:'PENDING'},
  {...base,status:'PAUSED'},
  {...base,status:'BETA'},
  {...base,status:'CANCELLED'}
 ]){
  const f=fixture({subscriptions:[row]});
  assert.equal((await f.verifier.verify({userId:USER})).access_active,false);
  assert.equal(f.calls.catalog,0);
 }
});
for(const [name,row] of [
 ['paid no expiry',{...candidate(),current_period_ends_at:null}],
 ['expired paid',{...candidate(),current_period_ends_at:ISO(NOW-1000)}],
 ['pending',{...candidate(),status:'PENDING'}],
 ['paused',{...candidate(),status:'PAUSED'}],
 ['beta',{...candidate(),status:'BETA'}],
 ['cancelled',{...candidate(),status:'CANCELLED'}],
 ['unknown code',{...candidate(),plan_code:'FUTURE_SECRET_PLAN'}],
 ['INSIGNE no bypass',{...candidate(),plan_code:'INSIGNE',
  status:'PAUSED',current_period_ends_at:null}]
]){
 test('fail closed for '+name,async()=>{
  const f=fixture({subscriptions:[row]});
  assert.equal((await f.verifier.verify({userId:USER})).access_active,false);
  assert.equal(f.calls.catalog,0);
 });
}
test('newer pending subscription blocks fallback to older ACTIVE row',async()=>{
 const recent={...candidate(),status:'PENDING'};
 const old={...candidate(),id:'99999999-9999-4999-8999-999999999998',
  created_at:ISO(NOW-2*24*3600_000)};
 const f=fixture({subscriptions:[recent,old]});
 assert.equal((await f.verifier.verify({userId:USER})).access_active,false);
});
test('account revoked or absent never requests subscriber/plan details',async()=>{
 for(const account of [{user_id:USER,active:false},null]){
  const f=fixture({account});
  assert.equal((await f.verifier.verify({userId:USER})).access_active,false);
  assert.equal(f.calls.subscription,0);
  assert.equal(f.calls.catalog,0);
 }
});
test('catalog disabled, missing or revoked prevents notification',async()=>{
 for(const catalog of [null,{code:'PLUS',is_active:false}]){
  const f=fixture({catalog});
  assert.equal((await f.verifier.verify({userId:USER})).access_active,false);
 }
});
test('invalid authoritative identities and ambiguities trigger retry, not fabricated inactive',async()=>{
 const old={...candidate(),id:'99999999-9999-4999-8999-999999999998',
  created_at:ISO(NOW-48*3600_000)};
 for(const args of [
  {account:{user_id:OTHER,active:true}},
  {account:{user_id:USER,active:'true'}},
  {subscriptions:[{...candidate(),user_id:OTHER}]},
  {subscriptions:[{...candidate(),created_at:'bad-date'}]},
  {subscriptions:[old,candidate()]},
  {subscriptions:[candidate(),{...candidate()}]},
  {subscriptions:[candidate(),{...old,created_at:candidate().created_at}]},
  {catalog:{code:'PLUS',is_active:'true'}}
 ]){
  const f=fixture(args);
  await assert.rejects(()=>f.verifier.verify({userId:USER}),
   /invalid_authoritative|ambiguous_subscription_history/);
 }
});
test('unavailable subscription, account or catalog throws without leaking errors',async()=>{
 for(const flag of ['throwAccount','throwSubscriptions','throwCatalog']){
  const f=fixture({[flag]:true});
  await assert.rejects(()=>f.verifier.verify({userId:USER}),
   /SECRET_/);
 }
});
test('any future-created or stale source history is rejected',async()=>{
 for(const when of [ISO(NOW+10_000),'2026-02-31T10:00:00Z']){
  const f=fixture({subscriptions:[{...candidate(),created_at:when}]});
  await assert.rejects(()=>f.verifier.verify({userId:USER}),
   /ambiguous_subscription_history/);
 }
});
test('mandatory dependencies and verified server user ID only',async()=>{
 assert.throws(()=>createMobilePushSubscriptionVerifierLab(),
  /missing_subscription_database_dependency/);
 const f=fixture();
 await assert.rejects(()=>f.verifier.verify({userId:OTHER.slice(1)}),
  /invalid_subscription_user/);
 assert.equal(f.calls.account,0);
});
test('PostgREST private subscription reads expose only narrow projections and keys',async()=>{
 const requests=[];
 const fetchImpl=async(url,opts)=>{
  const u=new URL(url);
  requests.push(u);
  assert.equal(opts.method,'GET');
  assert.equal(opts.headers.apikey,KEY);
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.redirect,'manual');
  if(u.pathname.endsWith('/users')){
   assert.equal(u.searchParams.get('id'),'eq.'+USER);
   assert.equal(u.searchParams.get('select'),'id,activo');
   return reply([{id:USER,activo:true,email:'PRIVATE_EMAIL'}]);
  }
  if(u.pathname.endsWith('/user_subscriptions')){
   assert.equal(u.searchParams.get('user_id'),'eq.'+USER);
   assert.equal(u.searchParams.get('order'),'created_at.desc');
   assert.equal(u.searchParams.get('limit'),'6');
   assert.equal(u.searchParams.get('select'),
    'id,user_id,plan_code,status,created_at,trial_ends_at,current_period_ends_at');
   return reply([{...candidate(),payer_email:'PRIVATE_EMAIL'}]);
  }
  if(u.pathname.endsWith('/subscription_plans')){
   assert.equal(u.searchParams.get('code'),'eq.PLUS');
   assert.equal(u.searchParams.get('select'),'code,is_active');
   return reply([{code:'PLUS',is_active:true,mercadopago_plan_id:'PRIVATE_PAYMENT'}]);
  }
  throw Error('unexpected_server_table');
 };
 const db=createMobilePushPostgrestAdapterLab({
  projectUrl:PROJECT_URL,secretKey:KEY,fetchImpl
 });
 const f=createMobilePushSubscriptionVerifierLab({database:db,now:()=>NOW});
 const result=await f.verify({userId:USER});
 assert.equal(result.access_active,true);
 assert.equal(requests.length,3);
 assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
 for(const u of requests)
  assert.ok(!/payer|password|token|email|dni|mercadopago/i.test(u.search));
});
test('malformed and unbounded PostgREST subscription result is not trusted',async()=>{
 const rows=Array.from({length:6},(_,i)=>({
  ...candidate(),id:'99999999-9999-4999-8999-'+String(i).padStart(12,'0')
 }));
 for(const data of [rows,[{...candidate(),user_id:OTHER}],
  [{...candidate(),id:'not-uuid'}],[{...candidate(),status:42}]]){
  const db=createMobilePushPostgrestAdapterLab({
   projectUrl:PROJECT_URL,secretKey:KEY,fetchImpl:async()=>reply(data)
  });
  await assert.rejects(()=>db.readSubscriptionCandidates({userId:USER}),
   /postgrest_subscription_set_ambiguous|postgrest_invalid_subscription/);
 }
});
