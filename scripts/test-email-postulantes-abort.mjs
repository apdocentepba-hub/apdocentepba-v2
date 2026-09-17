import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worker-live/worker_hotfix.js', import.meta.url), 'utf8');
const start = source.indexOf('async function enrichEmailVisibleAlertsWithPostulantes');
assert.notEqual(start, -1, 'missing enrichEmailVisibleAlertsWithPostulantes');
const end = source.indexOf('\n  const userIds =', start);
assert.notEqual(end, -1, 'missing canonical email enrichment end boundary');
const fn = source.slice(start, end);

assert.match(fn, /new\s+AbortController\s*\(\s*\)/, 'email postulantes enrichment must create an AbortController per fetch');
assert.match(fn, /signal\s*:\s*controller\.signal/, 'ABC postulantes fetch must receive the AbortController signal');
assert.match(fn, /controller\.abort\s*\(\s*\)/, 'timeout must abort the underlying ABC fetch, not only reject Promise.race');
assert.match(fn, /clearTimeout\s*\(/, 'postulantes timeout timer must be cleared after the fetch settles');
assert.doesNotMatch(fn, /Promise\.race\s*\(\s*\[\s*obtenerResumenPostulantesABC/, 'legacy non-aborting Promise.race timeout must be removed');

console.log('email postulantes abort contract: OK');
