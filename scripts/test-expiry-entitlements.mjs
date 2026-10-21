import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('tmp/expiry-candidate/worker_hotfix.js', 'utf8');
function extractFn(name) {
  const from = worker.indexOf('function ' + name + '(');
  assert.ok(from >= 0, name + ' must be available in candidate');
  const marker = '\n__name(' + name + ',';
  const end = worker.indexOf(marker, from);
  assert.ok(end > from, 'expected bounded ' + name);
  return worker.slice(from, end);
}
const snippet = extractFn('isPlanActivo') + '\n' + extractFn('elegirSuscripcionVigente');
const functions = new Function('canonicalPlanCode','parseFechaFlexible',
  snippet + '\nreturn { isPlanActivo, elegirSuscripcionVigente };')(
    value => String(value || '').trim().toUpperCase(),
    value => value ? new Date(value) : null
  );
const now = Date.now();
const past = new Date(now - 86400000).toISOString();
const future = new Date(now + 86400000).toISOString();
const lifetime = new Date('2100-05-31T22:50:34Z').toISOString();
const row = (plan_code,status,end,source='mercadopago_checkout') => ({
  plan_code,status,source,
  trial_ends_at:plan_code==='TRIAL_7D'?end:null,
  current_period_ends_at:plan_code==='TRIAL_7D'?null:end
});
const cases = [
  ['trial expired',row('TRIAL_7D','ACTIVE',past),false],
  ['trial valid',row('TRIAL_7D','ACTIVE',future),true],
  ['paid expired',row('PLUS','ACTIVE',past),false],
  ['paid valid',row('PLUS','ACTIVE',future),true],
  ['regular paid without expiry',row('INSIGNE','ACTIVE',null),false],
  ['explicit administrator grant without expiry',row('INSIGNE','ACTIVE',null,'manual_admin_grant'),true],
  ['lifetime dated exception',row('INSIGNE','ACTIVE',lifetime),true],
  ['cancelled paid',row('PLUS','CANCELLED',future),false],
];
for(const [name,sub,expected] of cases) {
  const p={plan:{code:sub.plan_code},subscription:sub};
  assert.equal(functions.isPlanActivo(p),expected,name+' isPlanActivo');
  assert.equal(!!functions.elegirSuscripcionVigente([sub]),expected,name+' chooser');
}
assert.match(worker, /APD_EXPIRY_NOTICES_ENABLED/,'expiry email cron must default to opt-in');
assert.match(worker,/dedupe_key: expiryKey/,'email must be deduped by user and cycle');
assert.match(worker,/user\?\.es_admin/,'admin must be excluded from expiry mail');
assert.match(worker,/if \(handled >= 3\) break/,'mail cron must be rate limited');
assert.match(worker,/if \(elegirSuscripcionVigente\(rows\)\) continue/,'valid plans skipped from mail');
assert.match(worker,/access_active: isPlanActivo\(resolved\)/,'mi-plan exposes backend-authoritative entitlement');
console.log('Expiry candidate entitlement contract: OK ('+cases.length+' cases)');
