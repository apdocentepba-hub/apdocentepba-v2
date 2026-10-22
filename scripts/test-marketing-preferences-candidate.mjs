import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const full=fs.readFileSync('tmp/apd-marketing-consent-candidate/worker_hotfix.mjs','utf8');
const start=full.indexOf('async function handleMarketingPreferencesSecureV1(');
const end=full.indexOf('__name(handleMarketingPreferencesSecureV1,',start);
assert.ok(start>0 && end>start,'Authenticated marketing handler missing');
const section=full.slice(start,end);
assert.match(section,/getSessionUserByBearer\(env, request\)/);
assert.match(section,/authUser\.id/);
assert.doesNotMatch(section,/body\?.user_id/);
assert.doesNotMatch(section,/enviarMailBrevo|fetch\(['"]https:\/\/api.brevo.com/);

function mock({authenticated=true,existing=null,readFails=false,writeFails=false}={}){
 const reads=[],writes=[];
 const ctx={
  getSessionUserByBearer:async()=>authenticated?{id:'own-account-id'}:null,
  supabaseSelect:async(_env,path)=>{
    reads.push(path);
    if(readFails)throw new Error('DB unavailable');
    return existing?[existing]:[];
  },
  supabaseUpsertReturning:async(_env,table,rows,conflict)=>{
    if(writeFails)throw new Error('DB unavailable');
    writes.push({table,rows,conflict});
    return rows;
  },
  json2:(object,status=200)=>new Response(JSON.stringify(object),{
    status,headers:{'Content-Type':'application/json'}
  }),
  Response,Date,encodeURIComponent
 };
 const fn=vm.runInNewContext(section+'\nhandleMarketingPreferencesSecureV1',ctx);
 async function query(method='GET',body=null,headers={}){
   const req=new Request('https://test.invalid/api/account/marketing-preferences',{
     method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},
     ...(body?{body:JSON.stringify(body)}:{})
   });
   const res=await fn(req,{});
   return {status:res.status,data:await res.json()};
 }
 return {query,reads,writes};
}

test('unauthenticated requests cannot read or change preferences',async()=>{
 const x=mock({authenticated:false});
 assert.equal((await x.query()).status,401);
 assert.equal((await x.query('POST',{action:'opt_out'})).status,401);
 assert.deepEqual(x.reads,[]);
 assert.deepEqual(x.writes,[]);
});
test('no row = no consent; email alert preference never grants marketing consent',async()=>{
 const x=mock();
 const r=await x.query();
 assert.equal(r.status,200);
 assert.equal(r.data.marketing.status,'not_requested');
 assert.equal(r.data.marketing.eligible_for_campaign,false);
 assert.equal(x.reads.length,1);
 assert.match(x.reads[0],/user_id=eq.own-account-id/);
});
test('cross-account user_id in payload cannot change another account',async()=>{
 const x=mock();
 const r=await x.query('POST',{action:'opt_out',user_id:'victim-id'});
 assert.equal(r.status,200);
 assert.equal(x.writes.length,1);
 assert.equal(x.writes[0].rows[0].user_id,'own-account-id');
 assert.equal(x.writes[0].rows[0].status,'unsubscribed');
 assert.equal(x.writes[0].rows[0].provider_status,'blocked');
 assert.equal(r.data.eligible_for_campaign,false);
});
test('requesting future confirmation never counts as subscribing',async()=>{
 const x=mock({existing:{status:'unsubscribed',provider_status:'blocked',
 unsubscribed_at:'2026-10-20T00:00:00Z'}});
 const r=await x.query('POST',{action:'request_confirmation'});
 assert.equal(r.status,200);
 assert.equal(r.data.status,'pending_confirmation');
 assert.equal(r.data.eligible_for_campaign,false);
 assert.equal(r.data.confirmation_email_sent,false);
 assert.equal(x.writes[0].rows[0].provider_status,'blocked');
 assert.equal(x.writes[0].rows[0].confirmed_at,null);
});
test('malformed action cannot spoof subscription',async()=>{
 const x=mock();
 for(const body of [
  {action:'subscribe'}, {action:'confirm',status:'subscribed'},
  {action:'request_confirmation',confirmed_at:'2030-01-01Z'} // this is still just pending
 ]){
  const r=await x.query('POST',body);
  if(body.action==='request_confirmation'){
    assert.equal(r.status,200);
    assert.equal(x.writes.at(-1).rows[0].status,'pending_confirmation');
  }else assert.equal(r.status,400);
 }
});
test('database failures fail closed',async()=>{
 assert.equal((await mock({readFails:true}).query()).status,503);
 assert.equal((await mock({writeFails:true}).query('POST',{action:'opt_out'})).status,503);
});
test('only GET/POST; privileged consent not writable through API',async()=>{
 const x=mock();
 assert.equal((await x.query('DELETE')).status,405);
 const r=await x.query('GET');
 assert.equal(r.data.marketing.eligible_for_campaign,false);
});
test('even a subscribed row needs provider eligibility and verification timestamp',async()=>{
 for(const row of [
 {status:'subscribed',provider_status:'unknown',confirmed_at:'2026-10-21T00:00:00Z'},
 {status:'subscribed',provider_status:'blocked',confirmed_at:'2026-10-21T00:00:00Z'},
 {status:'subscribed',provider_status:'eligible',confirmed_at:null}
 ])assert.equal((await mock({existing:row}).query()).data.marketing.eligible_for_campaign,false);
});
