// Authenticated channel status hardening candidate. No direct production changes.
// Preserve live-worker canonical capture and refuse stale/corrupted baselines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const source='worker-live/worker_hotfix.js';
const base=fs.readFileSync(source,'utf8');
const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
const captured=manifest.modules.find(m=>m.name==='worker_hotfix.js')?.sha256;
assert.ok(captured,'Missing canonical module hash');
assert.equal(crypto.createHash('sha256').update(base).digest('hex'),captured,
  'Source does not match live deployment snapshot');

const startNames=[
  'async function handleTelegramStatus(request, env) {',
  'async function handleWhatsAppStatus(request, env) {'
];
const oldAuth=[
  '  const authUser = await getSessionUserByBearer(env, request);',
  '  const requestedUserId = String(url.searchParams.get("user_id") || "").trim();',
  '  let user = authUser;',
  '  if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId);',
  '  if (!user?.id) {',
  '    return json2({ ok: false, error: "No autenticado" }, 401);',
  '  }',
  '  if (authUser?.id && requestedUserId && requestedUserId !== authUser.id && !authUser.es_admin) {',
  '    return json2({ ok: false, error: "No autorizado" }, 403);',
  '  }'
].join('\n');
const newAuth=[
  '  const authUser = await getSessionUserByBearer(env, request);',
  '  // Never use a client-provided user_id as proof of authentication.',
  '  if (!authUser?.id) return json2({ ok: false, error: "No autenticado" }, 401);',
  '  const requestedUserId = String(url.searchParams.get("user_id") || "").trim();',
  '  if (requestedUserId && requestedUserId !== authUser.id && !authUser.es_admin)',
  '    return json2({ ok: false, error: "No autorizado" }, 403);',
  '  const user = requestedUserId && requestedUserId !== authUser.id',
  '    ? await obtenerUsuario(env, requestedUserId)',
  '    : authUser;',
  '  if (!user?.id) return json2({ ok: false, error: "Usuario no encontrado" }, 404);'
].join('\n');
let candidate=base;
for (const name of startNames) {
  const start=candidate.indexOf(name);
  assert.ok(start>=0,'Missing '+name);
  const end=candidate.indexOf('\n__name(',start);
  assert.ok(end>start,'Missing handler end '+name);
  const fn=candidate.slice(start,end);
  assert.equal(fn.split(oldAuth).length,2,'Channel authorization anchor missing or duplicated: '+name);
  candidate=candidate.slice(0,start)+fn.replace(oldAuth,newAuth)+candidate.slice(end);
}
const sweepName='async function runWhatsAppAlertsSweep(env, options = {}) {';
const start=candidate.indexOf(sweepName),end=candidate.indexOf('\n__name(',start);
assert.ok(start>=0&&end>start,'Missing WhatsApp sweep');
const original=[
  '      if (!String(user?.celular || "").trim()) {',
  '        skippedCount++;',
  '        continue;',
  '      }'
].join('\n');
const check=[
  '      // Check paid entitlement before creating or transmitting any alert.',
  '      // Fail closed when subscription lookup is unavailable.',
  '      const resolvedPlanForWhatsApp = await resolverPlanUsuario(env, userId).catch(() => null);',
  '      if (!resolvedPlanForWhatsApp || !isPlanActivo(resolvedPlanForWhatsApp)) {',
  '        skippedCount++;',
  '        continue;',
  '      }',
  original
].join('\n');
const fn=candidate.slice(start,end);
assert.equal(fn.split(original).length,2,'Missing WhatsApp entitlement insertion anchor');
candidate=candidate.slice(0,start)+fn.replace(original,check)+candidate.slice(end);
const output='tmp/apd-private-channel-status-candidate/worker_hotfix.mjs';
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,candidate);
console.log('Built isolated channel security candidate. No accounts, notifications, or production worker changed.');
