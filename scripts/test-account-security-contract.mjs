import assert from 'node:assert/strict';
import fs from 'node:fs';

// Keep this contract stable so account/security changes always retrigger PR validation.
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

console.log('account security contract: OK');
