import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildPilotWorker } from './build-apd-daily-history-pilot.mjs';

const live = readFileSync('worker-live/worker_hotfix.js', 'utf8');
const hook = readFileSync('worker-live/apd_daily_summary_hook.mjs', 'utf8');

test('preview incorpora una sola llamada después de guardar finished', () => {
 const output = buildPilotWorker(live, hook);
 assert.equal((output.match(/async function maybeCaptureDailyProvinceSummary\(/g)||[]).length,1);
 assert.equal((output.match(/await maybeCaptureDailyProvinceSummary\(/g)||[]).length,1);
 const start=output.indexOf('async function runProvinciaBackfillStep(env, options = {})');
 const persisted=output.indexOf('      notes: nextNotes\n    });',start);
 const invoked=output.indexOf('await maybeCaptureDailyProvinceSummary(',start);
 const returned=output.indexOf('    return {\n      ok: true,\n      mode: "current_published"',start);
 assert.ok(start >= 0 && persisted > start && invoked > persisted && returned > invoked);
 assert.ok(output.includes('if (finished && env?.APD_DAILY_SUMMARY_ENABLED === "true")'));
 assert.ok(output.includes('snapshot_writes: false'));
 assert.ok(!output.includes('export async function maybeCaptureDailyProvinceSummary'));
});
test('preview compilada conserva sintaxis ESM válida', () => {
 const output=buildPilotWorker(live,hook);
 const checked=spawnSync(process.execPath,['--input-type=module','--check'],{input:output,encoding:'utf8'});
 assert.equal(checked.status,0,checked.stderr);
});
test('no permite anclas ausentes, reemplazadas o duplicadas', () => {
 assert.throws(()=>buildPilotWorker('worker desconocido',hook),/ancla/);
 assert.throws(()=>buildPilotWorker(live.replace('      notes: nextNotes','      notes: otrasNotas'),hook),/ancla/);
 assert.throws(()=>buildPilotWorker(live+ '\nasync function runProvinciaBackfillStep(env, options = {}) {}',hook),/ancla/);
});
test('no acepta integrar dos veces ni ejecutar helper con imports', () => {
 const output=buildPilotWorker(live,hook);
 assert.throws(()=>buildPilotWorker(output,hook),/integración/);
 assert.throws(()=>buildPilotWorker(live,"import x from 'x';\n"+hook),/imports/);
});
test('archivo productivo permanece como fuente inalterada', () => {
 assert.doesNotMatch(live,/maybeCaptureDailyProvinceSummary|APD_DAILY_SUMMARY_ENABLED/);
});
