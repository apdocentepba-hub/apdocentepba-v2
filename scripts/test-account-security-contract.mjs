import assert from 'node:assert/strict';
import fs from 'node:fs';

// Keep this contract stable so account/security changes always retrigger PR validation.
// It covers frontend isolation, password serialization and server-side session issuance on every login path.
// Runtime regression: Workers WebCrypto must never receive a PBKDF2 count above its supported ceiling.
const worker = fs.readFileSync('worker-live/worker_hotfix.js', 'utf8');
const patch = fs.readFileSync('account_profile_patch.js', 'utf8');
const hotfix = fs.readFileSync('account_profile_hotfix.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

for (const source of [patch, hotfix]) {
  assert.doesNotMatch(source, /password_hash/, 'account frontend must never read or write password_hash');
  assert.doesNotMatch(source, /APD_SUPABASE_URL|\/rest\/v1\/users/, 'account frontend must not access users table directly');
}

assert.match(patch, /\/api\/account\/profile/, 'account frontend must use session-authenticated profile API');
assert.match(patch, /\/api\/account\/change-password/, 'account frontend must use session-authenticated password API');
assert.match(patch, /Authorization/, 'account frontend must send Authorization header');
assert.match(patch, /Bearer/, 'account frontend must send Bearer session token');
assert.doesNotMatch(index, /account_profile_hotfix\.js/, 'obsolete direct-Supabase account hotfix must not be loaded');

assert.match(worker, /account\/profile/, 'canonical Worker must expose account profile API');
assert.match(worker, /account\/change-password/, 'canonical Worker must expose account password API');
assert.match(worker, /pbkdf2_sha256\$/, 'canonical Worker must store secure PBKDF2 password hashes');
assert.match(
  worker,
  /return `pbkdf2_sha256\$\$\{ACCOUNT_PBKDF2_ITERATIONS_V1\}\$\$\{salt\}\$\$\{hash\}`;/,
  'PBKDF2 encoder must persist algorithm, iterations, salt and hash with $ separators that the verifier can parse'
);
assert.doesNotMatch(worker, /password_hash:\s*password\s*[,}]/, 'canonical Worker must not store registration passwords in plaintext');
assert.doesNotMatch(worker, /password_hash:\s*payload\?\.password\s*\?\s*String\(payload\.password\)/, 'canonical Worker must not persist legacy migration passwords in plaintext');

const pbkdf2Iterations = worker.match(/const ACCOUNT_PBKDF2_ITERATIONS_V1\s*=\s*(\d+)\s*;/);
assert.ok(pbkdf2Iterations, 'canonical Worker must declare the account PBKDF2 iteration count');
assert.ok(
  Number(pbkdf2Iterations[1]) <= 100000,
  'Cloudflare Workers WebCrypto supports at most 100000 PBKDF2 iterations; account hashes must stay within that runtime limit'
);

const verifierStart = worker.indexOf('async function accountVerifyPasswordV1');
const verifierEnd = worker.indexOf('async function accountReadUserV1', verifierStart);
assert.ok(verifierStart >= 0 && verifierEnd > verifierStart, 'account PBKDF2 verifier must have a bounded body');
const verifier = worker.slice(verifierStart, verifierEnd);
assert.match(
  verifier,
  /iterations\s*>\s*ACCOUNT_PBKDF2_ITERATIONS_V1[\s\S]{0,200}unsupportedPbkdf2\s*:\s*true/,
  'verifier must reject unsupported legacy PBKDF2 iteration counts before calling WebCrypto so login can fall back to legacy migration'
);

const loginStart = worker.indexOf('async function handleLoginHotfix(request, env)');
const googleStart = worker.indexOf('async function handleGoogleAuthHotfix(request, env)');
const googleEnd = worker.indexOf('function adaptarPreferenciasRow2', googleStart);
assert.ok(loginStart >= 0 && googleStart > loginStart, 'password hotfix login handler must exist');
assert.ok(googleEnd > googleStart, 'Google hotfix login handler must have a bounded body');
const loginHotfix = worker.slice(loginStart, googleStart);
const googleHotfix = worker.slice(googleStart, googleEnd);
for (const [name, source] of [['password', loginHotfix], ['Google', googleHotfix]]) {
  assert.match(source, /session_token\s*:/, `${name} login must return a session_token`);
  assert.match(source, /(?:accountCreateSessionV1|createSession)\s*\(/, `${name} login must create a server-side session`);
}
assert.match(loginHotfix, /password_legacy/, 'legacy password login must create a dedicated migrated session');
assert.match(
  loginHotfix,
  /legacy\.ok[\s\S]*password_hash\s*:\s*await accountHashPasswordV1\(password\)/,
  'successful legacy login must replace unsupported/legacy stored hashes with a runtime-supported PBKDF2 hash'
);

console.log('account security contract: OK');
