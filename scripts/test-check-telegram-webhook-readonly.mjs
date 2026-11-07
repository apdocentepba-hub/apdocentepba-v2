import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeWebhookInfo, checkTelegramWebhook} from './check-telegram-webhook-readonly.mjs';

const endpoint = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev/api/telegram/webhook';

test('read-only webhook status accepts healthy state without disclosing URL', () => {
  const result = summarizeWebhookInfo({url:endpoint,pending_update_count:0,allowed_updates:['message']},endpoint);
  assert.deepEqual(result, {
    configured:true,correct_endpoint:true,allowed_message_updates:true,pending_updates:0,
    last_delivery_error_present:false,last_delivery_error_at:null
  });
  assert.equal(JSON.stringify(result).includes('workers.dev'),false);
});

test('missing or wrong webhook URL is not healthy', () => {
  assert.equal(summarizeWebhookInfo({url:''},endpoint).configured,false);
  assert.equal(summarizeWebhookInfo({url:'https://example.invalid/webhook'},endpoint).correct_endpoint,false);
  assert.equal(summarizeWebhookInfo({url:endpoint,allowed_updates:['callback_query']},endpoint).allowed_message_updates,false);
});

test('Telegram delivery failures and queued updates are surfaced', () => {
  const x=summarizeWebhookInfo({
    url:endpoint,pending_update_count:9,last_error_date:1794052800
  },endpoint);
  assert.equal(x.pending_updates,9);
  assert.equal(x.last_delivery_error_present,true);
  assert.equal(typeof x.last_delivery_error_at,'string');
});

test('diagnostic only performs getWebhookInfo, never sends or changes webhook', async () => {
  const seen=[];
  const mockFetch = async (url, options) => {
    seen.push([url,options.method]);
    return {ok:true,json:async()=>({ok:true,result:{url:endpoint}})};
  };
  const result=await checkTelegramWebhook({token:'123456:synthetic-test-only',expectedUrl:endpoint,fetchFn:mockFetch});
  assert.equal(result.correct_endpoint,true);
  assert.equal(seen.length,1);
  assert.match(seen[0][0],/\/getWebhookInfo$/);
  assert.equal(seen[0][1],'GET');
});

test('rejects malformed token before calling Telegram', async () => {
  let called=false;
  await assert.rejects(
    checkTelegramWebhook({token:'bad/secret', fetchFn:async()=>{called=true;throw Error('fetch should not run');}}),
    /token format invalid/
  );
  assert.equal(called,false);
});
