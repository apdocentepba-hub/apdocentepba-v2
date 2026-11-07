// Read-only Telegram webhook verification. Never prints tokens, chat IDs or raw provider URLs.
// Usage: TELEGRAM_BOT_TOKEN=<set locally> node scripts/check-telegram-webhook-readonly.mjs
import { pathToFileURL } from 'node:url';

export function summarizeWebhookInfo(info, expectedUrl) {
  const actual = String(info?.url || '');
  const allowed = info?.allowed_updates;
  return {
    configured: Boolean(actual),
    correct_endpoint: actual === expectedUrl,
    allowed_message_updates: !Array.isArray(allowed) || allowed.includes('message'),
    pending_updates: Number(info?.pending_update_count || 0),
    last_delivery_error_present: Boolean(info?.last_error_date),
    last_delivery_error_at: info?.last_error_date
      ? new Date(Number(info.last_error_date) * 1000).toISOString() : null
  };
}

export async function checkTelegramWebhook({
  token,
  expectedUrl = 'https://ancient-wildflower-cd37.apdocentepba.workers.dev/api/telegram/webhook',
  fetchFn = fetch
}) {
  if (!token) throw new Error('Telegram token unavailable (not printed)');
  if (!/^\\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Telegram token format invalid');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    // GET is read-only: does not register a new webhook or consume bot updates.
    const response = await fetchFn(
      'https://api.telegram.org/bot' + token + '/getWebhookInfo',
      { method: 'GET', signal: controller.signal, redirect: 'error' }
    );
    if (!response.ok) throw new Error('Telegram getWebhookInfo HTTP ' + response.status);
    const data = await response.json();
    if (data?.ok !== true || !data.result) throw new Error('Telegram rejected webhook status read');
    return summarizeWebhookInfo(data.result, expectedUrl);
  } finally {
    clearTimeout(timer);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkTelegramWebhook({token: process.env.TELEGRAM_BOT_TOKEN});
    console.log('APD_TELEGRAM_READONLY_CHECK ' + JSON.stringify(result));
    if (!result.configured || !result.correct_endpoint || !result.allowed_message_updates
        || result.last_delivery_error_present) process.exitCode = 2;
  } catch (e) {
    // Never print a raw request URL or exception stack: those can contain bot tokens.
    console.error('APD_TELEGRAM_READONLY_CHECK_FAILED ' + (
      String(e?.message || '').startsWith('Telegram getWebhookInfo HTTP ')
        ? 'provider_http_error' : 'check_unavailable'
    ));
    process.exitCode = 1;
  }
}
