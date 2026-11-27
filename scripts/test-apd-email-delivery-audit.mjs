import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {storedAbcOfferOpen,digestReservationConfirmed,stageEmailDeliveryAudit} from './apd-email-delivery-audit-stage.mjs';
const now=Date.parse('2026-11-27T16:30:00Z');
const raw={estado:'Publicada',finoferta:'2026-11-27T14:00:00Z'};
test('raw deadline survives repeated normalized layers; missing, conflicting and expired fail closed',()=>{
 let row=raw;for(let i=0;i<10;i++)row={raw:row,fecha_cierre:'27/11/2026 14:00',estado:'Publicada'};
 assert.equal(storedAbcOfferOpen({offer_payload:row},now),true);
 assert.equal(storedAbcOfferOpen({raw:row,estado:'Cerrada'},now),false);
 assert.equal(storedAbcOfferOpen({raw:row,finoferta:'2026-11-27T12:00:00Z'},now),false);
 assert.equal(storedAbcOfferOpen({estado:'Publicada',fecha_cierre:'27/11/2026 14:00'},now),false);
 assert.equal(storedAbcOfferOpen(row,now+30*60000),false);
 for(let i=0;i<30;i++)row={raw:row};
 assert.equal(storedAbcOfferOpen(row,now),false);
});
test('only a confirmed durable reservation with matching key and id permits send',()=>{
 const valid={ok:true,reserved:true,duplicate:false,id:123,dedupe_key:'slot:fixture'};
 assert.equal(digestReservationConfirmed('slot:fixture',valid),true);
 for(const id of ['123','9223372036854775807'])assert.equal(digestReservationConfirmed('slot:fixture',{...valid,id}),true);
 for(const id of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'fixture','0','9223372036854775808','12x'])assert.equal(digestReservationConfirmed('slot:fixture',{...valid,id}),false);
 for(const r of [null,{}, {...valid,id:null},{...valid,reserved:false},{...valid,duplicate:true},{...valid,dedupe_key:'other'}])assert.equal(digestReservationConfirmed('slot:fixture',r),false);
 assert.equal(digestReservationConfirmed('',valid),false);
});
test('stage exact worker with gates before actual provider call and syntax check',()=>{
 const src=readFileSync(new URL('../worker-live/worker_hotfix.js',import.meta.url),'utf8');
 const result=stageEmailDeliveryAudit(src);
 assert.equal(result.deployable,false);assert.equal(result.unrelatedBytesPreserved,true);
 const text=result.candidate;
 const start=text.indexOf('async function runEmailAlertsSweep('),end=text.indexOf('\n__name(runEmailAlertsSweep,',start);
 const sweep=text.slice(start,end),send=sweep.indexOf('send = await enviarMailBrevo(');
 assert.ok(send>0);
 for(const needle of ['missing_dedupe_key','!apdDigestReservationConfirmedAuditV1','deadline_reached_before_send'])assert.ok(sweep.indexOf(needle)>=0&&sweep.indexOf(needle)<send,needle);
 assert.ok(sweep.indexOf('deadline_reached_before_send')>sweep.indexOf('const html = buildDigestHtml'));
 // The Worker is an ES module; compile the exact isolated sweep, not a rewritten fixture.
 new vm.Script(sweep);
});

test('actual Worker reservation response matches confirmed bigint gate',async()=>{
 const src=readFileSync(new URL('../worker-live/worker_hotfix.js',import.meta.url),'utf8');
 const start=src.indexOf('async function reserveEmailDigestDeliveryLog('),end=src.indexOf('\n__name(reserveEmailDigestDeliveryLog,',start);
 assert.ok(start>=0&&end>start);
 let returned=[{id:123}],error=null;
 const c=vm.createContext({supabaseInsertReturning:async()=>{if(error)throw error;return returned;},isSupabaseDuplicateError:e=>e.code==='23505'});
 vm.runInContext(src.slice(start,end),c);
 const args={user:{id:'fixture'},destination:'fixture@example.invalid',payload:{},dedupeKey:'slot:fixture'};
 assert.equal(digestReservationConfirmed(args.dedupeKey,await c.reserveEmailDigestDeliveryLog({},args)),true);
 returned=[];assert.equal(digestReservationConfirmed(args.dedupeKey,await c.reserveEmailDigestDeliveryLog({},args)),false);
 error={code:'23505'};const duplicate=await c.reserveEmailDigestDeliveryLog({},args);assert.equal(duplicate.duplicate,true);assert.equal(digestReservationConfirmed(args.dedupeKey,duplicate),false);
});
