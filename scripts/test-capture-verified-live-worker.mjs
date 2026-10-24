import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {verifiedCapture} from './capture-verified-live-worker.mjs';
import {hardenMessagingStatus} from './create-messaging-status-auth-candidate.mjs';

const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const currentManifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
let historical=fs.readFileSync('worker-live/worker_hotfix.js','utf8');
const vulnerable='  let user = authUser;\n  if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId);\n  if (!user?.id) {';
const fixed='  const user = authUser;\n  if (!user?.id) {';
// Make the test fixtures reproducible before and after the real snapshot is updated.
for(const name of ['handleTelegramStatus','handleWhatsAppStatus']){
  const start=historical.indexOf('async function '+name+'(request, env) {');
  const end=historical.indexOf('\n__name('+name+',',start);
  assert.ok(start>=0&&end>start,'Status function must exist: '+name);
  const body=historical.slice(start,end);
  const legacy=body.includes(vulnerable)?body:body.replace(fixed,vulnerable);
  assert.ok(legacy.includes(vulnerable),'Required legacy test case missing: '+name);
  historical=historical.slice(0,start)+legacy+historical.slice(end);
}
const oldBytes=Buffer.from(historical);
const manifest={
  ...currentManifest,
  version_id:'synthetic-old-production',
  modules:[{name:'worker_hotfix.js',sha256:sha256(oldBytes),bytes:oldBytes.length}]
};
let source=hardenMessagingStatus(historical);
for(const name of ['handleTelegramWebhook','handleWhatsAppWebhook','handleMercadoPagoWebhook','applyMercadoPagoPayment']){
 const marker='async function '+name+'(';
 assert.equal(source.split(marker).length,2,'Synthetic test assumes one declaration of '+name);
 const i=source.indexOf('{',source.indexOf(marker));
 assert.ok(i>=0);
 source=source.slice(0,i+1)+' /* synthetic historical release change */'+source.slice(i+1);
}
const deployedBytes=Buffer.from(source);
const approvedFingerprint={sha256:sha256(deployedBytes),bytes:deployedBytes.length};
const deployment={deployments:[{versions:[{version_id:'synthetic-approved',percentage:100}]}]};
const candidate={id:'synthetic-approved',annotations:{'workers/tag':'apd-msg-auth-2e605fd5'}};
const detail={
 modules:[{name:'worker_hotfix.js',content_base64:deployedBytes.toString('base64')}],
 bindings:manifest.bindings.map(x=>({...x}))
};
function capture(d=deployment,c=candidate,version=detail,baseline=oldBytes,pinned=approvedFingerprint){
 return verifiedCapture(manifest,baseline,d,c,version,new Date('2026-10-24T16:30:00Z'),pinned);
}
test('accept only the immutable attested release and never save binding values',()=>{
 const result=capture();
 assert.equal(result.manifest.version_id,'synthetic-approved');
 assert.deepEqual(result.bytes,deployedBytes);
 assert.equal(result.manifest.modules[0].bytes,deployedBytes.length);
 assert.equal(result.manifest.bindings.length,manifest.bindings.length);
 assert.equal(result.manifest.captured_at,'2026-10-24T16:30:00.000Z');
 assert.ok(result.manifest.bindings.every(b=>!('value' in b)&&!('text' in b)&&!('content' in b)));
 assert.deepEqual(result.manifest.schedules,manifest.schedules);
});
test('reject a different release candidate or traffic split',()=>{
 assert.throws(()=>capture(deployment,{...candidate,id:'different'}),/exact approved/);
 assert.throws(()=>capture(deployment,{...candidate,annotations:{'workers/tag':'wrong'}}),/exact approved/);
 assert.throws(()=>capture({deployments:[{versions:[{version_id:'synthetic-approved',percentage:50},{version_id:'other',percentage:50}]}]}),/multiple or unknown/);
});
test('any unapproved source byte fails the independently pinned fingerprint',()=>{
 const changed=structuredClone(detail);
 changed.modules[0].content_base64=Buffer.from(source+'// unrelated change').toString('base64');
 assert.throws(()=>capture(deployment,candidate,changed),/immutable release fingerprint/);
 const sameSize=structuredClone(detail);
 const mutated=Buffer.from(deployedBytes);mutated[210]^=1;
 sameSize.modules[0].content_base64=mutated.toString('base64');
 assert.throws(()=>capture(deployment,candidate,sameSize),/immutable release fingerprint/);
});
test('reject deleted secret and changed storage binding',()=>{
 const gone=structuredClone(detail);
 gone.bindings=gone.bindings.filter(x=>x.name!=='MERCADOPAGO_WEBHOOK_SECRET');
 assert.throws(()=>capture(deployment,candidate,gone),/Bindings shape changed/);
 const changed=structuredClone(detail);
 changed.bindings.find(x=>x.type==='kv_namespace').namespace_id='invalid-kv';
 assert.throws(()=>capture(deployment,candidate,changed),/KV binding changed/);
});
test('refuse credential embedded in a supposedly attested Worker',()=>{
 const changed=structuredClone(detail);
 const text=Buffer.from(source+'\n// 1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
 changed.modules[0].content_base64=text.toString('base64');
 const independentlyAttested={sha256:sha256(text),bytes:text.length};
 assert.throws(()=>capture(deployment,candidate,changed,oldBytes,independentlyAttested),/Potential embedded credential/);
});
test('preexisting historical snapshot integrity is required',()=>{
 const corrupted=Buffer.from(oldBytes);corrupted[10]^=1;
 assert.throws(()=>capture(deployment,candidate,detail,corrupted),/integrity check/);
});
test('release fingerprint is pinned and capture never uploads production code',()=>{
 const code=fs.readFileSync('scripts/capture-verified-live-worker.mjs','utf8');
 assert.match(code,/335a62e1ab6127cf50b38000845766c7d7d5e2c314e2e002e996e41ace146a9c/);
 assert.match(code,/bytes:637281/);
 assert.doesNotMatch(code,/['"]POST['"]|wrangler|promote\(/);
 assert.match(code,/APD_CANONICAL_CAPTURE_VERIFIED/);
 assert.match(code,/\/api\/telegram\/status\?user_id=/);
 assert.match(code,/\/api\/whatsapp\/status\?user_id=/);
});
