import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../worker-live/worker_hotfix.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Function missing: ' + name);
  const end = source.indexOf('\n__name(' + name + ',', start);
  assert.ok(end > start, 'Function boundary missing: ' + name);
  return source.slice(start, end);
}

test('Telegram webhook is fail-closed without configured secret', () => {
  const code = extractFunction('requireTelegramWebhookSecret');
  const fn = vm.runInNewContext(code + ';requireTelegramWebhookSecret');
  const req = (token) => ({ headers: { get: () => token } });
  assert.throws(() => fn(req('anything'), {}), e => e.status === 503);
  assert.throws(() => fn(req('wrong'), { TELEGRAM_WEBHOOK_SECRET: 'correct' }), e => e.status === 401);
  assert.equal(fn(req('correct'), { TELEGRAM_WEBHOOK_SECRET: 'correct' }), undefined);
});

test('Telegram /start deduplication happens only after confirmation succeeds', () => {
  const body = extractFunction('handleTelegramWebhook');
  const start = body.indexOf('if (command.kind === "start")');
  const send = body.indexOf('"\\u2705 APDocentePBA conect\\xF3 este chat con tu cuenta.');
  const markAfterSend = body.indexOf('await markInboundEventProcessed(', send);
  assert.ok(start > 0 && send > start && markAfterSend > send);
  const saved = body.indexOf('const next = await saveTelegramState(env, userId,');
  assert.ok(saved > send && saved < markAfterSend, 'Link must be saved only after bot confirmation');
  const early = body.slice(0, body.indexOf('const command = extractTelegramCommand('));
  assert.doesNotMatch(early, /await markInboundEventProcessed\(/);
  assert.match(body, /if \(command\.kind !== "start" && updateId\)/);
  const sendSection = body.slice(send, markAfterSend);
  assert.doesNotMatch(sendSection, /\.catch\(\(\) => null\)/);
});

test('Telegram ALERTAS response is honest when full digest sending fails', () => {
  const body = extractFunction('handleTelegramWebhook');
  const at = body.indexOf('const reply = buildTelegramQueryDigest(visibleAlertsForRender);');
  assert.ok(at > 0);
  const section = body.slice(at, at + 1800);
  assert.match(section, /let telegramDetailDelivered = false;/);
  assert.match(section, /await sendTelegramLongText\(env, chatId, reply\);\s*telegramDetailDelivered = true;/);
  assert.match(section, /delivered: telegramDetailDelivered/);
});

test('Existing email and WhatsApp routes remain present', () => {
  assert.match(source, /telegram\/webhook/);
  assert.match(source, /whatsapp\/webhook/);
  assert.match(source, /async scheduled\(event, env, ctx\)/);
});
