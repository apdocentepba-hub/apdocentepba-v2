import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('usage: node scripts/test-live-auth-session-bundle.mjs <worker_hotfix.js>');
const source = fs.readFileSync(path, 'utf8');

const wrapperStart = source.indexOf('var worker_hotfix_default = {');
assert.ok(wrapperStart >= 0, 'top-level worker_hotfix_default wrapper must exist');
const wrapperEnd = source.indexOf('\nasync scheduled(', wrapperStart);
assert.ok(wrapperEnd > wrapperStart, 'top-level fetch wrapper must end before scheduled()');
const wrapper = source.slice(wrapperStart, wrapperEnd);

const markerIndex = wrapper.indexOf('LIVE_SESSION_AUTH_GATE_V1');
assert.ok(markerIndex >= 0, 'live top-level router must contain LIVE_SESSION_AUTH_GATE_V1');

for (const route of [
  '/mi-plan',
  '/mis-alertas',
  '/historico-resumen',
  '/guardar-preferencias',
  '/capturar-historico-apd',
  '/mercadopago/create-checkout-link',
  '/whatsapp/test-send'
]) {
  assert.ok(wrapper.includes(route), `protected route missing from top-level auth gate/wrapper: ${route}`);
}

assert.match(
  wrapper,
  /const authUser = await getSessionUserByBearer\(env, request\);/,
  'protected top-level routes must resolve the active session'
);
assert.match(
  wrapper,
  /if \(!authUser\?\.id\) return json2\(\{ ok: false, message: "No autenticado" \}, 401\);/,
  'missing/expired/invalid session must return 401'
);
assert.match(
  wrapper,
  /url\.searchParams\.set\("user_id", authUser\.id\);/,
  'GET identity must be overwritten with the authenticated user id'
);
assert.match(
  wrapper,
  /user_id: authUser\.id/,
  'JSON POST identity must be overwritten with the authenticated user id'
);

const directMisAlertas = wrapper.indexOf('if (path === `${API_URL_PREFIX3}/mis-alertas`');
assert.ok(directMisAlertas > markerIndex, 'auth gate must run before direct /mis-alertas handler');
const baseFallback = wrapper.lastIndexOf('return await worker_default.fetch(request, env, ctx);');
assert.ok(baseFallback > markerIndex, 'auth gate must run before delegation to the base Worker');

console.log('live auth session bundle contract: OK');
