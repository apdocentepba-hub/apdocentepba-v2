import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const smoke=readFileSync(new URL('./apd-public-deployment-smoke.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/apd-public-deployment-smoke.yml',import.meta.url),'utf8');

test('post-deploy smoke covers the complete Insigne static dependency graph',()=>{
 const block=smoke.match(/const FILES = Object\.freeze\(\[([\s\S]*?)\]\);/);
 assert.ok(block,'Smoke asset list must remain explicit and auditable');
 const files=[...block[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
 assert.equal(new Set(files).size,files.length,'No duplicate assets');
 for(const path of [
  'index.html','apd_comparador_panel.mjs','apd_comparador_panel.css',
  'account_home_reference_patch.js','apd_offer_school_map_overlay.mjs',
  'scripts/apd-comparador-criterios.mjs',
  'scripts/apd-comparador-datos-evaluacion.mjs',
  'scripts/apd-mi-jornada-comparador.mjs','scripts/apd-home-georef.mjs',
  'scripts/apd-mi-jornada-ui.mjs','scripts/apd-account-home-write-policy.mjs',
  'scripts/apd-insigne-planner-entitlement.mjs',
  'scripts/apd-school-geodistance.mjs','scripts/apd-mobility-ui.mjs',
  'scripts/apd-multimodal-transport.mjs','scripts/apd-amba-bus-routes.mjs'
 ])assert.ok(files.includes(path),'Missing post-deploy asset: '+path);
 assert.equal(files.length,16);
});

test('production smoke is anonymous, bounded and read-only',()=>{
 assert.match(smoke,/credentials:\s*'omit'/);
 assert.match(smoke,/redirect:\s*'error'/);
 assert.match(smoke,/AbortSignal\.timeout\(15000\)/);
 assert.match(smoke,/MAX_BYTES = 2_000_000/);
 assert.match(smoke,/unauthenticated_static_assets_only/);
 assert.doesNotMatch(smoke,/Authorization|Bearer\s|localStorage|sessionStorage|navigator\.geolocation/);
});

test('pull requests run only the offline contract; live smoke is manual after deployment',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/pull_request:/);
 assert.match(workflow,/test-apd-public-deployment-smoke\.mjs/);
 assert.match(workflow,/public-smoke:[\s\S]*?if:\s+github\.event_name == 'workflow_dispatch'/);
 assert.match(workflow,/node --test scripts\/test-apd-public-deployment-smoke\.mjs/);
});
