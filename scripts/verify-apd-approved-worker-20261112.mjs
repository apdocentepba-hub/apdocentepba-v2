/**
 * Verifies Cloudflare's active Worker bundle against independently attested
 * production bytes, without treating the outdated public source as deployable.
 * Read-only. Fails closed on version/module/binding/code drift.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'..');
const pinned=JSON.parse(fs.readFileSync(path.join(repo,'docs/APD_WORKER_APPROVED_LIVE_BASELINE_20261112.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');

export function verifyKnownApprovedWorker(capture,canonicalManifest,moduleBytes,expected=pinned){
 assert.equal(capture.version_id,expected.active_version,'Unexpected Cloudflare deployed version');
 assert.equal(capture.worker_name,expected.worker,'Unexpected Cloudflare Worker');
 assert.equal(capture.main_module,expected.module.name,'Unexpected active entrypoint');
 assert.equal(capture.modules?.length,1,'Unexpected module count');
 const module=capture.modules[0];
 assert.equal(module.name,expected.module.name,'Module name differs from approved release');
 assert.equal(module.module_sha256||module.sha256,expected.module.sha256,'Metadata module hash drift');
 assert.equal(moduleBytes.length,expected.module.bytes,'Worker bytes differ from verified release');
 assert.equal(hash(moduleBytes),expected.module.sha256,'Code SHA256 differs from verified release');
 assert.equal(capture.bindings?.length,expected.expected_binding_count,'Lost/added Worker bindings');
 assert.equal(canonicalManifest.bindings?.length,expected.expected_binding_count,'Reference binding count changed');
 const current=new Map(capture.bindings.map(x=>[x.name+':'+x.type,x]));
 assert.equal(current.size,expected.expected_binding_count,'Duplicate binding name/type');
 for(const prev of canonicalManifest.bindings){
  const actual=current.get(prev.name+':'+prev.type);
  assert.ok(actual,'Canonical binding removed or retyped: '+prev.name);
  if(prev.namespace_id)assert.equal(actual.namespace_id,prev.namespace_id,'KV namespace drift: '+prev.name);
 }
 for(const b of capture.bindings){
  assert.ok(b.name&&b.type,'Invalid binding declaration');
  assert.equal(Object.hasOwn(b,'value'),false,'SECRET LEAK: binding value in artifact');
  assert.equal(Object.hasOwn(b,'text'),false,'SECRET LEAK: binding text in artifact');
  assert.equal(Object.hasOwn(b,'content'),false,'SECRET LEAK: binding contents in artifact');
 }
 const required=['getSessionUserByBearer','handleAccountHomeSecureV1',
  'handleAccountProfileSecureV1','handleAccountPreferencesSecureV1'];
 const source=moduleBytes.toString('utf8');
 for(const key of required)assert.ok(source.includes(key),'Auth/home implementation missing '+key);
 return {approved:true,version:expected.active_version,sha256:expected.module.sha256,
  module:expected.module.name,bindings:current.size};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const bundleDir=process.argv[2]||'tmp/live-worker-contract-smoke';
 const canonicalDir=process.argv[3]||'worker-live';
 const live=JSON.parse(fs.readFileSync(path.join(bundleDir,'manifest.json'),'utf8'));
 const original=JSON.parse(fs.readFileSync(path.join(canonicalDir,'manifest.json'),'utf8'));
 const moduleName=pinned.module.name;
 if(moduleName.includes('/')||moduleName.includes('..'))throw Error('Unsafe module path in pinned metadata');
 const bytes=fs.readFileSync(path.join(bundleDir,moduleName));
 const result=verifyKnownApprovedWorker(live,original,bytes);
 console.log('APD_APPROVED_LIVE_VERSION_VERIFIED '+JSON.stringify({
  approved:result.approved,version:result.version,module:result.module,
  bindings:result.bindings,sha256_prefix:result.sha256.slice(0,12),
  canonical_source_still_old:true,
  scope:'metadata_and_hash_only'
 }));
}
