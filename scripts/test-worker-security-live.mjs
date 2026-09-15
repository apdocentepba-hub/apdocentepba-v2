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
assert(/2026-09-15-session-security-1/.test(src), 'security version marker missing');

const finalStart = src.lastIndexOf('var worker_hotfix_default = {');
assert(finalStart >= 0, 'final worker_hotfix_default router not found');
const final = src.slice(finalStart);
const guardPos = final.indexOf('SENSITIVE_TEST_PATHS.has(path)');
const healthPos = final.indexOf('/email-alerts-health');
const sweepPos = final.indexOf('/test-email-sweep');
assert(guardPos >= 0, 'test route guard is not wired into final fetch');
assert(healthPos >= 0, 'email health route is not wired into final fetch');
assert(sweepPos < 0 || guardPos < sweepPos, 'test route guard runs after a sensitive test route');

for (const route of ['/test-email-sweep', '/test-mail', '/test-digest']) {
  assert(src.includes(route), `expected ${route} route missing from source`);
  assert(/SENSITIVE_TEST_PATHS/.test(final), `${route} is not covered by final-router guard`);
}

console.log('PASS: final Worker requires real sessions and protects mutating test routes');
