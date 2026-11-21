import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreTelegramWebhook} from './restore-telegram-webhook-guarded.mjs';

const worker='https://ancient-wildflower-cd37.apdocentepba.workers.dev/api/telegram/webhook';
function mock({approval=false,hook='',token='12345:synthetic_only',secret='secret_test_123',username='apd_test'}={}) {
  const calls=[];
  let current=hook;
  const env={
    CLOUDFLARE_API_TOKEN:'synthetic_cf_token',
    CLOUDFLARE_ACCOUNT_ID:'test',
    APD_RESTORE_TELEGRAM_WEBHOOK:approval?'RESTORE_AFTER_USER_APPROVAL':''
  };
  const response=(result)=>({ok:true,status:200,json:async()=>({success:true,ok:true,result})});
  const fetcher=async(url,options)=>{
    calls.push({method:options.method||'GET',type:url.split('/').pop()});
    if(url.endsWith('/deployments'))return response({deployments:[{versions:[{version_id:'v',percentage:100}]}]});
    if(url.includes('/versions/'))return response({bindings:[
      {name:'TELEGRAM_BOT_TOKEN',type:'plain_text',text:token},
      {name:'TELEGRAM_BOT_USERNAME',type:'plain_text',text:username},
      {name:'TELEGRAM_WEBHOOK_SECRET',type:'plain_text',text:secret},
      {name:'EMAIL_SWEEP_STATE',type:'kv_namespace'}
    ]});
    if(url.endsWith('/getMe'))return response({username:'apd_test'});
    if(url.endsWith('/getWebhookInfo'))return response({url:current,pending_update_count:1,allowed_updates:['message']});
    if(url.endsWith('/setWebhook')){
      const payload=JSON.parse(options.body);
      assert.deepEqual(Object.keys(payload).sort(),['drop_pending_updates','secret_token','url']);
      assert.equal(payload.url,worker);
      assert.equal(payload.secret_token,secret);
      assert.equal(payload.drop_pending_updates,false);
      current=payload.url;
      return response(true);
    }
    throw Error('unexpected_mock_request');
  };
  return {env,fetcher,calls};
}

test('default dry-run never calls setWebhook',async()=>{
  const m=mock();
  const outcome=await restoreTelegramWebhook(m);
  assert.equal(outcome.result,'ready_requires_explicit_approval');
  assert.equal(m.calls.some(c=>c.method==='POST'),false);
});
test('explicit flag restores unregistered webhook and verifies it',async()=>{
  const m=mock({approval:true});
  const outcome=await restoreTelegramWebhook(m);
  assert.equal(outcome.result,'webhook_restored_and_verified');
  assert.equal(outcome.production_changed,true);
  assert.equal(m.calls.filter(c=>c.method==='POST').length,1);
});
test('refuses to overwrite an unrelated webhook',async()=>{
  const m=mock({approval:true,hook:'https://example.invalid/other'});
  const outcome=await restoreTelegramWebhook(m);
  assert.equal(outcome.reason,'another_webhook_is_registered_refusing_override');
  assert.equal(m.calls.some(c=>c.method==='POST'),false);
});
test('idempotent when target webhook already exists',async()=>{
  const m=mock({approval:true,hook:worker});
  const outcome=await restoreTelegramWebhook(m);
  assert.equal(outcome.result,'already_registered_no_change');
  assert.equal(m.calls.some(c=>c.method==='POST'),false);
});
test('invalid credentials and secrets block all mutations',async()=>{
  for (const config of [
    {approval:true,token:'invalid'},
    {approval:true,secret:'contains spaces'},
    {approval:true,username:'wrong_bot'}
  ]) {
    const m=mock(config);
    await assert.rejects(restoreTelegramWebhook(m));
    assert.equal(m.calls.some(c=>c.method==='POST'),false);
  }
});
