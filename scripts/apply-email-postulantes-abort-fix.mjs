import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = 'worker-live/worker_hotfix.js';
let source = fs.readFileSync(path, 'utf8');

const helperOld = 'async function obtenerResumenPostulantesABC(ofertaId, detalleId) {';
const helperNew = 'async function obtenerResumenPostulantesABC(ofertaId, detalleId, options = {}) {';
if (source.includes(helperOld)) {
  source = source.replace(helperOld, helperNew);
} else {
  assert.ok(source.includes(helperNew), 'obtenerResumenPostulantesABC signature not found');
}

const helperStart = source.indexOf(helperNew);
assert.notEqual(helperStart, -1, 'patched obtenerResumenPostulantesABC not found');
const nextSync = source.indexOf('\nfunction ', helperStart + helperNew.length);
const nextAsync = source.indexOf('\nasync function ', helperStart + helperNew.length);
const candidates = [nextSync, nextAsync].filter((x) => x > helperStart);
assert.ok(candidates.length, 'could not locate end of obtenerResumenPostulantesABC');
const helperEnd = Math.min(...candidates);
let helper = source.slice(helperStart, helperEnd);

if (!helper.includes('signal: options?.signal')) {
  const fetchStart = helper.indexOf('const res = await fetch(');
  assert.notEqual(fetchStart, -1, 'ABC postulantes fetch not found');
  const open = helper.indexOf('(', fetchStart);
  assert.notEqual(open, -1, 'ABC postulantes fetch open paren not found');
  let depth = 0;
  let close = -1;
  for (let i = open; i < helper.length; i += 1) {
    if (helper[i] === '(') depth += 1;
    else if (helper[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  assert.notEqual(close, -1, 'ABC postulantes fetch close paren not found');
  helper = `${helper.slice(0, close)}, { signal: options?.signal }${helper.slice(close)}`;
  source = source.slice(0, helperStart) + helper + source.slice(helperEnd);
}

const oldRace = `        try {\n          const resumen = await Promise.race([\n            obtenerResumenPostulantesABC(ids.oferta, ids.detalle),\n            new Promise((_, reject) =>\n              setTimeout(() => reject(new Error("timeout_postulantes_email")), 4500)\n            )\n          ]);\n\n          return {`;

const newRace = `        const controller = new AbortController();\n        const timeoutId = setTimeout(() => controller.abort(), 4500);\n\n        try {\n          const resumen = await obtenerResumenPostulantesABC(\n            ids.oferta,\n            ids.detalle,\n            { signal: controller.signal }\n          );\n\n          return {`;

if (source.includes(oldRace)) {
  source = source.replace(oldRace, newRace);
} else {
  assert.ok(source.includes('const controller = new AbortController();'), 'legacy email postulantes race block not found');
}

const oldCatch = `        } catch (err) {\n          console.error("EMAIL POSTULANTES ENRICH ERROR:", {\n            oferta: ids.oferta || null,\n            detalle: ids.detalle || null,\n            error: String(err?.message || err || "")\n          });\n\n          return {\n            ...item,\n            offer_payload: base,\n            email_postulantes_enriched: false,\n            email_postulantes_reason: String(err?.message || err || "")\n          };\n        }`;

const newCatch = `        } catch (err) {\n          const errorText = controller.signal.aborted\n            ? "timeout_postulantes_email"\n            : String(err?.message || err || "");\n\n          console.error("EMAIL POSTULANTES ENRICH ERROR:", {\n            oferta: ids.oferta || null,\n            detalle: ids.detalle || null,\n            error: errorText\n          });\n\n          return {\n            ...item,\n            offer_payload: base,\n            email_postulantes_enriched: false,\n            email_postulantes_reason: errorText\n          };\n        } finally {\n          clearTimeout(timeoutId);\n        }`;

if (source.includes(oldCatch)) {
  source = source.replace(oldCatch, newCatch);
} else {
  assert.ok(source.includes('clearTimeout(timeoutId);'), 'email postulantes catch/finally block not found');
}

assert.ok(source.includes('new AbortController()'), 'AbortController missing after patch');
assert.ok(source.includes('{ signal: controller.signal }'), 'controller signal not wired after patch');
assert.ok(source.includes('clearTimeout(timeoutId);'), 'timeout cleanup missing after patch');
assert.ok(!source.includes('Promise.race([\n            obtenerResumenPostulantesABC(ids.oferta, ids.detalle)'), 'legacy non-aborting race still present');

fs.writeFileSync(path, source);
console.log('email postulantes abort patch applied');
