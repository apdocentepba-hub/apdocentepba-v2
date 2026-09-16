import fs from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: node scripts/patch-live-manual-email-dedupe.mjs <input> <output>');
let source = fs.readFileSync(input, 'utf8');

const sweepMarker = 'async function runEmailAlertsSweep(env, options = {}) {';
const sweepIndex = source.indexOf(sweepMarker);
if (sweepIndex < 0) throw new Error('runEmailAlertsSweep marker not found');
if (source.includes('function buildEmailDigestDedupeKey(')) throw new Error('manual email dedupe helper already exists');

const helper = `function buildEmailDigestDedupeKey({ source = "", slotKey = "", userId = "", visibleAlertKeys = [], idempotencyKey = "", now = Date.now() } = {}) {
  const sourceSafe = String(source || "").trim();
  const userSafe = String(userId || "").trim();
  const slotSafe = String(slotKey || "").trim();
  if (!userSafe) return "";
  if (slotSafe && !sourceSafe.startsWith("manual_")) {
    return ["email_digest", slotSafe, userSafe].join(":");
  }
  if (!sourceSafe.startsWith("manual_")) return "";
  const explicit = String(idempotencyKey || "").trim().slice(0, 200);
  if (explicit) return ["email_manual_digest", sourceSafe, userSafe, "request", explicit].join(":");
  const bucketMs = 5 * 60 * 1000;
  const bucket = Math.floor(Number(now || Date.now()) / bucketMs);
  const fingerprint = [...new Set((Array.isArray(visibleAlertKeys) ? visibleAlertKeys : []).map(x => String(x || "").trim()).filter(Boolean))].sort().join("|") || "no_alerts";
  return ["email_manual_digest", sourceSafe, userSafe, "5m", String(bucket), fingerprint].join(":");
}
__name(buildEmailDigestDedupeKey, "buildEmailDigestDedupeKey");
`;
source = source.slice(0, sweepIndex) + helper + source.slice(sweepIndex);

const oldPattern = /const digestDedupeKey\s*=\s*slotKey\s*&&\s*!isManualRun\s*\?\s*\["email_digest",\s*slotKey,\s*userId\]\.join\(":"\)\s*:\s*"";/;
const matches = source.match(new RegExp(oldPattern.source, 'g')) || [];
if (matches.length !== 1) throw new Error(`expected exactly one vulnerable digestDedupeKey block, found ${matches.length}`);
source = source.replace(oldPattern, `const digestDedupeKey = buildEmailDigestDedupeKey({
        source,
        slotKey,
        userId,
        visibleAlertKeys,
        idempotencyKey: String(options?.idempotency_key || "").trim()
      });`);

const manualRouteNeedle = `source: "manual_test",\n        target_user_id: targetUserId || void 0,`;
if (source.includes(manualRouteNeedle)) {
  source = source.replace(manualRouteNeedle, `source: "manual_test",\n        idempotency_key: String(url.searchParams.get("idempotency_key") || url.searchParams.get("request_id") || "").trim().slice(0, 200),\n        target_user_id: targetUserId || void 0,`);
}

if (!source.includes('function buildEmailDigestDedupeKey(')) throw new Error('helper insertion failed');
if (oldPattern.test(source)) throw new Error('vulnerable digestDedupeKey block remains');
if (!/buildEmailDigestDedupeKey\s*\(\s*\{[\s\S]{0,500}visibleAlertKeys/.test(source)) throw new Error('sweep does not call helper with visibleAlertKeys');

fs.writeFileSync(output, source);
console.log('live manual email dedupe patch applied');
