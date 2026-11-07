// APDocentePBA Telegram webhook restoration.
// Default: read-only. The ONLY write is setWebhook, requiring an exact explicit approval flag.
// Never print Bot API tokens, webhook secrets, worker configuration values, or chat IDs.
import {pathToFileURL} from 'node:url';

const WORKER='ancient-wildflower-cd37';
const EXPECTED='https://'+WORKER+'.apdocentepba.workers.dev/api/telegram/webhook';
const APPROVAL='RESTORE_AFTER_USER_APPROVAL';

export function validateWebhookSettings(info) {
  const value=String(info?.url||'');
  if (!value) return 'unregistered';
  return value===EXPECTED?'already_registered':'conflicting_webhook';
}

export function safeReport(e) {
  const code=String(e?.code||'diagnostic_failed').replace(/[^a-z0-9_]/gi,'').slice(0,48);
  return {ok:false,reason:code||'diagnostic_failed',production_changed:false};
}

export async function restoreTelegramWebhook({
  env=process.env,fetcher=fetch
}={}) {
  const cfToken=String(env.CLOUDFLARE_API_TOKEN||'');
  if(!cfToken)throw Object.assign(Error('missing Cloudflare credential'),{code:'cloudflare_credential_missing'});
  const getCloudflare=async(path)=>{
    const response=await fetcher('https://api.cloudflare.com/client/v4'+path,{
      method:'GET',
      headers:{Authorization:'Bearer '+cfToken},
      redirect:'error',signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw Object.assign(Error('Cloudflare read failed'),{code:'cloudflare_read_failed'});
    const data=await response.json();
    if(data?.success!==true)throw Object.assign(Error('Cloudflare rejected query'),{code:'cloudflare_read_rejected'});
    return data.result;
  };
  let account=String(env.CLOUDFLARE_ACCOUNT_ID||'');
  if(!account){
    const accounts=await getCloudflare('/accounts?per_page=50');
    if(!Array.isArray(accounts)||accounts.length!==1)throw Object.assign(Error('Cloudflare account ambiguous'),{code:'cloudflare_account_ambiguous'});
    account=String(accounts[0].id||'');
  }
  const root='/accounts/'+encodeURIComponent(account)+'/workers/';
  const deployments=await getCloudflare(root+'scripts/'+encodeURIComponent(WORKER)+'/deployments');
  const active=deployments?.deployments?.[0]?.versions?.filter(v=>Number(v.percentage)>0)||[];
  if(active.length!==1||Number(active[0].percentage)!==100)
    throw Object.assign(Error('Ambiguous live version'),{code:'ambiguous_live_worker'});
  const version=await getCloudflare(root+'workers/'+encodeURIComponent(WORKER)+'/versions/'+encodeURIComponent(active[0].version_id)+'?include=modules');
  const bindings=Array.isArray(version.bindings)?version.bindings:[];
  const find=name=>bindings.find(b=>b.name===name)||null;
  const bot=find('TELEGRAM_BOT_TOKEN');
  const secret=find('TELEGRAM_WEBHOOK_SECRET');
  const name=find('TELEGRAM_BOT_USERNAME');
  const kv=find('EMAIL_SWEEP_STATE');
  if(!kv||kv.type!=='kv_namespace')
    throw Object.assign(Error('Worker KV binding unavailable'),{code:'channel_kv_missing'});
  const botToken=bot?.type==='plain_text'?String(bot.text||''):'';
  const webhookSecret=secret?.type==='plain_text'?String(secret.text||''):'';
  const configuredUsername=name?.type==='plain_text'?String(name.text||'').replace(/^@/,''):'';
  if(!/^\d+:[a-zA-Z0-9_-]+$/.test(botToken))
    throw Object.assign(Error('Bot token binding unavailable'),{code:'bot_token_unavailable'});
  if(!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret))
    throw Object.assign(Error('Webhook secret invalid'),{code:'webhook_secret_unavailable_or_invalid'});
  if(!configuredUsername)
    throw Object.assign(Error('Bot username binding unavailable'),{code:'bot_username_unavailable'});
  const provider=async(method,opts={})=>{
    const response=await fetcher('https://api.telegram.org/bot'+botToken+'/'+method,{
      redirect:'error',signal:AbortSignal.timeout(12000),...opts
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.ok!==true)
      throw Object.assign(Error('Provider request failed'),{code:'telegram_'+method.toLowerCase()+'_failed'});
    return data.result;
  };
  const me=await provider('getMe');
  if(String(me.username||'').toLowerCase()!==configuredUsername.toLowerCase())
    throw Object.assign(Error('Bot username mismatch'),{code:'bot_identity_mismatch'});
  const before=await provider('getWebhookInfo');
  const initial=validateWebhookSettings(before);
  const report={
    ok:true,bot_identity_verified:true,channel_kv_bound:true,
    secret_format_valid:true,webhook_before:initial,production_changed:false,
    pending_updates_before:Number(before.pending_update_count||0)
  };
  if(initial==='conflicting_webhook')
    return {...report,ok:false,reason:'another_webhook_is_registered_refusing_override'};
  if(initial==='already_registered')
    return {...report,result:'already_registered_no_change'};
  if(env.APD_RESTORE_TELEGRAM_WEBHOOK!==APPROVAL)
    return {...report,result:'ready_requires_explicit_approval'};
  // This is the sole permitted mutation. Preserve pending updates and current bot credentials.
  await provider('setWebhook',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      url:EXPECTED,secret_token:webhookSecret,drop_pending_updates:false
    })
  });
  const after=await provider('getWebhookInfo');
  const verified=validateWebhookSettings(after)==='already_registered'
    && (!Array.isArray(after.allowed_updates)||after.allowed_updates.includes('message'));
  return {...report,
    ok:verified,production_changed:true,webhook_after:validateWebhookSettings(after),
    message_updates_allowed:!Array.isArray(after.allowed_updates)||after.allowed_updates.includes('message'),
    result:verified?'webhook_restored_and_verified':'restoration_not_verified'
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await restoreTelegramWebhook();
    console.log('APD_TELEGRAM_WEBHOOK_RESTORE '+JSON.stringify(result));
    if(!result.ok)process.exitCode=2;
  }catch(e){
    console.error('APD_TELEGRAM_WEBHOOK_RESTORE '+JSON.stringify(safeReport(e)));
    process.exitCode=1;
  }
}
