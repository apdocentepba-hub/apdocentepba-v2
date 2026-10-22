import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// The worker-live directory is a byte-for-byte production capture.
// NEVER overwrite it or edit its manifest to stage a proposed change.
const base = fs.readFileSync('worker-live/worker_hotfix.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
const expected = manifest.modules.find(x=>x.name==='worker_hotfix.js')?.sha256;
const actual = crypto.createHash('sha256').update(base).digest('hex');
assert.equal(actual, expected, 'Canonical production Worker was modified; build rejected');

let content = base;
function replaceExactlyOnce(before, after) {
  assert.equal(content.split(before).length, 2, 'Source anchor missing or ambiguous: ' + before.slice(0,65));
  content = content.replace(before, after);
}

const handlerAnchor = '__name2(handleAccountProfileSecureV1, "handleAccountProfileSecureV1");\n';
const preferenceHandler = [
  '// Authenticated account preferences: use only server-validated session identity.',
  'async function handleAccountPreferencesSecureV1(request, env) {',
  '  if (request.method !== "GET") return json2({ ok: false, message: "Método no permitido" }, 405);',
  '  const authUser = await getSessionUserByBearer(env, request);',
  '  if (!authUser?.id) return json2({ ok: false, message: "No autenticado" }, 401);',
  '  try {',
  '    const rows = await supabaseSelect(env,',
  '      "user_preferences?user_id=eq." + encodeURIComponent(authUser.id) +',
  '      "&select=user_id,distrito_principal,otros_distritos,cargos,materias,niveles,turnos,alertas_activas,alertas_email,alertas_whatsapp,alertas_telegram&limit=1");',
  '    if (!Array.isArray(rows)) throw new Error("invalid_preferences_response");',
  '    return json2({ ok: true, preferences: rows[0] || null });',
  '  } catch (_) {',
  '    return json2({ ok: false, message: "No se pudieron cargar las preferencias" }, 502);',
  '  }',
  '}',
  ''
].join('\n');
replaceExactlyOnce(handlerAnchor, handlerAnchor + preferenceHandler);

const routeAnchor = '      return await handleAccountProfileSecureV1(request, env);\n    }\n';
const routeAddition = [
  '    if (path === API_URL_PREFIX3 + "/account/preferences") {',
  '      return await handleAccountPreferencesSecureV1(request, env);',
  '    }',
  ''
].join('\n');
replaceExactlyOnce(routeAnchor, routeAnchor + routeAddition);

replaceExactlyOnce(
  'const select = includePassword ? "id,nombre,apellido,email,celular,password_hash,activo" : "id,nombre,apellido,email,celular,activo";',
  'const select = includePassword ? "id,nombre,apellido,email,celular,password_hash,activo,ultimo_login" : "id,nombre,apellido,email,celular,activo,ultimo_login";'
);
replaceExactlyOnce(
  'celular: user2.celular || "" } });',
  'celular: user2.celular || "", activo: user2.activo !== false, ultimo_login: user2.ultimo_login || null } });'
);

const folder = 'tmp/authenticated-dashboard-candidate';
fs.mkdirSync(folder, {recursive:true});
fs.writeFileSync(path.join(folder, 'worker_hotfix.mjs'), content, 'utf8');
console.log('Created isolated authenticated Worker candidate. Canonical production bytes preserved.');
