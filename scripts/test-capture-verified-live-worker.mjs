import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifiedCapture} from './capture-verified-live-worker.mjs';
import {hardenMessagingStatus} from './create-messaging-status-auth-candidate.mjs';

const manifest=JSON.parse(fs.readFileSync('worker-live/manifest.json','utf8'));
const oldBytes=fs.readFileSync('worker-live/worker_hotfix.js');
let source=hardenMessagingStatus(oldBytes.toString('utf8'));
for(const name of ['handleTelegramWebhook','handleWhatsAppWebhook','handleMercadoPagoWebhook','applyMercadoPagoPayment']){
 const marker='async function '+name+'(';
 assert.equal(source.split(marker).length,2,'Synthetic test assumes exactly one declaration of '+name);
 const i=source.indexOf('{',source.indexOf(marker));
 assert.ok(i>=0);
 source=source.slice(0,i+1)+' /* synthetic previous release change */'+source.slice(i+1);
}
const deployedBytes=Buffer.from(source);
const deployment={deployments:[{versions:[{version_id:'synthetic-approved',percentage:100}]}]};
const candidate={id:'synthetic-approved',annotations:{'workers/tag':'apd-msg-auth-2e605fd5'}};
const detail={
 modules:[{name:'worker_hotfix.js',content_base64:deployedBytes.toString('base64')}],
 bindings:manifest.bindings.map(x=>({...x}))
};
function capture(d=deployment,c=candidate,version=detail,baseline=oldBytes){
 return verifiedCapture(manifest,baseline,d,c,version,new Date('2026-10-24T16:30:00Z'));
}
test('accept verified active candidate only and omit all binding values',()=>{
 const result=capture();
 assert.equal(result.manifest.version_id,'synthetic-approved');
 assert.deepEqual(result.bytes,deployedBytes);
 assert.equal(result.manifest.modules[0].bytes,deployedBytes.length);
 assert.equal(result.manifest.bindings.length,manifest.bindings.length);
 assert.equal(result.manifest.captured_at,'2026-10-24T16:30:00.000Z');
 assert.ok(result.manifest.bindings.every(b=>!('value' in b)&&!('text' in b)&&!('content' in b)));
 assert.deepEqual(result.manifest.schedules,manifest.schedules);
});
test('reject unknown candidate or mixed live traffic',()=>{
 assert.throws(()=>capture(deployment,{...candidate,id:'different'}),/exact approved/);
 assert.throws(()=>capture(deployment,{...candidate,annotations:{'workers/tag':'wrong'}}),/exact approved/);
 assert.throws(()=>capture({deployments:[{versions:[{version_id:'synthetic-approved',percentage:50},{version_id:'other',percentage:50}]}]}),/multiple or unknown/);
});
test('reject any changed payment code outside previously audited six functions',()=>{
 const bad=structuredClone(detail);
 bad.modules[0].content_base64=Buffer.from(source+'// unrelated change').toString('base64');
 assert.throws(()=>capture(deployment,candidate,bad),/unaudited changes|previously audited/);
});
test('reject missing secret, binding change or modified KV namespace',()=>{
 const gone=structuredClone(detail);
 gone.bindings=gone.bindings.filter(x=>x.name!=='MERCADOPAGO_WEBHOOK_SECRET');
 assert.throws(()=>capture(deployment,candidate,gone),/Bindings shape changed/);
 const changed=structuredClone(detail);
 changed.bindings.find(x=>x.type==='kv_namespace').namespace_id='invalid-kv';
 assert.throws(()=>capture(deployment,candidate,changed),/KV binding changed/);
});
test('refuse live compiled files with plaintext provider credentials',()=>{
 const compromised=structuredClone(detail);
 compromised.modules[0].content_base64=Buffer.from(source+'\n// 1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz').toString('base64');
 assert.throws(()=>capture(deployment,candidate,compromised),/Potential embedded credential/);
});
test('preexisting snapshot is integrity checked before any capture',()=>{
 const corrupted=Buffer.from(oldBytes);corrupted[10]^=1;
 assert.throws(()=>capture(deployment,candidate,detail,corrupted),/integrity check/);
});
test('capture procedure does not deploy a Worker',()=>{
 const code=fs.readFileSync('scripts/capture-verified-live-worker.mjs','utf8');
 assert.doesNotMatch(code,/['"]POST['"]|wrangler|promote\(/);
 assert.match(code,/APD_CANONICAL_CAPTURE_VERIFIED/);
 assert.match(code,/\/api\/telegram\/status\?user_id=/);
 assert.match(code,/\/api\/whatsapp\/status\?user_id=/);
});
