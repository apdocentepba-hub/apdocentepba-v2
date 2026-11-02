/* Preview-only generator. Never modifies or deploys the verified live Worker. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENTRY = 'async function runProvinciaBackfillStep(env, options = {}) {';
const FINISH = [
  '      notes: nextNotes',
  '    });',
  '    return {',
  '      ok: true,',
  '      mode: "current_published",'
].join('\n');
const HOOK_EXPORT = 'export async function maybeCaptureDailyProvinceSummary(';

function exactlyOnce(source, anchor, description) {
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(description + ': se esperaban 1 ancla y aparecieron ' + count);
}

export function buildPilotWorker(liveSource, hookSource) {
  exactlyOnce(liveSource, ENTRY, 'Entrada del escáner compiled');
  exactlyOnce(liveSource, FINISH, 'Guardado final del barrido current_published');
  exactlyOnce(hookSource, HOOK_EXPORT, 'Exportación del adaptador');
  if (!liveSource.includes('snapshot_writes: false')) {
    throw new Error('No se detectó la desactivación de snapshots masivos');
  }
  if (liveSource.includes('maybeCaptureDailyProvinceSummary') ||
      liveSource.includes('APD_DAILY_SUMMARY_ENABLED')) {
    throw new Error('El Worker base ya contiene integración: revisar manualmente');
  }
  if (/^\s*import\s/m.test(hookSource)) {
    throw new Error('El adaptador debe ser autónomo, sin imports externos');
  }
  const helper = hookSource.replace(HOOK_EXPORT, 'async function maybeCaptureDailyProvinceSummary(');
  const integrated = liveSource.replace(ENTRY, helper + '\n' + ENTRY);
  const completion = [
    '      notes: nextNotes',
    '    });',
    '    // Piloto opt-in: solo después de persistir estado finished.',
    '    // Sin bandera: cero lecturas extra, cero escrituras y cero logs.',
    '    if (finished && env?.APD_DAILY_SUMMARY_ENABLED === "true") {',
    '      const result = await maybeCaptureDailyProvinceSummary(',
    '        env, nextNotes.completed_scan_date, true, supabaseFetchWithRetry',
    '      );',
    '      console.log("APD_DAILY_SUMMARY_RESULT", JSON.stringify({',
    '        ok: result.ok, captured: result.captured === true,',
    '        already_present: result.already_present === true,',
    '        scan_date: result.scan_date || null',
    '      }));',
    '    }',
    '    return {',
    '      ok: true,',
    '      mode: "current_published",'
  ].join('\n');
  return integrated.replace(FINISH, completion);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = resolve(process.argv[2] || 'tmp/apd-summary-pilot/worker_preview.mjs');
  const live = readFileSync('worker-live/worker_hotfix.js', 'utf8');
  const hook = readFileSync('worker-live/apd_daily_summary_hook.mjs', 'utf8');
  const pilot = buildPilotWorker(live, hook);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pilot, { flag: 'w' });
  console.log('Generado preview local SIN desplegar: ' + out);
}
