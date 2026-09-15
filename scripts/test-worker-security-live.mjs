import fs from 'node:fs';

const p = process.argv[2];
if (!p) throw new Error('usage: node test-worker-security-live.mjs <worker_hotfix.js>');
const src = fs.readFileSync(p, 'utf8');
function assert(cond, msg) { if (!cond) throw new Error(msg); }

assert(!/mode:\s*["']legacy_user_id["']/.test(src), 'SECURITY BUG: resolveAuthUser still accepts a user UUID as a bearer token');
assert(!/else\s*\{\s*userId\s*=\s*token\s*;\s*\}/m.test(src), 'SECURITY BUG: legacy getSessionUserByBearer still treats the bearer as user_id');
assert(/SENSITIVE_TEST_PATHS/.test(src), 'security guard for mutating test routes is missing');
assert(/\/test-email-sweep/.test(src) && /\/test-mail/.test(src) && /\/test-digest/.test(src), 'expected test routes missing');
assert(/requireSecureAdmin/.test(src), 'test routes are not guarded by a secure admin session');
assert(/email-alerts-health/.test(src), 'safe non-mutating email health endpoint is missing');

const fetchStart = src.lastIndexOf('export default');
const fetchPart = fetchStart >= 0 ? src.slice(fetchStart) : src;
const guardPos = fetchPart.indexOf('SENSITIVE_TEST_PATHS.has(path)');
const delegatePos = fetchPart.indexOf('originalWorker.fetch');
assert(guardPos >= 0, 'test route guard is not wired into fetch');
assert(delegatePos < 0 || guardPos < delegatePos, 'test route guard runs too late, after delegation');

console.log('PASS: Worker requires real sessions and protects mutating test routes');
