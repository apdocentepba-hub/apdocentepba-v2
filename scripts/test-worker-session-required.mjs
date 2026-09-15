import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worker_hotfix.js', import.meta.url), 'utf8');
const marker = 'if (REWRITE_GET_PATHS.has(path) || REWRITE_POST_PATHS.has(path)) {';
const start = source.indexOf(marker);
const fallback = source.indexOf('return await originalWorker.fetch(request, env, ctx);', start);

assert.ok(start >= 0, 'protected user-route gate must exist');
assert.ok(fallback > start, 'protected route gate must appear before the generic Worker fallback');

const gate = source.slice(start, fallback);

assert.match(
  gate,
  /const auth = await resolveAuthUser\(env, request\);/,
  'protected user routes must always resolve an authenticated session'
);
assert.match(
  gate,
  /if \(!auth\.user\?\.id\) return json\(\{ ok: false, message: "No autenticado" \}, 401\);/,
  'missing, expired, or invalid sessions must be rejected with 401'
);
assert.doesNotMatch(
  gate,
  /if \(bearer\)/,
  'authentication must not be optional for protected user routes'
);
assert.match(
  gate,
  /rewriteRequestWithUserId\(request, auth\.user\.id\)/,
  'protected routes must overwrite caller-supplied user_id with the authenticated user id'
);

console.log('worker session-required contract: OK');
