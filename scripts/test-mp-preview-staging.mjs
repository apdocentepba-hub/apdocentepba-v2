import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {stageConfig,confirmSafeBaseline} from './stage-mp-signed-webhook.mjs';

const original=fs.readFileSync('wrangler.toml','utf8');
const bytes=Buffer.from('synthetic-worker');
const sha=crypto.createHash('sha256').update(bytes).digest('hex');
const manifest={
  worker_name:'ancient-wildflower-cd37',
  version_id:'good-version',
  main_module:'worker_hotfix.js',
  modules:[{name:'worker_hotfix.js',sha256:sha,bytes:bytes.length}],
  bindings:[
    {name:'MERCADOPAGO_ACCESS_TOKEN',type:'secret_text'},
    {name:'MERCADOPAGO_WEBHOOK_SECRET',type:'secret_text'},
    {name:'MERCADOPAGO_WEBHOOK_URL',type:'plain_text'},
    {name:'EMAIL_SWEEP_STATE',type:'kv_namespace',namespace_id:'kv-correct'}
  ]
};
const deployment={deployments:[{versions:[{percentage:100,version_id:'good-version'}]}]};
const detail={
  modules:[{name:'worker_hotfix.js',content_base64:bytes.toString('base64')}],
  bindings:manifest.bindings
};
test('generates staging-only Wrangler config and preserves keep_vars',()=>{
  const cfg=stageConfig(original);
  assert.match(cfg,/main = "tmp\/mp-validation-candidate\/worker_hotfix.js"/);
  assert.match(cfg,/keep_vars = true/);
  assert.doesNotMatch(cfg,/main = "worker-live\/worker_hotfix.js"/);
  assert.match(cfg,/PRODUCTION_SOURCE_GUARD_V1/);
  assert.throws(()=>stageConfig(original+'\n[vars]\nTEST = "true"\n'),/Unexpected Wrangler/);
});
test('requires exactly the current Cloudflare version and valid webhook secret binding',()=>{
  assert.equal(confirmSafeBaseline(manifest,deployment,detail).length,manifest.bindings.length);
  assert.throws(()=>confirmSafeBaseline(manifest,{deployments:[{versions:[{percentage:100,version_id:'other'}]}]},detail),/Production version changed/);
  const noSecret={...detail,bindings:detail.bindings.filter(x=>x.name!=='MERCADOPAGO_WEBHOOK_SECRET')};
  assert.throws(()=>confirmSafeBaseline(manifest,deployment,noSecret),/binding disappeared|Webhook secret/);
});
test('refuses to upload when Worker module content changed',()=>{
  const bad={...detail,modules:[{name:'worker_hotfix.js',content_base64:Buffer.from('different').toString('base64')}]};
  assert.throws(()=>confirmSafeBaseline(manifest,deployment,bad),/code differs/);
});
test('staging code has no production promotion call or payment submission',()=>{
  const code=fs.readFileSync('scripts/stage-mp-signed-webhook.mjs','utf8');
  assert.match(code,/['"]versions['"],['"]upload['"]/);
  assert.doesNotMatch(code,/\bpromote\s*\(/);
  assert.doesNotMatch(code,/['"]wrangler['"],['"]deploy['"]/);
  assert.doesNotMatch(code,/['"]versions['"],['"]deploy['"]/);
  assert.doesNotMatch(code,/\/v1\/payments\//);
  assert.match(code,/if\(preview\)/);
  assert.match(code,/Unsigned webhook rejected/);
});
