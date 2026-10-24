import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compareWorkerModules} from './audit-apd-worker-drift.mjs';

const production=fs.readFileSync('worker-live/worker_hotfix.js');
test('exact baseline produces no changed function declarations',()=>{
 const result=compareWorkerModules(production,production);
 assert.equal(result.exactCodeMatch,true);
 assert.deepEqual(result.functionsChanged,[]);
 assert.deepEqual(result.functionsMissing,[]);
 assert.equal(result.changedByteRegionBefore,0);
 assert.equal(result.changedByteRegionNow,0);
 assert.equal(result.telegramStatusUnsafeIdFallback,true);
 assert.equal(result.whatsappStatusUnsafeIdFallback,true);
});
test('Telegram/WhatsApp account-state changes are detected without echoing source',()=>{
 const str=production.toString('utf8');
 const old='if (!user && requestedUserId) user = await obtenerUsuario(env, requestedUserId)';
 const changed=str.replaceAll(old,'/* blocked unsafe userId fallback */');
 assert.notEqual(changed,str);
 const result=compareWorkerModules(production,Buffer.from(changed));
 assert.equal(result.exactCodeMatch,false);
 assert.ok(result.functionsChanged.includes('handleTelegramStatus'));
 assert.ok(result.functionsChanged.includes('handleWhatsAppStatus'));
 assert.equal(result.telegramStatusUnsafeIdFallback,false);
 assert.equal(result.whatsappStatusUnsafeIdFallback,false);
 assert.equal('remoteSource' in result,false);
 assert.equal('remoteHash' in result,false);
});
test('short damaged source cannot be reported equal or as complete Worker',()=>{
 const r=compareWorkerModules(production,Buffer.from('truncated Worker source'));
 assert.equal(r.exactCodeMatch,false);
 assert.ok(r.functionsMissing.includes('applyMercadoPagoPayment'));
 assert.ok(r.changedByteRegionBefore>0);
});
