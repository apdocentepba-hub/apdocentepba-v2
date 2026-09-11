import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const [mainPath, queuePath] = process.argv.slice(2);
if (!mainPath || !queuePath) {
  console.error('usage: node test-email-format-live.mjs <worker_hotfix.js> <email_queue_hotfix.js>');
  process.exit(2);
}

function makeContext() {
  const ctx = {
    console,
    URL,
    URLSearchParams,
    Response,
    Request,
    Headers,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    structuredClone,
    crypto: globalThis.crypto,
    fetch: async () => { throw new Error('fetch must not be called by renderer test'); },
  };
  ctx.globalThis = ctx;
  return vm.createContext(ctx);
}

function loadMain(path) {
  let src = fs.readFileSync(path, 'utf8');
  src = src.replace(/export\s*\{[\s\S]*?\};\s*(?:\/\/# sourceMappingURL=.*)?\s*$/m, '');
  src += '\n;globalThis.__mailTest={renderMailOfferCard,buildDigestHtml,buildTop5NuevasHtml,normalizeOfferPayload};\n';
  const ctx = makeContext();
  vm.runInContext(src, ctx, { filename: path, timeout: 5000 });
  return ctx.__mailTest;
}

function loadQueue(path) {
  let src = fs.readFileSync(path, 'utf8');
  src = src.replace(/\bexport\s+(?=(?:async\s+)?function\b)/g, '');
  src += '\n;globalThis.__queueMailTest={buildQueuedDigestHtml,normalizeQueuedAlert};\n';
  const ctx = makeContext();
  vm.runInContext(src, ctx, { filename: path, timeout: 5000 });
  return ctx.__queueMailTest;
}

const sample = {
  cargo: 'PRECEPTOR (/PR)',
  escuela: '0045MS0001',
  distrito: 'GENERAL SAN MARTIN',
  turno: 'MANANA',
  nivel: 'SECUNDARIA',
  revista: 'S',
  curso_division: '0',
  modulos: '',
  dias_horarios: '',
  desde: '10/09/2026',
  hasta: '28/02/2027',
  fecha_cierre: '14/09/2026, 07:30',
  estado: 'Publicada',
  pid_match: true,
  pid_compatible: false,
  pid_reason: '',
  pid_area: 'PRECEPTOR (/PR)',
  pid_bloque: '',
  pid_puntaje_total_base: 0,
  pid_puntaje_total_final: 0,
  pid_residencia_bonus_aplicado: false,
  pid_residencia_bonus_puntos: 0,
  pid_distrito_residencia: '',
  pid_listado: 'oficial',
  pid_anio: '2026',
  total_postulantes: 18,
  puntaje_primero: '51,66',
  listado_origen_primero: 'oficial',
  link: 'https://servicios3.abc.gob.ar/oferta/123'
};

const requiredLabels = [
  'CURSO / DIVISIÓN', 'MÓDULOS', 'DÍAS / HORA.PROB', 'VIGENCIA', 'CIERRE',
  'ESTADO', 'MOTIVO', 'ÁREA PID', 'BLOQUE PID', 'PUNTAJE BASE',
  'BONUS RESIDENCIA', 'DISTRITO RESIDENCIA', 'TU PUNTAJE TOTAL',
  'LISTADO / AÑO PID', 'REFERENCIA DE POSTULANTES', 'CANTIDAD',
  'PUNTAJE MÁS ALTO', 'LISTADO DEL MÁS ALTO'
];

const main = loadMain(mainPath);
const card = main.renderMailOfferCard({ offer_payload: sample });
for (const label of requiredLabels) assert.ok(card.includes(label), `main card missing ${label}`);
assert.ok(card.includes('SUPLENCIA'), 'main card must render S as SUPLENCIA');
assert.ok(!card.includes('✨ S'), 'main card must not expose raw ✨ S');
assert.ok(card.split('No compatible con tu PID').length - 1 >= 2, 'PID status and MOTIVO must agree when pid_compatible=false');
assert.ok(card.includes('Ir a ABC'), 'main card must keep ABC button');
assert.ok(card.includes('Ir a mi panel'), 'main card must keep panel button');

const digest = main.buildDigestHtml([{ offer_payload: sample }], { nombre: 'MARTIN NICOLAS' });
assert.ok(digest.includes('Resumen personalizado'), 'main digest must keep friendly header');
assert.ok(digest.includes('Resumen APD compatible con tus preferencias'), 'main digest must keep digest title');
assert.ok(digest.includes('DATOS DE LA OFERTA'), 'main digest must identify offer-data section');
assert.ok(!digest.includes('Hotfix de alertas por mail'), 'main digest must not expose internal hotfix copy');

const top5 = main.buildTop5NuevasHtml([{ offer_payload: sample }], { nombre: 'MARTIN NICOLAS' });
assert.ok(top5.includes('Resumen personalizado'), 'Top-5 path must use same mail identity');
assert.ok(top5.includes('SUPLENCIA'), 'Top-5 path must use readable revista label');
assert.ok(!top5.includes('✨ S'), 'Top-5 path must not expose raw ✨ S');

const queue = loadQueue(queuePath);
const qAlert = queue.normalizeQueuedAlert({ offer_payload: sample });
const qHtml = queue.buildQueuedDigestHtml({ nombre: 'MARTIN NICOLAS' }, [qAlert], 'https://alertasapd.com.ar');
assert.ok(qHtml.includes('Resumen personalizado'), 'queue must use same friendly header');
assert.ok(qHtml.includes('Resumen APD compatible con tus preferencias'), 'queue must use same digest title');
assert.ok(!qHtml.includes('Hotfix de alertas por mail'), 'queue must not expose internal hotfix copy');
assert.ok(!qHtml.includes('cola pendiente'), 'queue must not expose queue internals');
assert.ok(qHtml.includes('SUPLENCIA'), 'queue must render S as SUPLENCIA');
assert.ok(qHtml.includes('CURSO / DIVISIÓN'), 'queue must preserve course/division when present');
assert.ok(qHtml.includes('DÍAS / HORA.PROB'), 'queue must preserve days/hours when present');
assert.ok(qHtml.includes('VIGENCIA'), 'queue must preserve vigencia when present');
assert.ok(qHtml.includes('ESTADO'), 'queue must preserve offer state when present');
assert.ok(qHtml.includes('Ir a ABC'), 'queue must keep ABC button');
assert.ok(qHtml.includes('Ir a mi panel'), 'queue must keep panel button');

console.log('email-format contract OK');
