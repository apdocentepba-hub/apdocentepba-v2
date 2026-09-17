import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = 'worker-live/worker_hotfix.js';
let source = fs.readFileSync(path, 'utf8');

// 1) Make the ABC postulantes helper accept an AbortSignal.
const helperOld = 'async function obtenerResumenPostulantesABC(ofertaId, detalleId) {';
const helperNew = 'async function obtenerResumenPostulantesABC(ofertaId, detalleId, options = {}) {';
if (source.includes(helperOld)) source = source.replace(helperOld, helperNew);
assert.ok(source.includes(helperNew), 'obtenerResumenPostulantesABC signature not found');

const fetchOld = `  const res = await fetch(\n    \`https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.postulante/select?\${qs.toString()}\`\n  );`;
const fetchNew = `  const res = await fetch(\n    \`https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.postulante/select?\${qs.toString()}\`,\n    { signal: options?.signal }\n  );`;
if (source.includes(fetchOld)) source = source.replace(fetchOld, fetchNew);
assert.ok(source.includes(fetchNew), 'ABC postulantes fetch was not wired to options.signal');

// 2) Patch ONLY the email sweep enrichment function. Other postulantes callers keep
// their existing behavior and therefore cannot make this regression check ambiguous.
const enrichStart = source.indexOf('async function enrichEmailVisibleAlertsWithPostulantes');
assert.notEqual(enrichStart, -1, 'missing enrichEmailVisibleAlertsWithPostulantes');
const enrichEndMarker = '__name(enrichEmailVisibleAlertsWithPostulantes';
const enrichEnd = source.indexOf(enrichEndMarker, enrichStart);
assert.notEqual(enrichEnd, -1, 'missing enrichEmailVisibleAlertsWithPostulantes end marker');
let enrich = source.slice(enrichStart, enrichEnd);

const oldRace = `        try {\n          const resumen = await Promise.race([\n            obtenerResumenPostulantesABC(ids.oferta, ids.detalle),\n            new Promise((_, reject) =>\n              setTimeout(() => reject(new Error("timeout_postulantes_email")), 4500)\n            )\n          ]);\n\n          return {`;
const newRace = `        const controller = new AbortController();\n        const timeoutId = setTimeout(() => controller.abort(), 4500);\n\n        try {\n          const resumen = await obtenerResumenPostulantesABC(\n            ids.oferta,\n            ids.detalle,\n            { signal: controller.signal }\n          );\n\n          return {`;
if (enrich.includes(oldRace)) enrich = enrich.replace(oldRace, newRace);
assert.ok(enrich.includes('const controller = new AbortController();'), 'email enrichment AbortController patch missing');
assert.ok(enrich.includes('{ signal: controller.signal }'), 'email enrichment signal wiring missing');

const oldCatch = `        } catch (err) {\n          console.error("EMAIL POSTULANTES ENRICH ERROR:", {\n            oferta: ids.oferta || null,\n            detalle: ids.detalle || null,\n            error: String(err?.message || err || "")\n          });\n\n          return {\n            ...item,\n            offer_payload: base,\n            email_postulantes_enriched: false,\n            email_postulantes_reason: String(err?.message || err || "")\n          };\n        }`;
const newCatch = `        } catch (err) {\n          const errorText = controller.signal.aborted\n            ? "timeout_postulantes_email"\n            : String(err?.message || err || "");\n\n          console.error("EMAIL POSTULANTES ENRICH ERROR:", {\n            oferta: ids.oferta || null,\n            detalle: ids.detalle || null,\n            error: errorText\n          });\n\n          return {\n            ...item,\n            offer_payload: base,\n            email_postulantes_enriched: false,\n            email_postulantes_reason: errorText\n          };\n        } finally {\n          clearTimeout(timeoutId);\n        }`;
if (enrich.includes(oldCatch)) enrich = enrich.replace(oldCatch, newCatch);
assert.ok(enrich.includes('clearTimeout(timeoutId);'), 'email enrichment timeout cleanup missing');
assert.ok(!enrich.includes('Promise.race(['), 'legacy non-aborting Promise.race still present in email enrichment');

source = source.slice(0, enrichStart) + enrich + source.slice(enrichEnd);
fs.writeFileSync(path, source);
console.log('email postulantes abort patch applied');
