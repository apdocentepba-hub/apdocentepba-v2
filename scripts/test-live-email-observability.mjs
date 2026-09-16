import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = process.argv[2];
assert.ok(file, 'usage: node scripts/test-live-email-observability.mjs <worker_hotfix.js>');
const source = fs.readFileSync(file, 'utf8');

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `EMAIL_OBSERVABILITY_V1: missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `EMAIL_OBSERVABILITY_V1: missing ${endMarker}`);
  return source.slice(start, end);
}

const emailTelemetry = between('async function recordObservedEmailCron(', 'var worker_hotfix_default =');
const sweep = between('async function runEmailAlertsSweep(', 'async function handleTestMail(');

for (const invalid of ['worker_name:', 'started_at:', 'finished_at:', 'status:', 'usuarios_procesados:', 'alertas_enviadas:', 'mensaje:']) {
  assert.equal(
    emailTelemetry.includes(invalid),
    false,
    `EMAIL_OBSERVABILITY_V1: recordObservedEmailCron still writes invalid worker_runs field ${invalid}`
  );
}

for (const required of ['fecha_inicio:', 'fecha_fin:', 'estado:', 'usuarios_total:', 'alertas_total:', 'errores:', 'detalle:']) {
  assert.ok(
    emailTelemetry.includes(required),
    `EMAIL_OBSERVABILITY_V1: recordObservedEmailCron missing valid worker_runs field ${required}`
  );
}

assert.ok(sweep.includes('skip_reason_counts'), 'EMAIL_OBSERVABILITY_V1: sweep must aggregate skip reasons');
assert.ok(sweep.includes('skipped_user_samples'), 'EMAIL_OBSERVABILITY_V1: sweep must retain bounded skipped-user samples');
assert.ok(emailTelemetry.includes('skip_reason_counts'), 'EMAIL_OBSERVABILITY_V1: cron telemetry must persist skip reason counts');
assert.ok(emailTelemetry.includes('skipped_user_samples'), 'EMAIL_OBSERVABILITY_V1: cron telemetry must persist skipped-user samples');
assert.ok(emailTelemetry.includes('failed_samples'), 'EMAIL_OBSERVABILITY_V1: cron telemetry must persist sanitized failure samples');

console.log('EMAIL_OBSERVABILITY_V1: ok');
