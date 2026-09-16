import fs from 'node:fs';

const path = 'worker-live/worker_hotfix.js';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(label, from, to) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label}: source pattern not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: source pattern is not unique`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  'PBKDF2 iteration ceiling',
  'const ACCOUNT_PBKDF2_ITERATIONS_V1 = 210000;',
  'const ACCOUNT_PBKDF2_ITERATIONS_V1 = 100000;'
);

replaceOnce(
  'PBKDF2 verifier runtime guard',
  `    if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000 || !salt || !expected) {\n      return { ok: false, needsUpgrade: false };\n    }\n    try {\n      const actual = await accountPbkdf2HexV1(plain, salt, iterations);`,
  `    if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000 || !salt || !expected) {\n      return { ok: false, needsUpgrade: false };\n    }\n    if (iterations > ACCOUNT_PBKDF2_ITERATIONS_V1) {\n      return { ok: false, needsUpgrade: false, unsupportedPbkdf2: true };\n    }\n    try {\n      const actual = await accountPbkdf2HexV1(plain, salt, iterations);`
);

const loginStart = source.indexOf('async function handleLoginHotfix(request, env)');
const googleStart = source.indexOf('async function handleGoogleAuthHotfix(request, env)', loginStart);
if (loginStart < 0 || googleStart <= loginStart) throw new Error('login handler bounds not found');

const loginBody = source.slice(loginStart, googleStart);
const migrationAnchor = '    if (!user?.id) return json2({ ok: false, message: "No se pudo migrar la cuenta existente" }, 500);';
if (!loginBody.includes(migrationAnchor)) throw new Error('legacy migration anchor not found inside password login handler');
if (loginBody.includes('password_hash: await accountHashPasswordV1(password)')) throw new Error('legacy migration rehash already present unexpectedly');

const absoluteAnchor = loginStart + loginBody.indexOf(migrationAnchor) + migrationAnchor.length;
const migrationPatch = `\n    await supabasePatch(env, "users", \`id=eq.\${encodeURIComponent(user.id)}\`, {\n      password_hash: await accountHashPasswordV1(password),\n      activo: true\n    }).catch(() => null);`;
source = source.slice(0, absoluteAnchor) + migrationPatch + source.slice(absoluteAnchor);

fs.writeFileSync(path, source);
console.log('PBKDF2 runtime fix applied to canonical Worker');
