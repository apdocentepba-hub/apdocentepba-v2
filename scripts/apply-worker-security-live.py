from pathlib import Path
import re
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: apply-worker-security-live.py <input> <output>')

inp, out = map(Path, sys.argv[1:])
s = inp.read_text()
original = s

# 1) The legacy resolver must never treat an unknown Bearer as a user UUID.
inner_pattern = re.compile(r'else\s*\{\s*userId\s*=\s*token\s*;\s*\}')
s, inner_count = inner_pattern.subn('else {\n    return null;\n  }', s, count=1)
if inner_count != 1:
    raise SystemExit(f'expected exactly one legacy token->user fallback, found {inner_count}')
if inner_pattern.search(s):
    raise SystemExit('another legacy token->user fallback remains after patch')
if 'legacy_user_id' in s:
    raise SystemExit('unexpected legacy_user_id fallback exists in live Worker')

# 2) Locate the actual final router from the bundled production module.
final_marker = 'var worker_hotfix_default = {'
final_start = s.rfind(final_marker)
if final_start < 0:
    raise SystemExit('final worker_hotfix_default router not found')
final = s[final_start:]
fetch_anchor = '''  async fetch(request, env, ctx) {
    const hotfix = await handleHotfixRoute(request, env, ctx);'''
path_anchor = '    const path = url.pathname;'
if final.count(fetch_anchor) != 1:
    raise SystemExit(f'expected one final fetch anchor, found {final.count(fetch_anchor)}')
if final.count(path_anchor) != 1:
    raise SystemExit(f'expected one final-router path anchor, found {final.count(path_anchor)}')

helpers = r'''
var SENSITIVE_TEST_PATHS = new Set(["/test-mail", "/test-email-sweep", "/test-digest"]);
async function requireSecureAdmin(env, request) {
  const user = await getSessionUserByBearer(env, request);
  if (!user) return adminJson({ ok: false, error: "No autenticado" }, 401);
  if (user.es_admin !== true) return adminJson({ ok: false, error: "No autorizado" }, 403);
  return null;
}
async function handleEmailAlertsHealth(env) {
  const latest = await supabaseSelect(
    env,
    "notification_delivery_logs?channel=eq.email&select=created_at,status&order=created_at.desc&limit=1"
  ).catch(() => []);
  const pending = await supabaseSelect(
    env,
    "pending_notifications?channel=eq.email&status=eq.pending&select=id&limit=101"
  ).catch(() => []);
  const last = Array.isArray(latest) ? latest[0] || null : null;
  return json2({
    ok: true,
    service: "email-alerts",
    version: HOTFIX_VERSION,
    provider_configured: !!env.BREVO_API_KEY,
    pending_email_count: Array.isArray(pending) ? pending.length : 0,
    pending_count_capped: Array.isArray(pending) && pending.length >= 101,
    latest_delivery_at: last?.created_at || null,
    latest_delivery_status: last?.status || null
  });
}
'''

if 'var SENSITIVE_TEST_PATHS = new Set(' in s:
    raise SystemExit('security helpers already present unexpectedly')
s = s[:final_start] + helpers + '\n' + s[final_start:]

# Re-locate after helper insertion. The security prelude runs BEFORE handleHotfixRoute,
# so no current or future delegated router can bypass it.
final_start = s.rfind(final_marker)
final = s[final_start:]
prelude = '''  async fetch(request, env, ctx) {
    const securityUrl = new URL(request.url);
    const securityPath = securityUrl.pathname;
    if (SENSITIVE_TEST_PATHS.has(securityPath)) {
      const denied = await requireSecureAdmin(env, request);
      if (denied) return denied;
    }
    const hotfix = await handleHotfixRoute(request, env, ctx);'''
if final.count(fetch_anchor) != 1:
    raise SystemExit('final fetch anchor changed unexpectedly')
final = final.replace(fetch_anchor, prelude, 1)

# Safe read-only health route can use the normal final router path after hotfix delegation.
health_block = '''    const path = url.pathname;
    if (path === `${API_URL_PREFIX3}/email-alerts-health` && request.method === "GET") {
      return await handleEmailAlertsHealth(env);
    }'''
if final.count(path_anchor) != 1:
    raise SystemExit('final router path anchor changed unexpectedly')
final = final.replace(path_anchor, health_block, 1)
s = s[:final_start] + final

# 3) Give this candidate an explicit observable version marker.
version_pattern = re.compile(r'\b(?:const|let|var)\s+HOTFIX_VERSION\s*=\s*"[^"]+"\s*;')
matches = list(version_pattern.finditer(s))
if len(matches) != 1:
    raise SystemExit(f'expected exactly one HOTFIX_VERSION declaration, found {len(matches)}')
s = version_pattern.sub('var HOTFIX_VERSION = "2026-09-15-session-security-2";', s, count=1)

if s == original:
    raise SystemExit('patch made no changes')
out.write_text(s)
print('patched exact live Worker: session-only bearer, pre-router test guard, email health endpoint')
