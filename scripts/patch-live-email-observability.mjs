import fs from 'node:fs';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('usage: node scripts/patch-live-email-observability.mjs <input> <output>');

let source = fs.readFileSync(input, 'utf8');

function findFunctionRange(name) {
  const prefixes = [`async function ${name}(`, `function ${name}(`];
  let start = -1;
  for (const prefix of prefixes) {
    start = source.indexOf(prefix);
    if (start >= 0) break;
  }
  if (start < 0) throw new Error(`function ${name} not found`);

  let i = source.indexOf('(', start);
  let pDepth = 0;
  let quote = null;
  let escaped = false;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(') pDepth += 1;
    else if (ch === ')') {
      pDepth -= 1;
      if (pDepth === 0) { i += 1; break; }
    }
  }

  const bodyStart = source.indexOf('{', i);
  if (bodyStart < 0) throw new Error(`body for ${name} not found`);
  let depth = 0;
  quote = null;
  escaped = false;
  for (i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function replaceFunction(name, replacement) {
  const { start, end } = findFunctionRange(name);
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceFunction('safeStartWorkerRun', `async function safeStartWorkerRun(env, workerName) {
  try {
    const startedAt = new Date().toISOString();
    const detail = JSON.stringify({
      job_name: String(workerName || "worker_cron")
    });
    const row = await telemetrySupabaseRequest(env, "worker_runs", "POST", {
      fecha_inicio: startedAt,
      estado: "running",
      usuarios_total: 0,
      alertas_total: 0,
      errores: 0,
      detalle: detail
    }, true);
    return row?.id || null;
  } catch (err) {
    console.error("WORKER RUN START TELEMETRY FAILED", String(err?.message || err || ""));
    return null;
  }
}`);

replaceFunction('safeFinishWorkerRun', `async function safeFinishWorkerRun(env, runId, payload = {}) {
  if (!runId) return;
  try {
    await telemetrySupabaseRequest(env, \`worker_runs?id=eq.\${encodeURIComponent(runId)}\`, "PATCH", {
      fecha_fin: new Date().toISOString(),
      estado: String(payload.status || "success"),
      usuarios_total: Number(payload.usuarios_procesados || 0),
      alertas_total: Number(payload.alertas_enviadas || 0),
      errores: Number(payload.errores || 0),
      detalle: String(payload.mensaje || "").slice(0, 5000)
    });
  } catch (err) {
    console.error("WORKER RUN FINISH TELEMETRY FAILED", String(err?.message || err || ""));
  }
}`);

replaceFunction('recordObservedEmailCron', `async function recordObservedEmailCron(env, startedAt, result, slotKey) {
  try {
    const failed = Number(result?.failed_count || 0);
    const attempts = Number(result?.send_attempts || 0);
    const sent = Number(result?.sent_count ?? Math.max(0, attempts - failed));
    const processed = Number(result?.processed_users || 0);
    const safeFailedSamples = (Array.isArray(result?.failed_samples) ? result.failed_samples : [])
      .slice(0, 10)
      .map((item) => ({
        user_id: String(item?.user_id || "") || null,
        reason: String(item?.reason || "") || null,
        error: String(item?.error || item?.provider_response?.error || "").slice(0, 500) || null
      }));
    const safeSkippedSamples = (Array.isArray(result?.skipped_user_samples) ? result.skipped_user_samples : [])
      .slice(0, 10)
      .map((item) => ({
        user_id: String(item?.user_id || "") || null,
        stage: String(item?.stage || "") || null,
        reason: String(item?.reason || "") || null,
        error: String(item?.error || "").slice(0, 500) || null
      }));
    const safeMeta = {
      job_name: "email_alerts_cron",
      slot_key: String(slotKey || ""),
      finished: !!result?.finished,
      processed_users: processed,
      send_attempts: attempts,
      sent_count: sent,
      failed_count: failed,
      skipped_count: Number(result?.skipped_count || 0),
      cursor_user_id: String(result?.cursor_user_id || "") || null,
      skip_reason_counts: result?.skip_reason_counts && typeof result.skip_reason_counts === "object"
        ? result.skip_reason_counts
        : {},
      skipped_user_samples: safeSkippedSamples,
      failed_samples: safeFailedSamples
    };
    await telemetrySupabaseRequest(env, "worker_runs", "POST", {
      fecha_inicio: startedAt || new Date().toISOString(),
      fecha_fin: new Date().toISOString(),
      estado: failed > 0 ? "warning" : "success",
      usuarios_total: processed,
      alertas_total: sent,
      errores: failed,
      detalle: JSON.stringify(safeMeta).slice(0, 12000)
    });
    if (failed > 0) {
      await safeInsertSystemError(env, "email_alerts_cron", new Error(\`\${failed} fallos en barrido de email\`), safeMeta);
    }
  } catch (err) {
    console.error("EMAIL CRON TELEMETRY FAILED", String(err?.message || err || ""));
  }
}`);

const sweepRange = findFunctionRange('runEmailAlertsSweep');
let sweep = source.slice(sweepRange.start, sweepRange.end);

const declarationOld = `  const failed_samples = [];
  const debug_users = [];

  const pushDebug = (entry = {}) => {
    if (!debugEnabled) return;

    const entryUserId = String(entry?.user_id || "").trim();

    if (debugUserId && entryUserId && entryUserId !== debugUserId) return;
    if (!debugUserId && debug_users.length >= 30) return;

    debug_users.push(entry);
  };`;

const declarationNew = `  const failed_samples = [];
  const skip_reason_counts = {};
  const skipped_user_samples = [];
  const debug_users = [];

  const pushDebug = (entry = {}) => {
    const entryUserId = String(entry?.user_id || "").trim();
    const reason = String(entry?.reason || "").trim();

    if (entry?.skipped === true && reason) {
      skip_reason_counts[reason] = Number(skip_reason_counts[reason] || 0) + 1;
      if (skipped_user_samples.length < 10) {
        skipped_user_samples.push({
          user_id: entryUserId || null,
          stage: String(entry?.stage || "").trim() || null,
          reason,
          error: String(entry?.error || "").slice(0, 500) || null
        });
      }
    }

    if (!debugEnabled) return;
    if (debugUserId && entryUserId && entryUserId !== debugUserId) return;
    if (!debugUserId && debug_users.length >= 30) return;

    debug_users.push(entry);
  };`;

if (!sweep.includes(declarationOld)) throw new Error('runEmailAlertsSweep debug declaration block not found');
sweep = sweep.replace(declarationOld, declarationNew);

const returnNeedle = `    failed_samples,
    pref_source: prefSource,`;
const returnReplacement = `    failed_samples,
    skip_reason_counts,
    skipped_user_samples,
    pref_source: prefSource,`;
if (!sweep.includes(returnNeedle)) throw new Error('runEmailAlertsSweep final return marker not found');
sweep = sweep.replace(returnNeedle, returnReplacement);

source = source.slice(0, sweepRange.start) + sweep + source.slice(sweepRange.end);

fs.writeFileSync(output, source);
console.log('live email observability patch applied');
