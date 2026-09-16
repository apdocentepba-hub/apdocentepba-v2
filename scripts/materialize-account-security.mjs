import crypto from 'node:crypto';
import fs from 'node:fs';

const workerPath = 'worker-live/worker_hotfix.js';
const manifestPath = 'worker-live/manifest.json';
let worker = fs.readFileSync(workerPath, 'utf8');
const accountHelpers = fs.readFileSync('scripts/account-security-worker-snippet.txt', 'utf8').trimEnd();

function replaceExact(oldText, newText, label, expected = 1) {
  const count = worker.split(oldText).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} exact occurrence(s), found ${count}`);
  worker = worker.split(oldText).join(newText);
}

function replaceRegex(regex, replacement, label, expected = 1) {
  const matches = worker.match(regex) || [];
  if (matches.length !== expected) throw new Error(`${label}: expected ${expected} regex occurrence(s), found ${matches.length}`);
  worker = worker.replace(regex, replacement);
}

const marker = 'var worker_hotfix_default = {';
const markerCount = worker.split(marker).length - 1;
if (markerCount !== 1) throw new Error(`account helper marker: expected 1, found ${markerCount}`);
worker = worker.replace(marker, `${accountHelpers}\n\n${marker}`);

replaceExact(
  '    const path = url.pathname;\n\n    // LIVE_SESSION_AUTH_GATE_V1:',
  '    const path = url.pathname;\n\n    if (path === `${API_URL_PREFIX3}/account/profile`) {\n      return await handleAccountProfileSecureV1(request, env);\n    }\n    if (path === `${API_URL_PREFIX3}/account/change-password`) {\n      return await handleAccountChangePasswordSecureV1(request, env);\n    }\n\n    // LIVE_SESSION_AUTH_GATE_V1:',
  'account route insertion'
);

const corsBefore = '"Access-Control-Allow-Methods": "GET, POST, OPTIONS"';
const corsCount = worker.split(corsBefore).length - 1;
if (corsCount < 1) throw new Error('No CORS method headers found to add PATCH');
worker = worker.split(corsBefore).join('"Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"');

const plaintextRegistration = '      password_hash: password,\n';
const regCount = worker.split(plaintextRegistration).length - 1;
if (regCount !== 1) throw new Error(`plaintext registration: expected 1, found ${regCount}`);
worker = worker.replace(plaintextRegistration, '      password_hash: await accountHashPasswordV1(password),\n');

const legacyPatch = 'if (!existing.password_hash && payload?.password) patch.password_hash = String(payload.password);';
const legacyPatchCount = worker.split(legacyPatch).length - 1;
if (legacyPatchCount !== 1) throw new Error(`legacy password patch: expected 1, found ${legacyPatchCount}`);
worker = worker.replace(legacyPatch, 'if (!existing.password_hash && payload?.password) patch.password_hash = await accountHashPasswordV1(String(payload.password));');

const legacyInsert = 'password_hash: payload?.password ? String(payload.password) : null';
const legacyInsertCount = worker.split(legacyInsert).length - 1;
if (legacyInsertCount !== 1) throw new Error(`legacy password insert: expected 1, found ${legacyInsertCount}`);
worker = worker.replace(legacyInsert, 'password_hash: payload?.password ? await accountHashPasswordV1(String(payload.password)) : null');

replaceRegex(
  /async function passwordMatches\(storedPassword, plainPassword\) \{[\s\S]*?\n\}\n__name\(passwordMatches, "passwordMatches"\);/g,
  'async function passwordMatches(storedPassword, plainPassword) {\n  return (await accountVerifyPasswordV1(storedPassword, plainPassword)).ok;\n}\n__name(passwordMatches, "passwordMatches");',
  'passwordMatches hardening'
);
replaceRegex(
  /async function passwordMatches2\(storedPassword, plainPassword\) \{[\s\S]*?\n\}\n__name\(passwordMatches2, "passwordMatches"\);/g,
  'async function passwordMatches2(storedPassword, plainPassword) {\n  return (await accountVerifyPasswordV1(storedPassword, plainPassword)).ok;\n}\n__name(passwordMatches2, "passwordMatches");',
  'passwordMatches2 hardening'
);

const baseLoginNeedle = '  const okPassword = await passwordMatches(user.password_hash, password);\n  if (!okPassword) {';
const baseLoginCount = worker.split(baseLoginNeedle).length - 1;
if (baseLoginCount !== 1) throw new Error(`base login migration hook: expected 1, found ${baseLoginCount}`);
worker = worker.replace(
  baseLoginNeedle,
  '  const verifiedPassword = await accountVerifyPasswordV1(user.password_hash, password);\n  if (!verifiedPassword.ok) {'
);
const baseAfter = '  await ensureTrialIfNoSubscriptions(env, user.id, user.email, "trial_auto_login");';
const baseAfterCount = worker.split(baseAfter).length - 1;
if (baseAfterCount !== 1) throw new Error(`base login post-verify hook: expected 1, found ${baseAfterCount}`);
worker = worker.replace(
  baseAfter,
  '  if (verifiedPassword.needsUpgrade) {\n    await supabasePatch(env, "users", `id=eq.${encodeURIComponent(user.id)}`, { password_hash: await accountHashPasswordV1(password) }).catch(() => null);\n  }\n' + baseAfter
);

const hotfixNeedle = '    const okPassword = await passwordMatches2(user.password_hash, password);\n    if (okPassword) {';
const hotfixCount = worker.split(hotfixNeedle).length - 1;
if (hotfixCount !== 1) throw new Error(`hotfix login migration hook: expected 1, found ${hotfixCount}`);
worker = worker.replace(
  hotfixNeedle,
  '    const verifiedPassword = await accountVerifyPasswordV1(user.password_hash, password);\n    if (verifiedPassword.ok) {\n      if (verifiedPassword.needsUpgrade) {\n        await supabasePatch2(env, "users", `id=eq.${encodeURIComponent(user.id)}`, { password_hash: await accountHashPasswordV1(password) }).catch(() => null);\n      }'
);

fs.writeFileSync(workerPath, worker);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = (manifest.modules || []).find((module) => module.name === 'worker_hotfix.js');
if (!entry) throw new Error('worker_hotfix.js hash entry missing');
entry.module_sha256 = crypto.createHash('sha256').update(Buffer.from(worker)).digest('hex');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const indexPath = 'index.html';
let index = fs.readFileSync(indexPath, 'utf8');
const hotfixTag = '<script src="account_profile_hotfix.js?v=1"></script>';
const tagCount = index.split(hotfixTag).length - 1;
if (tagCount !== 1) throw new Error(`legacy account hotfix script tag: expected 1, found ${tagCount}`);
index = index.replace(hotfixTag, '');
fs.writeFileSync(indexPath, index);

console.log(`Account security Worker SHA-256: ${entry.module_sha256}`);

// Materializer trigger: rerun after fixing the semantic route contract.
