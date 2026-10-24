import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The exported production bundle is self-contained ESM. Import it without
// touching Cloudflare, Supabase or any public network endpoint.
const source = readFileSync("worker-live/worker_hotfix.js", "utf8");
const frontend = readFileSync("app_v2.js", "utf8");
const moduleURL = "data:text/javascript;base64," + Buffer.from(source, "utf8").toString("base64");
const { default: worker } = await import(moduleURL);

const GOOD_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "synthetic-unit-test-session";
const env = { SUPABASE_URL: "https://unit-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic-only" };
const originalFetch = globalThis.fetch;

const mkReq = (path = "/api/account/preferences", bearer = TOKEN, method = "GET") =>
  new Request("https://worker.example.test" + path, {
    method,
    headers: bearer ? { Authorization: "Bearer " + bearer } : {}
  });
const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

function mockedBackend({ session = true, expired = false, active = true, prefs = true, failPrefs = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = new URL(url);
    assert.equal(target.origin, "https://unit-test.supabase.co");
    assert.equal(options.method, "GET");
    assert.equal(options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
    calls.push(target);
    if (target.pathname.endsWith("/sessions")) {
      return jsonResponse(session ? [{
        user_id: GOOD_ID,
        activo: true,
        token: TOKEN,
        expires_at: expired ? "2000-01-01T00:00:00Z" : "2100-01-01T00:00:00Z"
      }] : []);
    }
    if (target.pathname.endsWith("/users")) {
      return jsonResponse([{
        id: GOOD_ID, nombre: "Test", apellido: "User", email: "placeholder@example.invalid",
        activo: active, ultimo_login: "2026-10-20T00:00:00Z"
      }]);
    }
    if (target.pathname.endsWith("/user_preferences")) {
      if (failPrefs) return jsonResponse({ error: "forbidden" }, 403);
      return jsonResponse(prefs ? [{
        user_id: GOOD_ID, distrito_principal: "AVELLANEDA", alertas_email: true
      }] : []);
    }
    throw new Error("Unexpected Supabase table: " + target.pathname);
  };
  return calls;
}
test.after(() => { globalThis.fetch = originalFetch; });

test("rejects anonymous request before touching the database", async () => {
  const calls = mockedBackend();
  const res = await worker.fetch(mkReq("/api/account/preferences", "", "GET"), env, {});
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test("rejects arbitrary session tokens", async () => {
  const calls = mockedBackend({ session: false });
  const res = await worker.fetch(mkReq(), env, {});
  assert.equal(res.status, 401);
  assert.equal(calls.filter(u => u.pathname.endsWith("/user_preferences")).length, 0);
});

test("rejects expired sessions", async () => {
  const calls = mockedBackend({ expired: true });
  const res = await worker.fetch(mkReq(), env, {});
  assert.equal(res.status, 401);
  assert.equal(calls.filter(u => u.pathname.endsWith("/user_preferences")).length, 0);
});

test("rejects inactive users", async () => {
  const calls = mockedBackend({ active: false });
  const res = await worker.fetch(mkReq(), env, {});
  assert.equal(res.status, 401);
  assert.equal(calls.filter(u => u.pathname.endsWith("/user_preferences")).length, 0);
});

test("returns only session owner's preferences even if another user ID is supplied", async () => {
  const calls = mockedBackend();
  const res = await worker.fetch(mkReq("/api/account/preferences?user_id=" + OTHER_ID), env, {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.preferences.user_id, GOOD_ID);
  const prefReads = calls.filter(u => u.pathname.endsWith("/user_preferences"));
  assert.equal(prefReads.length, 1);
  assert.equal(prefReads[0].searchParams.get("user_id"), "eq." + GOOD_ID);
  assert.ok(!JSON.stringify(body).includes(OTHER_ID));
});

test("allows a legitimate account without a saved preferences row", async () => {
  mockedBackend({ prefs: false });
  const res = await worker.fetch(mkReq(), env, {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, preferences: null });
});

test("does not silently replace backend errors with empty preferences", async () => {
  mockedBackend({ failPrefs: true });
  const res = await worker.fetch(mkReq(), env, {});
  assert.equal(res.status, 502);
  const result = await res.json();
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes("forbidden"));
});

test("refuses mutating preferences through the read-only endpoint", async () => {
  const calls = mockedBackend();
  const res = await worker.fetch(mkReq("/api/account/preferences", TOKEN, "POST"), env, {});
  assert.equal(res.status, 405);
  assert.equal(calls.length, 0);
});

test("authenticated profile preserves old dashboard fields and excludes password hashes", async () => {
  const calls = mockedBackend();
  const res = await worker.fetch(mkReq("/api/account/profile"), env, {});
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.user.id, GOOD_ID);
  assert.equal(body.user.activo, true);
  assert.equal(body.user.ultimo_login, "2026-10-20T00:00:00Z");
  assert.equal("password_hash" in body.user, false);
  assert.equal(calls.filter(u => u.pathname.endsWith("/users")).length, 2);
});

test("dashboard no longer reads private tables with the browser's public key", () => {
  assert.doesNotMatch(frontend, /supabaseFetch\s*\(\s*['\x60]\s*users\?/);
  assert.doesNotMatch(frontend, /supabaseFetch\s*\(\s*['\x60]\s*user_preferences\?/);
  assert.doesNotMatch(frontend, /users\?id=eq\./);
  assert.doesNotMatch(frontend, /user_preferences\?user_id=eq\./);
  assert.match(frontend, /workerFetchJson\("\/api\/account\/profile"\)/);
  assert.match(frontend, /workerFetchJson\("\/api\/account\/preferences"\)/);
});

test("dashboard keeps a valid session on transient API failures", () => {
  const begin = frontend.indexOf("async function cargarDashboard()");
  const end = frontend.indexOf("function renderDashboard(", begin);
  assert.ok(begin >= 0 && end > begin);
  const section = frontend.slice(begin, end);
  const catchIndex = section.lastIndexOf('console.error("ERROR CARGANDO PANEL:", err)');
  assert.ok(catchIndex > 0);
  const errorHandler = section.slice(catchIndex);
  assert.doesNotMatch(errorHandler, /\blogout\s*\(/, "network errors must not log out users");
  assert.match(errorHandler, /sesionVigente/, "only auth patch may clear an invalid session");
});

test("HTML invalidates the legacy dashboard bundle cache", () => {
  const html = readFileSync("index.html", "utf8");
  assert.match(html, /app_v2\.js\?v=20/, "dashboard script version must change on rollout");
  assert.match(html, /auth_session_patch\.js/, "session-based API wrapper must remain loaded");
});
