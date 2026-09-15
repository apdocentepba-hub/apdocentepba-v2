import fs from 'node:fs';

const indexPath = process.argv[2] || 'index.html';
const patchPath = process.argv[3] || 'auth_session_patch.js';
const index = fs.readFileSync(indexPath, 'utf8');
const patch = fs.readFileSync(patchPath, 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const appPos = index.indexOf('src="app_v2.js');
const patchPos = index.indexOf('src="auth_session_patch.js');
assert(appPos >= 0, 'app_v2.js is not loaded');
assert(patchPos >= 0, 'SECURITY BUG: auth_session_patch.js is not loaded by index.html');
assert(patchPos > appPos, 'auth_session_patch.js must load after app_v2.js');

assert(patch.includes("const SESSION_TOKEN_KEY = 'apd_session_token_v1'"), 'session token key missing');
assert(/function\s+getAuthBearer\s*\(/.test(patch), 'getAuthBearer missing');
const authBearerBody = patch.match(/function\s+getAuthBearer\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
assert(/getSessionToken\(\)/.test(authBearerBody), 'auth bearer does not use the session token');
assert(!/getUserToken\(\)/.test(authBearerBody), 'SECURITY BUG: auth bearer still falls back to the public user UUID');
assert(/window\.workerFetchJson\s*=/.test(patch), 'workerFetchJson is not patched to send the session bearer');
assert(/window\.getAdminToken\s*=\s*getAuthBearer|window\.getAdminToken\s*=\s*\(.*getAuthBearer/.test(patch), 'admin API does not use session bearer');
assert(/session_token/.test(patch), 'login patch does not consume session_token');
assert(/handleGoogleCredential/.test(patch) || /google-auth/.test(patch), 'Google login is not patched to store a session token');
assert(/clearAuthSession/.test(patch), 'logout/session cleanup missing');
assert(/clearLegacyAuthIfNeeded|removeItem\(USER_TOKEN_KEY\)/.test(patch), 'legacy UUID-only sessions are not invalidated');

const workerPatch = patch.match(/window\.workerFetchJson\s*=([\s\S]{0,2200})/)?.[1] || '';
assert(/getAuthBearer\(\)/.test(workerPatch), 'patched workerFetchJson does not use getAuthBearer');

console.log('PASS: frontend separates user id from bearer session and forbids UUID bearer fallback');
