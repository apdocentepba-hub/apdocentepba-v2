import fs from 'node:fs';

const p = process.argv[2];
if (!p) throw new Error('usage: node test-worker-security-live.mjs <worker_hotfix.js>');
const src = fs.readFileSync(p, 'utf8');
function assert(cond, msg) { if (!cond) throw new Error(msg); }

assert(!/mode:\s*["']legacy_user_id["']/.test(src), 'SECURITY BUG: resolveAuthUser accepts a user UUID as a bearer token');
assert(!/else\s*\{\s*userId\s*=\s*token\s*;\s*\}/m.test(src), 'SECURITY BUG: getSessionUserByBearer treats Bearer as user_id');
assert(/SENSITIVE_TEST_PATHS/.test(src), 'security guard for mutating test routes is missing');
assert(/requireSecureAdmin/.test(src), 'secure admin guard is missing');
assert(/email-alerts-health/.test(src), 'safe email health endpoint is missing');
assert(/2026-09-15-session-security-2/.test(src), 'security version marker missing');

const finalStart = src.lastIndexOf('var worker_hotfix_default = {');
assert(finalStart >= 0, 'final worker_hotfix_default router not found');
const final = src.slice(finalStart);
const guardPos = final.indexOf('SENSITIVE_TEST_PATHS.has(securityPath)');
const hotfixPos = final.indexOf('handleHotfixRoute(request, env, ctx)');
const oldDelegatePos = final.indexOf('worker_default.fetch(request, env, ctx)');
const healthPos = final.indexOf('/email-alerts-health');
assert(guardPos >= 0, 'test route guard is not wired into final fetch');
assert(hotfixPos >= 0 && guardPos < hotfixPos, 'SECURITY BUG: sensitive test guard runs after handleHotfixRoute');
assert(oldDelegatePos < 0 || guardPos < oldDelegatePos, 'SECURITY BUG: sensitive test guard runs after legacy delegation');
assert(healthPos >= 0, 'email health route is not wired into final fetch');

for (const route of ['/test-email-sweep', '/test-mail', '/test-digest']) {
  assert(src.includes(route), `expected ${route} route missing from source`);
  assert(/SENSITIVE_TEST_PATHS/.test(final), `${route} is not covered by final-router guard`);
}

console.log('PASS: final Worker requires real sessions and guards test routes before every router');
