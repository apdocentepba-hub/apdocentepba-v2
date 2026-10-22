// Future WhatsApp-only safety candidate. This does NOT deploy or mutate worker-live.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const sourcePath='worker-live/worker_hotfix.js';
const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
const source=fs.readFileSync(sourcePath,'utf8');
const expected=manifest.modules.find(m=>m.name==='worker_hotfix.js');
assert.ok(expected, 'Canonical module missing');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'), expected.sha256,
  'Live Worker source differs from verified capture. Stop.');
assert.ok(!source.includes('const resolvedPlanForWhatsApp = await resolverPlanUsuario(env, userId)'),
  'Do not patch WhatsApp twice');

const anchor=[
'      if (!String(user?.celular || "").trim()) {',
'        skippedCount++;',
'        continue;',
'      }'
].join('\n');
const replacement=[
'      // Fail closed: WhatsApp alerts require a currently valid plan, just like email.',
'      const resolvedPlanForWhatsApp = await resolverPlanUsuario(env, userId).catch(() => null);',
'      if (!resolvedPlanForWhatsApp || !isPlanActivo(resolvedPlanForWhatsApp)) {',
'        skippedCount++;',
'        continue;',
'      }',
anchor
].join('\n');
const start=source.indexOf('async function runWhatsAppAlertsSweep(env, options = {}) {');
const end=source.indexOf('__name(runWhatsAppAlertsSweep,',start);
assert.ok(start>=0 && end>start, 'WhatsApp sweep function missing');
const section=source.slice(start,end);
assert.equal(section.split(anchor).length,2,'Expected exactly one sweep insertion point');
const candidate=source.slice(0,start)+section.replace(anchor,replacement)+source.slice(end);
const output='tmp/apd-whatsapp-entitlement-candidate/worker_hotfix.mjs';
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,candidate,'utf8');
console.log('WhatsApp entitlement candidate generated without touching the canonical Worker.');
