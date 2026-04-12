import { handleProfileListadosRoute } from "./profile_listados_api.js";
import { handleRepositoryRoute } from "./repositorio_api.js";
import originalWorker from "./worker.js";

const API_URL_PREFIX = "/api";
const HOTFIX_VERSION = "2026-04-12-repositorio-1";
const LEGACY_GAS_URL = "https://script.google.com/macros/s/AKfycbwFtHAZ8ItzTK7MQdqn-FaVVO6s4s4HTIttZDC0daJgn6TgkJvFBafgNLTG_PcG0HxMbg/exec";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 210000;

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: corsHeaders() });
}

function normalizeEmail(v) { return String(v || "").trim().toLowerCase(); }
function normalizeText(v) { return String(v || "").trim(); }
function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}
function toHex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(""); }
function fromHex(hex) {
  const clean = String(hex || "").trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function randomHex(bytes = 32) { const arr = new Uint8Array(bytes); crypto.getRandomValues(arr); return toHex(arr); }
async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(hash));
}
async function pbkdf2HashHex(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(password || "")), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromHex(saltHex), iterations, hash: "SHA-256" }, keyMaterial, 256);
  return toHex(new Uint8Array(bits));
}
async function hashPasswordSecure(password) {
  const salt = randomHex(16);
  const hash = await pbkdf2HashHex(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}
async function verifyPasswordFlexible(storedPassword, plainPassword) {
  const stored = String(storedPassword || "").trim();
  const plain = String(plainPassword || "");
  if (!stored || !plain) return { ok: false, needsUpgrade: false };
  if (stored.startsWith("pbkdf2_sha256$")) {
    const parts = stored.split("$");
    if (parts.length !== 4) return { ok: false, needsUpgrade: false };
    const iterations = Number(parts[1] || 0);
    const saltHex = parts[2] || "";
    const expectedHex = parts[3] || "";
    if (!iterations || !saltHex || !expectedHex) return { ok: false, needsUpgrade: false };
    const actualHex = await pbkdf2HashHex(plain, saltHex, iterations);
    return { ok: actualHex === expectedHex, needsUpgrade: false };
  }
  if (stored === plain) return { ok: true, needsUpgrade: true };
  const legacySha = await sha256Hex(plain);
  if (stored === legacySha) return { ok: true, needsUpgrade: true };
  return { ok: false, needsUpgrade: false };
}
async function supabaseRequest(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  return data;
}
async function supabaseSelect(env, query) { return await supabaseRequest(env, query, { method: "GET", headers: { Prefer: "return=representation" } }); }
async function supabaseInsertReturning(env, table, data) {
  const rows = await supabaseRequest(env, table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) });
  return Array.isArray(rows) ? rows[0] || null : rows;
}
async function supabasePatchReturning(env, table, filter, data) {
  const rows = await supabaseRequest(env, `${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) });
  return Array.isArray(rows) ? rows[0] || null : rows;
}
async function findUserByEmail(env, email) { const rows = await supabaseSelect(env, `users?email=ilike.${encodeURIComponent(email)}&select=id,nombre,apellido,email,celular,password_hash,google_sub,activo&limit=1`).catch(() => []); return Array.isArray(rows) ? rows[0] || null : null; }
async function findUserByGoogleSub(env, sub) { const rows = await supabaseSelect(env, `users?google_sub=eq.${encodeURIComponent(sub)}&select=id,nombre,apellido,email,celular,password_hash,google_sub,activo&limit=1`).catch(() => []); return Array.isArray(rows) ? rows[0] || null : null; }
async function getUserById(env, userId) { const rows = await supabaseSelect(env, `users?id=eq.${encodeURIComponent(userId)}&select=id,nombre,apellido,email,celular,activo,es_admin,google_sub,password_hash,created_at,ultimo_login&limit=1`).catch(() => []); return Array.isArray(rows) ? rows[0] || null : null; }
async function touchUltimoLogin(env, userId) { await supabasePatchReturning(env, "users", `id=eq.${encodeURIComponent(userId)}`, { ultimo_login: new Date().toISOString() }).catch(() => null); }
async function ensureTrialIfNoSubscriptions(env, userId, email, source = "trial_auto_hotfix") {
  const existing = await supabaseSelect(env, `user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`).catch(() => []);
  if (Array.isArray(existing) && existing.length > 0) return { ok: true, created: false };
  await supabaseInsertReturning(env, "user_subscriptions", { user_id: userId, plan_code: "TRIAL_7D", status: "ACTIVE", source, started_at: new Date().toISOString(), trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), current_period_ends_at: null, mercadopago_preapproval_id: null, mercadopago_payer_email: email || null, external_reference: `${userId}:TRIAL_7D:${Date.now()}` }).catch(() => null);
  return { ok: true, created: true };
}
async function createSession(env, userId, metodo = "password") {
  const token = randomHex(32); const createdAt = new Date().toISOString(); const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await supabaseInsertReturning(env, "sessions", { token, user_id: userId, metodo, created_at: createdAt, expires_at: expiresAt, activo: true });
  return { token, created_at: createdAt, expires_at: expiresAt };
}
async function resolveAuthUser(env, request) {
  const bearer = getBearerToken(request); if (!bearer) return { bearer: "", user: null, mode: "none" };
  const sessions = await supabaseSelect(env, `sessions?token=eq.${encodeURIComponent(bearer)}&activo=eq.true&select=token,user_id,metodo,created_at,expires_at,activo&limit=1`).catch(() => []);
  const session = Array.isArray(sessions) ? sessions[0] || null : null;
  if (session) {
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return { bearer, user: null, mode: "expired" };
    const user = await getUserById(env, session.user_id);
    if (user?.activo !== false && user?.id) return { bearer, user, mode: "session" };
  }
  const legacyUser = await getUserById(env, bearer).catch(() => null);
  if (legacyUser?.activo !== false && legacyUser?.id) return { bearer, user: legacyUser, mode: "legacy_user_id" };
  return { bearer, user: null, mode: "invalid" };
}
async function rewriteRequestWithUserId(request, userId) {
  const url = new URL(request.url); const method = String(request.method || "GET").toUpperCase(); const headers = new Headers(request.headers);
  if (method === "GET" || method === "HEAD") { url.searchParams.set("user_id", userId); return new Request(url.toString(), { method, headers }); }
  const contentType = headers.get("Content-Type") || headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    const body = await request.clone().json().catch(() => ({})); const nextBody = { ...(body || {}), user_id: userId };
    return new Request(url.toString(), { method, headers, body: JSON.stringify(nextBody) });
  }
  return request;
}
async function tryLegacyPasswordLogin(email, password) {
  const payloads = [{ action: "login_password", email, password }, { action: "login", email, password }];
  for (const payload of payloads) {
    try {
      const res = await fetch(LEGACY_GAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (data?.ok || data?.success) return { ok: true, data };
    } catch {}
  }
  return { ok: false };
}
async function ensureLocalUser(env, payload = {}) {
  const email = normalizeEmail(payload?.email || ""); if (!email) throw new Error("Falta email");
  const existing = await findUserByEmail(env, email); const secureHash = payload?.password ? await hashPasswordSecure(String(payload.password)) : null;
  if (existing?.id) {
    const patch = {};
    if (!existing.nombre && payload?.nombre) patch.nombre = normalizeText(payload.nombre);
    if (!existing.apellido && payload?.apellido) patch.apellido = normalizeText(payload.apellido);
    if (!existing.celular && payload?.celular) patch.celular = normalizeText(payload.celular);
    if (existing.activo === false) patch.activo = true;
    if (payload?.google_sub && !existing.google_sub) patch.google_sub = String(payload.google_sub);
    if (secureHash && !String(existing.password_hash || "").startsWith("pbkdf2_sha256$")) patch.password_hash = secureHash;
    if (Object.keys(patch).length) {
      const patched = await supabasePatchReturning(env, "users", `id=eq.${encodeURIComponent(existing.id)}`, patch).catch(() => null);
      return patched || { ...existing, ...patch };
    }
    return existing;
  }
  return await supabaseInsertReturning(env, "users", { nombre: normalizeText(payload?.nombre || "Docente"), apellido: normalizeText(payload?.apellido || "-") || "-", email, celular: normalizeText(payload?.celular || ""), password_hash: secureHash, google_sub: payload?.google_sub ? String(payload.google_sub) : null, activo: true });
}
function splitGoogleName(fullName) { const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean); const nombre = parts.shift() || "Docente"; const apellido = parts.join(" ") || "-"; return { nombre, apellido }; }
async function verifyGoogleCredential(idToken, expectedAud) {
  if (!expectedAud) throw new Error("Falta GOOGLE_CLIENT_ID en Cloudflare");
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`); const text = await res.text(); let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("Google no devolvió una respuesta válida"); }
  if (!res.ok) throw new Error(data?.error_description || data?.error || "Google no validó el token");
  if (String(data.aud || "") !== String(expectedAud)) throw new Error("Google Client ID no coincide");
  if (!(data.email_verified === true || data.email_verified === "true")) throw new Error("El email de Google no está verificado");
  const split = splitGoogleName(data.name || "");
  return { sub: String(data.sub || ""), email: normalizeEmail(data.email || ""), nombre: String(data.given_name || split.nombre || "").trim() || "Docente", apellido: String(data.family_name || split.apellido || "").trim() || "-" };
}
async function handleRegisterSecure(request, env) {
  const body = await request.json().catch(() => ({})); const nombre = normalizeText(body?.nombre); const apellido = normalizeText(body?.apellido); const email = normalizeEmail(body?.email); const password = normalizeText(body?.password); const celular = normalizeText(body?.celular);
  if (!nombre) return json({ ok: false, error: "Falta nombre" }, 400);
  if (!apellido) return json({ ok: false, error: "Falta apellido" }, 400);
  if (!email) return json({ ok: false, error: "Falta email" }, 400);
  if (!password || password.length < 6) return json({ ok: false, error: "La contraseña debe tener al menos 6 caracteres" }, 400);
  const existing = await findUserByEmail(env, email); if (existing?.id) return json({ ok: false, error: "Ese email ya está registrado" }, 409);
  const passwordHash = await hashPasswordSecure(password);
  const nuevoUsuario = await supabaseInsertReturning(env, "users", { nombre, apellido, email, celular, password_hash: passwordHash, activo: true });
  if (!nuevoUsuario?.id) return json({ ok: false, error: "No se pudo obtener el ID del usuario creado" }, 500);
  await ensureTrialIfNoSubscriptions(env, nuevoUsuario.id, email, "trial_auto_register_secure");
  return json({ ok: true, message: "Usuario registrado correctamente", data: { id: nuevoUsuario.id, nombre: nuevoUsuario.nombre || nombre, apellido: nuevoUsuario.apellido || apellido, email: nuevoUsuario.email || email, celular: nuevoUsuario.celular || celular, activo: nuevoUsuario.activo !== false } });
}
async function handleLoginSecure(request, env) {
  const body = await request.json().catch(() => ({})); const email = normalizeEmail(body?.email); const password = String(body?.password || "");
  if (!email || !password) return json({ ok: false, message: "Faltan datos" }, 400);
  let user = await findUserByEmail(env, email); if (user?.id && user.activo === false) return json({ ok: false, message: "Usuario inactivo" }, 403);
  if (user?.id) {
    const verified = await verifyPasswordFlexible(user.password_hash, password);
    if (verified.ok) {
      if (verified.needsUpgrade) await supabasePatchReturning(env, "users", `id=eq.${encodeURIComponent(user.id)}`, { password_hash: await hashPasswordSecure(password) }).catch(() => null);
      await ensureTrialIfNoSubscriptions(env, user.id, user.email, "trial_auto_login_secure");
      const session = await createSession(env, user.id, "password"); await touchUltimoLogin(env, user.id);
      return json({ ok: true, token: String(user.id), session_token: session.token, user: { id: user.id, nombre: user.nombre || "", apellido: user.apellido || "", email: user.email || "" } });
    }
  }
  const legacy = await tryLegacyPasswordLogin(email, password);
  if (legacy.ok) {
    const legacyUser = legacy.data?.user || legacy.data?.data || {};
    user = await ensureLocalUser(env, { email, password, nombre: legacyUser?.nombre || legacyUser?.name || "", apellido: legacyUser?.apellido || legacyUser?.last_name || "", celular: legacyUser?.celular || legacyUser?.phone || "" });
    if (!user?.id) return json({ ok: false, message: "No se pudo migrar la cuenta existente" }, 500);
    await ensureTrialIfNoSubscriptions(env, user.id, user.email, "trial_auto_login_legacy_secure");
    const session = await createSession(env, user.id, "password_legacy"); await touchUltimoLogin(env, user.id);
    return json({ ok: true, migrated_legacy: true, token: String(user.id), session_token: session.token, user: { id: user.id, nombre: user.nombre || "", apellido: user.apellido || "", email: user.email || "" } });
  }
  if (user?.id) return json({ ok: false, message: "Password incorrecto" }, 401);
  return json({ ok: false, message: "Usuario no encontrado o credenciales incorrectas" }, 401);
}
async function handleGoogleAuthSecure(request, env) {
  const body = await request.json().catch(() => ({})); const credential = String(body?.credential || "").trim(); if (!credential) return json({ ok: false, message: "Falta credential de Google" }, 400);
  const googleUser = await verifyGoogleCredential(credential, env.GOOGLE_CLIENT_ID); let user = await findUserByGoogleSub(env, googleUser.sub); let mode = "login";
  if (!user) { user = await ensureLocalUser(env, { email: googleUser.email, nombre: googleUser.nombre, apellido: googleUser.apellido, google_sub: googleUser.sub }); mode = "register"; }
  if (!user?.id) return json({ ok: false, message: "No se pudo crear o vincular el usuario con Google" }, 500); if (user.activo === false) return json({ ok: false, message: "Usuario inactivo" }, 403);
  if (!user.google_sub || user.google_sub !== googleUser.sub) await supabasePatchReturning(env, "users", `id=eq.${encodeURIComponent(user.id)}`, { google_sub: googleUser.sub, activo: true }).catch(() => null);
  await ensureTrialIfNoSubscriptions(env, user.id, user.email, "trial_auto_google_secure");
  const session = await createSession(env, user.id, "google"); await touchUltimoLogin(env, user.id);
  return json({ ok: true, mode, token: String(user.id), session_token: session.token, user: { id: user.id, nombre: user.nombre || googleUser.nombre || "", apellido: user.apellido || googleUser.apellido || "", email: user.email || googleUser.email || "" } });
}

const REWRITE_GET_PATHS = new Set([`${API_URL_PREFIX}/mi-plan`, `${API_URL_PREFIX}/mis-alertas`, `${API_URL_PREFIX}/historico-resumen`]);
const REWRITE_POST_PATHS = new Set([`${API_URL_PREFIX}/guardar-preferencias`, `${API_URL_PREFIX}/capturar-historico-apd`, `${API_URL_PREFIX}/mercadopago/create-checkout-link`, `${API_URL_PREFIX}/whatsapp/test-send`]);

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    const url = new URL(request.url); const path = url.pathname;
    if (path === `${API_URL_PREFIX}/version` && request.method === "GET") return json({ ok: true, version: HOTFIX_VERSION, worker_version: env.WORKER_URL || "worker-hotfix" });
    if (path === `${API_URL_PREFIX}/register` && request.method === "POST") { try { return await handleRegisterSecure(request, env); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo registrar" }, 500); } }
    if (path === `${API_URL_PREFIX}/login` && request.method === "POST") { try { return await handleLoginSecure(request, env); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo iniciar sesión" }, 500); } }
    if (path === `${API_URL_PREFIX}/google-auth` && request.method === "POST") { try { return await handleGoogleAuthSecure(request, env); } catch (err) { return json({ ok: false, message: err?.message || "No se pudo ingresar con Google" }, 400); } }
    { const repoRouted = await handleRepositoryRoute(request, env); if (repoRouted) return repoRouted; }
    if (path.startsWith(`${API_URL_PREFIX}/profile/`) || path.startsWith(`${API_URL_PREFIX}/listados/`) || path.startsWith(`${API_URL_PREFIX}/eligibility/`)) {
      const routed = await handleProfileListadosRoute(request, env); if (routed) return routed;
    }
    if (REWRITE_GET_PATHS.has(path) || REWRITE_POST_PATHS.has(path)) {
      const bearer = getBearerToken(request);
      if (bearer) {
        const auth = await resolveAuthUser(env, request);
        if (!auth.user?.id) return json({ ok: false, message: "No autenticado" }, 401);
        const rewritten = await rewriteRequestWithUserId(request, auth.user.id);
        return await originalWorker.fetch(rewritten, env, ctx);
      }
    }
    return await originalWorker.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    if (typeof originalWorker?.scheduled === "function") return await originalWorker.scheduled(controller, env, ctx);
  }
};
