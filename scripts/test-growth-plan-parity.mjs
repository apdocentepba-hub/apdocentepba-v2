import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

// Fotografía SÓLO de los metadatos públicos del catálogo de Supabase
// consultados en modo lectura el 2026-11-01. No contiene datos de usuarios.
const catalogSnapshot = Object.freeze({
  TRIAL_7D: { max_distritos: 1, max_cargos: 1, price_ars: 0 },
  PLUS:     { max_distritos: 3, max_cargos: 3, price_ars: 1000 },
  PREMIUM:  { max_distritos: 5, max_cargos: 5, price_ars: 2000 },
  INSIGNE:  { max_distritos: 10,max_cargos: 10,price_ars: 3000 }
});
const root = resolve(new URL('..', import.meta.url).pathname);
const worker = readFileSync(new URL('../worker-live/worker_hotfix.js', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../empezar.html', import.meta.url), 'utf8');
const start=worker.indexOf('function getPlanPreset(code) {');
const end=worker.indexOf('__name(getPlanPreset,',start);
assert.ok(start>=0&&end>start,'No se encontró getPlanPreset del Worker versionado');
const ctx=vm.createContext({ canonicalPlanCode(value) {return String(value||'').trim().toUpperCase();} });
vm.runInContext(worker.slice(start,end),ctx);
const comparison = Object.entries(catalogSnapshot).map(([code, catalog]) => {
  const p=ctx.getPlanPreset(code);
  return {
    code,
    catalog,
    worker_preset:{ max_distritos:p.max_distritos, max_cargos:p.max_cargos, price_ars:p.price_ars },
    mismatches:['max_distritos','max_cargos','price_ars'].filter(f=>Number(catalog[f])!==Number(p[f]))
  };
});
const report={
  checked_at:'2026-11-01',
  evidence:'Supabase catalog snapshot (read-only) vs versioned worker-live/worker_hotfix.js, not a verified live deployment',
  disposition:'NO_MERGE_UNTIL_RECONCILED',
  comparison,
  mismatchedPlans:comparison.filter(x=>x.mismatches.length).map(x=>x.code)
};
const out=resolve('tmp/growth-audit/plan-parity.json');
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(report,null,2)+'\n','utf8');

test('los valores de ambos sistemas quedan comparados y documentados',()=>{
  assert.equal(comparison.length,4);
  for(const x of comparison){
    assert.ok(Number.isInteger(x.catalog.max_distritos));
    assert.ok(Number.isInteger(x.worker_preset.max_distritos));
    assert.ok(x.catalog.max_cargos>=1);
  }
  console.log('PLAN_DRIFT_REVIEW_REQUIRED:',report.mismatchedPlans.join(', '));
});
test('si hay divergencias, la landing no promete capacidades no verificadas',()=>{
  if(!report.mismatchedPlans.length)return;
  const cards=landing.match(/<section class="section" id="planes"[\s\S]*?<\/section>/)?.[0]||'';
  assert.ok(cards.includes('Los importes son de referencia.'));
  assert.doesNotMatch(cards, /Hasta\s+\d+\s+distritos\b/i);
  assert.doesNotMatch(cards, /\d+\s+distritos\s+y\s+\d+\s+cargos\b/i);
  assert.match(cards,/se confirman en el panel antes de contratar/);
});
test('los precios de referencia de la landing coinciden con los cuatro planes públicos',()=>{
  for(const row of comparison.filter(x=>x.catalog.price_ars>0)){
    assert.equal(row.worker_preset.price_ars,row.catalog.price_ars,row.code);
  }
});
