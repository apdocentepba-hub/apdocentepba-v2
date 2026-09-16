import crypto from 'node:crypto';
import fs from 'node:fs';

const workerPath = 'worker-live/worker_hotfix.js';
const manifestPath = 'worker-live/manifest.json';
let worker = fs.readFileSync(workerPath, 'utf8');

function replaceExact(oldText, newText, label, expected = 1) {
  const count = worker.split(oldText).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} exact occurrence(s), found ${count}`);
  worker = worker.split(oldText).join(newText);
}

function replaceRegex(regex, replacement, label, expected = 1) {
  const matches = worker.match(regex) || [];
  if (matches.length !== expected) throw new Error(`${label}: expected ${expected} regex occurrence(s), found ${matches.length}`);
  worker = worker.replace(regex, replacement);
}

const accountHelpers = String.raw`
const ACCOUNT_PBKDF2_ITERATIONS_V1 = 210000;
function accountToHexV1(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function accountFromHexV1(hex) {
  const clean = String(hex || "").trim();
  if (!clean || clean.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(clean)) throw new Error("Salt/hash inválido");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function accountRandomHexV1(bytes = 16) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return accountToHexV1(value);
}
async function accountSha256HexV1(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return accountToHexV1(new Uint8Array(hash));
}
async function accountPbkdf2HexV1(password, saltHex, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: accountFromHexV1(saltHex), iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return accountToHexV1(new Uint8Array(bits));
}
async function accountHashPasswordV1(password) {
  const plain = String(password || "");
  if (!plain) throw new Error("Contraseña vacía");
  const salt = accountRandomHexV1(16);
  const hash = await accountPbkdf2HexV1(plain, salt, ACCOUNT_PBKDF2_ITERATIONS_V1);
  return `pbkdf2_sha256$${ACCOUNT_PBKDF2_ITERATIONS_V1}$${salt}$${hash}`;
}
async function accountVerifyPasswordV1(storedPassword, plainPassword) {
  const stored = String(storedPassword || "").trim();
  const plain = String(plainPassword || "");
  if (!stored || !plain) return { ok: false, needsUpgrade: false };
  if (stored.startsWith("pbkdf2_sha256$")) {
    const parts = stored.split("$");
    if (parts.length !== 4) return { ok: false, needsUpgrade: false };
    const iterations = Number(parts[1]);
    const salt = parts[2];
    const expected = parts[3];
    if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000 || !salt || !expected) {
      return { ok: false, needsUpgrade: false };
    }
    try {
      const actual = await accountPbkdf2HexV1(plain, salt, iterations);
      return { ok: actual === expected, needsUpgrade: actual === expected && iterations < ACCOUNT_PBKDF2_ITERATIONS_V1 };
    } catch {
      return { ok: false, needsUpgrade: false };
    }
  }
  if (stored === plain) return { ok: true, needsUpgrade: true };
  const legacySha = await accountSha256HexV1(plain);
  if (stored === legacySha) return { ok: true, needsUpgrade: true };
  return { ok: false, needsUpgrade: false };
}
async function accountReadUserV1(env, userId, includePassword = false) {
  const select = includePassword
    ? "id,nombre,apellido,email,celular,password_hash,activo"
    : "id,nombre,apellido,email,celular,activo";
  const rows = await supabaseSelect(
    env,
    `users?id=eq.${encodeURIComponent(userId)}&select=${select}&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function handleAccountProfileSecureV1(request, env) {
  const authUser = await getSessionUserByBearer(env, request);
  if (!authUser?.id) return json2({ ok: false, message: "No autenticado" }, 401);

  if (request.method === "GET") {
    const user = await accountReadUserV1(env, authUser.id, false);
    if (!user?.id) return json2({ ok: false, message: "Usuario no encontrado" }, 404);
    return json2({ ok: true, user: { id: user.id, nombre: user.nombre || "", apellido: user.apellido || "", email: user.email || "", celular: user.celular || "" } });
  }

  if (request.method !== "PATCH") return json2({ ok: false, message: "Método no permitido" }, 405);
  const body = await request.json().catch(() => ({}));
  const nombre = String(body?.nombre || "").trim();
  const apellido = String(body?.apellido || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const celular = String(body?.celular || "").trim();
  if (!nombre || !apellido || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json2({ ok: false, message: "Datos personales inválidos" }, 400);
  }

  const matches = await supabaseSelect(
    env,
    `users?email=ilike.${encodeURIComponent(email)}&select=id&limit=10`
  ).catch(() => []);
  const taken = (Array.isArray(matches) ? matches : []).some((row) => String(row?.id || "") !== String(authUser.id));
  if (taken) return json2({ ok: false, message: "Ese email ya está registrado en otra cuenta" }, 409);

  await supabasePatch(env, "users", `id=eq.${encodeURIComponent(authUser.id)}`, { nombre, apellido, email, celular });
  const user = await accountReadUserV1(env, authUser.id, false);
  return json2({ ok: true, user: { id: user?.id || authUser.id, nombre: user?.nombre || nombre, apellido: user?.apellido || apellido, email: user?.email || email, celular: user?.celular || celular } });
}
async function handleAccountChangePasswordSecureV1(request, env) {
  const authUser = await getSessionUserByBearer(env, request);
  if (!authUser?.id) return json2({ ok: false, message: "No autenticado" }, 401);
  if (request.method !== "POST") return json2({ ok: false, message: "Método no permitido" }, 405);

  const body = await request.json().catch(() => ({}));
  const currentPassword = String(body?.current_password || "");
  const newPassword = String(body?.new_password || "");
  if (newPassword.length < 6) return json2({ ok: false, message: "La nueva contraseña debe tener al menos 6 caracteres" }, 400);

  const user = await accountReadUserV1(env, authUser.id, true);
  if (!user?.id) return json2({ ok: false, message: "Usuario no encontrado" }, 404);
  const stored = String(user.password_hash || "").trim();
  if (stored) {
    if (!currentPassword) return json2({ ok: false, message: "Ingresá tu contraseña actual" }, 400);
    const verified = await accountVerifyPasswordV1(stored, currentPassword);
    if (!verified.ok) return json2({ ok: false, message: "La contraseña actual no coincide" }, 401);
  }

  const passwordHash = await accountHashPasswordV1(newPassword);
  await supabasePatch(env, "users", `id=eq.${encodeURIComponent(authUser.id)}`, { password_hash: passwordHash });
  return json2({ ok: true, message: "Contraseña actualizada" });
}
`;

const marker = 'var worker_hotfix_default = {';
const markerCount = worker.split(marker).length - 1;
if (markerCount !== 1) throw new Error(`account helper marker: expected 1, found ${markerCount}`);
worker = worker.replace(marker, `${accountHelpers}\n${marker}`);

replaceExact(
  '    const path = url.pathname;\n\n    // LIVE_SESSION_AUTH_GATE_V1:',
  '    const path = url.pathname;\n\n    if (path === `${API_URL_PREFIX3}/account/profile`) {\n      return await handleAccountProfileSecureV1(request, env);\n    }\n    if (path === `${API_URL_PREFIX3}/account/change-password`) {\n      return await handleAccountChangePasswordSecureV1(request, env);\n    }\n\n    // LIVE_SESSION_AUTH_GATE_V1:',
  'account route insertion'
);

const corsBefore = '"Access-Control-Allow-Methods": "GET, POST, OPTIONS"';
const corsCount = worker.split(corsBefore).length - 1;
if (corsCount < 1) throw new Error('No CORS method headers found to add PATCH');
worker = worker.split(corsBefore).join('"Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"');

const plaintextRegistration = '      password_hash: password,\n';
const regCount = worker.split(plaintextRegistration).length - 1;
if (regCount !== 1) throw new Error(`plaintext registration: expected 1, found ${regCount}`);
worker = worker.replace(plaintextRegistration, '      password_hash: await accountHashPasswordV1(password),\n');

const legacyPatch = 'if (!existing.password_hash && payload?.password) patch.password_hash = String(payload.password);';
const legacyPatchCount = worker.split(legacyPatch).length - 1;
if (legacyPatchCount !== 1) throw new Error(`legacy password patch: expected 1, found ${legacyPatchCount}`);
worker = worker.replace(legacyPatch, 'if (!existing.password_hash && payload?.password) patch.password_hash = await accountHashPasswordV1(String(payload.password));');

const legacyInsert = 'password_hash: payload?.password ? String(payload.password) : null';
const legacyInsertCount = worker.split(legacyInsert).length - 1;
if (legacyInsertCount !== 1) throw new Error(`legacy password insert: expected 1, found ${legacyInsertCount}`);
worker = worker.replace(legacyInsert, 'password_hash: payload?.password ? await accountHashPasswordV1(String(payload.password)) : null');

replaceRegex(
  /async function passwordMatches\(storedPassword, plainPassword\) \{[\s\S]*?\n\}\n__name\(passwordMatches, "passwordMatches"\);/g,
  'async function passwordMatches(storedPassword, plainPassword) {\n  return (await accountVerifyPasswordV1(storedPassword, plainPassword)).ok;\n}\n__name(passwordMatches, "passwordMatches");',
  'passwordMatches hardening'
);
replaceRegex(
  /async function passwordMatches2\(storedPassword, plainPassword\) \{[\s\S]*?\n\}\n__name\(passwordMatches2, "passwordMatches"\);/g,
  'async function passwordMatches2(storedPassword, plainPassword) {\n  return (await accountVerifyPasswordV1(storedPassword, plainPassword)).ok;\n}\n__name(passwordMatches2, "passwordMatches");',
  'passwordMatches2 hardening'
);

const baseLoginNeedle = '  const okPassword = await passwordMatches(user.password_hash, password);\n  if (!okPassword) {';
const baseLoginCount = worker.split(baseLoginNeedle).length - 1;
if (baseLoginCount !== 1) throw new Error(`base login migration hook: expected 1, found ${baseLoginCount}`);
worker = worker.replace(baseLoginNeedle,
  '  const verifiedPassword = await accountVerifyPasswordV1(user.password_hash, password);\n  if (!verifiedPassword.ok) {'
);
const baseAfter = '  await ensureTrialIfNoSubscriptions(env, user.id, user.email, "trial_auto_login");';
const baseAfterCount = worker.split(baseAfter).length - 1;
if (baseAfterCount !== 1) throw new Error(`base login post-verify hook: expected 1, found ${baseAfterCount}`);
worker = worker.replace(baseAfter,
  '  if (verifiedPassword.needsUpgrade) {\n    await supabasePatch(env, "users", `id=eq.${encodeURIComponent(user.id)}`, { password_hash: await accountHashPasswordV1(password) }).catch(() => null);\n  }\n' + baseAfter
);

const hotfixNeedle = '    const okPassword = await passwordMatches2(user.password_hash, password);\n    if (okPassword) {';
const hotfixCount = worker.split(hotfixNeedle).length - 1;
if (hotfixCount !== 1) throw new Error(`hotfix login migration hook: expected 1, found ${hotfixCount}`);
worker = worker.replace(hotfixNeedle,
  '    const verifiedPassword = await accountVerifyPasswordV1(user.password_hash, password);\n    if (verifiedPassword.ok) {\n      if (verifiedPassword.needsUpgrade) {\n        await supabasePatch2(env, "users", `id=eq.${encodeURIComponent(user.id)}`, { password_hash: await accountHashPasswordV1(password) }).catch(() => null);\n      }'
);

fs.writeFileSync(workerPath, worker);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = (manifest.modules || []).find((module) => module.name === 'worker_hotfix.js');
if (!entry) throw new Error('worker_hotfix.js hash entry missing');
entry.module_sha256 = crypto.createHash('sha256').update(Buffer.from(worker)).digest('hex');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const indexPath = 'index.html';
let index = fs.readFileSync(indexPath, 'utf8');
const hotfixTag = '<script src="account_profile_hotfix.js?v=1"></script>';
const tagCount = index.split(hotfixTag).length - 1;
if (tagCount !== 1) throw new Error(`legacy account hotfix script tag: expected 1, found ${tagCount}`);
index = index.replace(hotfixTag, '');
fs.writeFileSync(indexPath, index);

console.log(`Account security Worker SHA-256: ${entry.module_sha256}`);
