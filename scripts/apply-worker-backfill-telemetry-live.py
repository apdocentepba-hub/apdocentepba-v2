from pathlib import Path
import re
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: apply-worker-backfill-telemetry-live.py <input> <output>')

inp, out = map(Path, sys.argv[1:])
s = inp.read_text()
original = s

# The candidate must be based on the secured production Worker.
for marker in [
    'SENSITIVE_TEST_PATHS.has(path)',
    '2026-09-15-session-security-3',
    'async function runProvinciaBackfillStep',
    'async function runEmailAlertsSweep',
    'async function supabaseInsertReturning',
    'async function supabasePatchReturning',
]:
    if marker not in s:
        raise SystemExit(f'required secured/base marker missing: {marker}')
if re.search(r'else\s*\{\s*userId\s*=\s*token\s*;\s*\}', s):
    raise SystemExit('refusing to build from Worker with legacy UUID bearer fallback')

final_marker = 'var worker_hotfix_default = {'
final_start = s.rfind(final_marker)
if final_start < 0:
    raise SystemExit('final worker_hotfix_default router not found')

helpers = r'''
async function safeInsertSystemError(env, origin, err, detail = null) {
  try {
    const message = String(err?.message || err || "Error desconocido").slice(0, 900);
    const stack = String(err?.stack || "").slice(0, 3000);
    const extra = detail && typeof detail === "object" ? JSON.stringify(detail).slice(0, 1800) : String(detail || "").slice(0, 1800);
    await supabaseInsert(env, "errores_sistema", {
      origen: String(origin || "worker_cron").slice(0, 120),
      mensaje: message,
      detalle: [stack, extra].filter(Boolean).join("\n").slice(0, 4800)
    });
  } catch (telemetryErr) {
    console.error("ERROR TELEMETRY WRITE FAILED", String(telemetryErr?.message || telemetryErr || ""));
  }
}

async function safeStartWorkerRun(env, workerName) {
  try {
    const row = await supabaseInsertReturning(env, "worker_runs", {
      worker_name: String(workerName || "worker_cron"),
      started_at: new Date().toISOString(),
      status: "running",
      usuarios_procesados: 0,
      alertas_enviadas: 0,
      errores: 0
    });
    return row?.id || null;
  } catch (err) {
    console.error("WORKER RUN START TELEMETRY FAILED", String(err?.message || err || ""));
    return null;
  }
}

async function safeFinishWorkerRun(env, runId, payload = {}) {
  if (!runId) return;
  try {
    await supabasePatchReturning(env, "worker_runs", `id=eq.${encodeURIComponent(runId)}`, {
      finished_at: new Date().toISOString(),
      status: String(payload.status || "success"),
      usuarios_procesados: Number(payload.usuarios_procesados || 0),
      alertas_enviadas: Number(payload.alertas_enviadas || 0),
      errores: Number(payload.errores || 0),
      mensaje: String(payload.mensaje || "").slice(0, 1800)
    });
  } catch (err) {
    console.error("WORKER RUN FINISH TELEMETRY FAILED", String(err?.message || err || ""));
  }
}

async function runObservedProvinciaBackfill(env, event) {
  const runId = await safeStartWorkerRun(env, "provincia_backfill_cron");
  try {
    const result = await runProvinciaBackfillStep(env, { source: "cron_maintenance", force: false });
    const safeMeta = {
      ok: result?.ok !== false,
      skipped: !!result?.skipped,
      reason: result?.reason || null,
      finished: !!result?.finished,
      district_index: result?.district_index ?? null,
      district_name: result?.district_name || null,
      next_page: result?.next_page ?? null,
      pages_processed: result?.pages_processed ?? result?.processed_pages ?? null,
      districts_completed: result?.districts_completed ?? null,
      offers_processed: result?.offers_processed ?? result?.total_ofertas ?? null,
      scheduled_time: event?.scheduledTime || null
    };
    await safeFinishWorkerRun(env, runId, {
      status: result?.ok === false ? "error" : (result?.skipped ? "skipped" : "success"),
      errores: result?.ok === false ? 1 : 0,
      mensaje: JSON.stringify(safeMeta)
    });
    if (result?.ok === false) {
      await safeInsertSystemError(env, "provincia_backfill_cron", new Error(result?.error || result?.reason || "Backfill provincial devolvió error"), safeMeta);
    }
    console.log("CRON PROVINCIA BACKFILL RESULT", JSON.stringify(safeMeta));
    return result;
  } catch (err) {
    const safeMeta = { scheduled_time: event?.scheduledTime || null };
    await safeInsertSystemError(env, "provincia_backfill_cron", err, safeMeta);
    await safeFinishWorkerRun(env, runId, {
      status: "error",
      errores: 1,
      mensaje: JSON.stringify({ ok: false, error: String(err?.message || err || "").slice(0, 900), ...safeMeta })
    });
    console.error("CRON PROVINCIA BACKFILL ERROR", err);
    return { ok: false, error: String(err?.message || err || "") };
  }
}

async function recordObservedEmailCron(env, startedAt, result, slotKey) {
  try {
    const failed = Number(result?.failed_count || 0);
    const attempts = Number(result?.send_attempts || 0);
    const sent = Number(result?.sent_count ?? Math.max(0, attempts - failed));
    const processed = Number(result?.processed_users || 0);
    const safeMeta = {
      slot_key: String(slotKey || ""),
      finished: !!result?.finished,
      processed_users: processed,
      send_attempts: attempts,
      failed_count: failed,
      skipped_count: Number(result?.skipped_count || 0)
    };
    await supabaseInsert(env, "worker_runs", {
      worker_name: "email_alerts_cron",
      started_at: startedAt || new Date().toISOString(),
      finished_at: new Date().toISOString(),
      status: failed > 0 ? "warning" : "success",
      usuarios_procesados: processed,
      alertas_enviadas: sent,
      errores: failed,
      mensaje: JSON.stringify(safeMeta)
    });
    if (failed > 0) {
      await safeInsertSystemError(env, "email_alerts_cron", new Error(`${failed} fallos en barrido de email`), safeMeta);
    }
  } catch (err) {
    console.error("EMAIL CRON TELEMETRY FAILED", String(err?.message || err || ""));
  }
}
'''

if 'async function runObservedProvinciaBackfill' in s:
    raise SystemExit('backfill telemetry helpers already present unexpectedly')
s = s[:final_start] + helpers + '\n' + s[final_start:]

# Re-locate final router after helper insertion.
final_start = s.rfind(final_marker)
final = s[final_start:]

scheduled_anchor = '''async scheduled(event, env, ctx) {
  const slot = getArgentinaDigestSlotInfo(event?.scheduledTime || Date.now());'''
scheduled_replacement = '''async scheduled(event, env, ctx) {
  ctx.waitUntil(runObservedProvinciaBackfill(env, event));
  const emailCronStartedAt = new Date().toISOString();
  const slot = getArgentinaDigestSlotInfo(event?.scheduledTime || Date.now());'''
if final.count(scheduled_anchor) != 1:
    raise SystemExit(f'expected one exact scheduled anchor, found {final.count(scheduled_anchor)}')
final = final.replace(scheduled_anchor, scheduled_replacement, 1)

result_anchor = '''  console.log("CRON EMAIL SWEEP RESULT", JSON.stringify(result || {}));

  if (result?.finished) {'''
result_replacement = '''  console.log("CRON EMAIL SWEEP RESULT", JSON.stringify(result || {}));
  ctx.waitUntil(recordObservedEmailCron(env, emailCronStartedAt, result, activeSlotKey));

  if (result?.finished) {'''
if final.count(result_anchor) != 1:
    raise SystemExit(f'expected one email-result anchor, found {final.count(result_anchor)}')
final = final.replace(result_anchor, result_replacement, 1)
s = s[:final_start] + final

# Bump only the observable hotfix marker.
version_pattern = re.compile(r'\b(?:const|let|var)\s+HOTFIX_VERSION\s*=\s*"2026-09-15-session-security-3"\s*;')
s, n = version_pattern.subn('var HOTFIX_VERSION = "2026-09-15-backfill-telemetry-1";', s, count=1)
if n != 1:
    raise SystemExit(f'expected secured HOTFIX_VERSION exactly once, found {n}')

if s == original:
    raise SystemExit('patch made no changes')
out.write_text(s)
print('patched Worker: independent bounded province backfill + worker/error telemetry; email sweep function untouched')
