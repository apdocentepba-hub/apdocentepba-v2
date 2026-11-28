import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectActiveComposition,verifyRouteInventory,verifyTemporaryRecovery} from './apd-worker-active-preflight.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(readFileSync('worker-live/manifest.json','utf8'));
const source=readFileSync('worker-live/worker_hotfix.js','utf8');
const routes=['/account/profile','/account/preferences','/account/marketing-preferences','/account/schedule','/account/application-diary','/account/favorites','/mi-plan','/mis-alertas','/mercadopago/create-checkout-link'];
const fixtureSource=source+'\n// fixture route inventory: '+routes.join(' ')+'\n';
const compose=s=>{const candidate=s+'\n// fixture /account/career\n';return {candidate,sourceSha256:sha(s),candidateSha256:sha(candidate),missing:[],approvedForDeploy:false};};
function fixture({drift=false,removeBinding=false,missingRoutes=false}={}){
 let reads=0;const calls=[];const bytes=Buffer.from(missingRoutes?source:fixtureSource);
 const version='fixture-version';const bindings=manifest.bindings.map(b=>({...b}));
 if(removeBinding)bindings.pop();
 const get=async endpoint=>{
  calls.push(endpoint);
  if(endpoint==='/accounts?per_page=50')return [{id:'fixture'}];
  if(endpoint.endsWith('/deployments'))return {deployments:[{versions:[{version_id:drift&&reads++>0?'changed':version,percentage:100}]}]};
  if(endpoint.endsWith('/schedules'))return manifest.schedules;
  if(endpoint.endsWith('/versions/'+version+'?include=modules'))return {id:version,main_module:'worker_hotfix.js',modules:[{name:'worker_hotfix.js',content_base64:bytes.toString('base64')}],bindings};
  throw Error('Unexpected GET');
 };
 return {get,calls,manifest,compose};
}
test('historical snapshot lacks required routes and cannot be certified',()=>{
 assert.throws(()=>verifyRouteInventory(source,source+'\n// /account/career'),/inventory drift/);
 assert.throws(()=>verifyRouteInventory(fixtureSource,fixtureSource.replaceAll('/account/favorites','/removed')+'\n// /account/career'),/inventory drift/);
});
test('private temporary restore checks actual original bytes, never claims remote rollback',()=>{
 const bytes=Buffer.from(source);const report=verifyTemporaryRecovery(bytes,sha(bytes));
 assert.deepEqual(report,{temporaryReadback:true,localRestore:true,persistentBackup:false,remoteRollbackTested:false});
 assert.throws(()=>verifyTemporaryRecovery(bytes,'0'.repeat(64)));
});
test('fixture observation pins version, routes, bindings, crons and recovery; no source or secrets exported',async()=>{
 const f=fixture();const r=await inspectActiveComposition(f);
 assert.equal(r.routeInventory,9);assert.equal(r.version,r.rollbackVersion);
 assert.equal(r.writes,0);assert.equal(r.approvedForDeploy,false);assert.equal(r.sourceExported,false);
 assert.equal(r.persistentBackup,false);assert.equal(f.calls.filter(c=>c.endsWith('/deployments')).length,2);
 assert.equal(f.calls.filter(c=>c.endsWith('/schedules')).length,2);
 assert.equal(Object.hasOwn(r,'candidate'),false);assert.equal(Object.hasOwn(r,'source'),false);
});
test('drift and missing active routes block the operator preflight',async()=>{
 for(const options of [{drift:true},{removeBinding:true},{missingRoutes:true}])await assert.rejects(inspectActiveComposition(fixture(options)));
});
