import fs from 'node:fs';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('usage: node scripts/test-email-slot-dedupe-live.mjs <worker_hotfix.js>');

const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('async function runEmailAlertsSweep');
const end = source.indexOf('function getArgentinaDigestSlotInfo', start);
if (start < 0 || end < 0) throw new Error('runEmailAlertsSweep boundaries not found');

const sweep = source.slice(start, end);
const renderAt = sweep.indexOf('const html = buildDigestHtml');
if (renderAt < 0) throw new Error('email render/send boundary not found');

const beforeProviderSend = sweep.slice(0, renderAt);
if (beforeProviderSend.includes('await kv.put(perUserSentKey')) {
  throw new Error('BUG: per-user slot sent marker is written before Brevo confirms delivery');
}

const successAt = sweep.indexOf('if (send?.ok)');
if (successAt < 0) throw new Error('successful provider branch not found');
const successWindow = sweep.slice(successAt, successAt + 1800);
if (!successWindow.includes('await kv.put(perUserSentKey')) {
  throw new Error('per-user slot sent marker must be written after provider success');
}

console.log('PASS: slot sent marker is written only after provider success');
