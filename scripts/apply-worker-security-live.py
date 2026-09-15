from pathlib import Path
import re
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: apply-worker-security-live.py <input> <output>')

inp, out = map(Path, sys.argv[1:])
s = inp.read_text()
original = s

# 1) Legacy inner auth resolver must never treat a bearer token as a user UUID.
old_inner = '''  } else {
    userId = token;
  }

  const users = await supabaseSelect('''
new_inner = '''  } else {
    return null;
  }

  const users = await supabaseSelect('''
if s.count(old_inner) != 1:
    raise SystemExit(f'expected exactly one legacy token->user fallback, found {s.count(old_inner)}')
s = s.replace(old_inner, new_inner, 1)

# 2) Hotfix resolver must require a stored session too.
old_hotfix = '''  const legacyUser = await getUserById(env, bearer).catch(() => null);
  if (legacyUser?.activo !== false && legacyUser?.id) return { bearer, user: legacyUser, mode: "legacy_user_id" };
  return { bearer, user: null, mode: "invalid" };'''
new_hotfix = '''  return { bearer, user: null, mode: "invalid" };'''
if s.count(old_hotfix) != 1:
    raise SystemExit(f'expected exactly one hotfix legacy user-id fallback, found {s.count(old_hotfix)}')
s = s.replace(old_hotfix, new_hotfix, 1)

# 3) Add a safe health endpoint and protect all mutating/debug email routes with secure admin auth.
anchor = 'const REWRITE_GET_PATHS = new Set(['
if s.count(anchor) != 1:
    raise SystemExit(f'rewrite-path anchor count is {s.count(anchor)}')
helpers = r'''const SENSITIVE_TEST_PATHS = new Set(["/test-mail", "/test-email-sweep", "/test-digest"]);

async function requireSecureAdmin(env, request) {
  const auth = await resolveAuthUser(env, request);
  if (!auth.user?.id) return json({ ok: false, message: "No autenticado" }, 401);
  if (auth.user.es_admin !== true) return json({ ok: false, message: "No autorizado" }, 403);
  return null;
}

async function handleEmailAlertsHealth(env) {
  const latest = await supabaseSelect(
    env,
    "notification_delivery_logs?channel=eq.email&select=created_at,status,provider&order=created_at.desc&limit=1"
  ).catch(() => []);
  const pending = await supabaseSelect(
    env,
    "pending_notifications?channel=eq.email&status=eq.pending&select=id&limit=101"
  ).catch(() => []);
  const last = Array.isArray(latest) ? latest[0] || null : null;
  return json({
    ok: true,
    service: "email-alerts",
    version: HOTFIX_VERSION,
    provider_configured: !!env.BREVO_API_KEY,
    pending_email_count: Array.isArray(pending) ? pending.length : 0,
    latest_delivery_at: last?.created_at || null,
    latest_delivery_status: last?.status || null
  });
}

'''
s = s.replace(anchor, helpers + anchor, 1)

route_anchor = '''    if (path === `${API_URL_PREFIX}/version` && request.method === "GET") return json({ ok: true, version: HOTFIX_VERSION, worker_version: env.WORKER_URL || "worker-hotfix" });'''
if s.count(route_anchor) != 1:
    raise SystemExit(f'version-route anchor count is {s.count(route_anchor)}')
route_block = route_anchor + '''
    if (path === `${API_URL_PREFIX}/email-alerts-health` && request.method === "GET") return await handleEmailAlertsHealth(env);
    if (SENSITIVE_TEST_PATHS.has(path)) {
      const blocked = await requireSecureAdmin(env, request);
      if (blocked) return blocked;
    }'''
s = s.replace(route_anchor, route_block, 1)

# Version marker is useful in safe health/version output.
s, n = re.subn(r'const HOTFIX_VERSION = "[^"]+";', 'const HOTFIX_VERSION = "2026-09-15-session-security-1";', s, count=1)
if n != 1:
    raise SystemExit('HOTFIX_VERSION marker not found')

if s == original:
    raise SystemExit('patch made no changes')
out.write_text(s)
print('patched Worker security: session-only bearer + guarded test routes + health endpoint')
