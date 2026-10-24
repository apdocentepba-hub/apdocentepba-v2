import assert from 'node:assert/strict';
import fs from 'node:fs';

// This smoke never prints private rows, response bodies or keys.
const frontend = fs.readFileSync(new URL('../app_v2.js', import.meta.url), 'utf8');
const getLiteral = (name) => {
  const match = frontend.match(new RegExp('^const ' + name + '\\s*=\\s*["\\x27]([^"\\x27]+)["\\x27];', 'm'));
  assert.ok(match?.[1], name + ': missing public frontend configuration');
  return match[1];
};
const supabaseUrl = getLiteral('APD_SUPABASE_URL');
const publishableKey = getLiteral('APD_SUPABASE_KEY');
const workerUrl = getLiteral('API_URL');

assert.match(supabaseUrl, /^https:\/\/[a-z0-9-]+\.supabase\.co$/, 'Unexpected Supabase host');
assert.match(workerUrl, /^https:\/\/[a-z0-9-]+\.workers\.dev$/, 'Unexpected Worker host');
assert.ok(publishableKey.startsWith('sb_publishable_') || publishableKey.startsWith('eyJ'), 'Only public keys are allowed');

// APDocente uses its own Worker sessions, not Supabase Auth tokens.
// A public Data API caller cannot read either private table.
for (const table of ['users', 'user_preferences']) {
  const url = new URL('/rest/v1/' + table, supabaseUrl);
  url.search = '?select=*&limit=1';
  const res = await fetch(url, {
    headers: { apikey: publishableKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  assert.ok([401, 403].includes(res.status), table + ': public REST read returned HTTP ' + res.status);
  console.log('REST ' + table + ': HTTP ' + res.status + ', denied');
}

// A user_id query argument must not bypass Worker session checks.
for (const path of [
  '/api/account/profile',
  '/api/account/preferences',
  '/api/account/marketing-preferences'
]) {
  const url = new URL(path, workerUrl);
  url.searchParams.set('user_id', '00000000-0000-4000-8000-000000000000');
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert.equal(res.status, 401, path + ': anonymous request must be denied');
  console.log(path + ': HTTP 401, denied');
}

assert.ok(frontend.includes('workerFetchJson("/api/account/profile")'), 'Profile must use the Worker');
assert.ok(frontend.includes('workerFetchJson("/api/account/preferences")'), 'Preferences must use the Worker');
console.log('PRIVATE_DATA_DENIAL_V1: PASS. Authenticated session QA remains separate.');
