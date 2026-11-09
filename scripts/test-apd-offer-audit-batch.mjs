import test from 'node:test';
import assert from 'node:assert/strict';
import {compactCaptureFromPages} from './apd-offer-compact-capture.mjs';
import {prepareOfferAuditBatch} from './apd-offer-audit-batch.mjs';

const source={source_offer_key:'D_1',estado:'Publicada',finoferta:'2026-11-12T07:30:00Z',
 turno:'Mañana',jornada:'JS',hsmodulos:'4',distrito:'AVELLANEDA',escuela:'EEST 6'};
const snapshot=(rows,capturedAt='2026-11-09T09:00:00Z',scope='AVELLANEDA')=>
 compactCaptureFromPages({scope,capturedAt,
  pages:[{offset:0,sourceTotal:rows.length,rows}]});
const nowMs=Date.parse('2026-11-09T10:05:00Z');

test('audit-only batch includes verified shifts and explicit terminal states, never sends',()=>{
 const other={...source,source_offer_key:'D_2'};
 const previous=snapshot([source,other]);
 const current=snapshot([{...source,turno:'Tarde'},{...other,estado:'Anulada'}],
  '2026-11-09T10:00:00Z');
 const batch=prepareOfferAuditBatch(previous,current,{nowMs});
 assert.equal(batch.verified,true);
 assert.deepEqual(batch.events.map(e=>e.type).sort(),
  ['offer_modified','official_state_changed']);
 assert.equal(batch.events[0].event_key.length,64);
 assert.equal(batch.events.every(e=>
  !Object.hasOwn(e,'push_body')&&!Object.hasOwn(e,'recipient')&&
  !Object.hasOwn(e,'observed_at')),true);
 assert.equal(batch.events.find(e=>e.type==='offer_modified').field,'turno');
 assert.equal(batch.events.find(e=>e.type==='official_state_changed').after,'Anulada');
});

test('expired or incomplete captures produce no audit candidates',()=>{
 const p=snapshot([source]);
 assert.equal(prepareOfferAuditBatch(p,snapshot([{...source,turno:'Tarde'}],
  '2026-11-09T10:00:00Z'),{nowMs:Date.parse('2026-11-11T10:00:00Z')}).verified,false);
 const incomplete=snapshot([{...source,distrito:'QUILMES'}]);
 assert.equal(incomplete.complete,false);
 const b=prepareOfferAuditBatch(incomplete,p,{nowMs});
 assert.equal(b.verified,false);
 assert.deepEqual(b.events,[]);
});
test('no closure from disappearance, no reminder enqueue and no duplicate key',()=>{
 const p=snapshot([source,{...source,source_offer_key:'D_2'}]);
 const c=snapshot([{...source}], '2026-11-09T10:00:00Z');
 const b=prepareOfferAuditBatch(p,c,{nowMs});
 assert.equal(b.verified,true);
 assert.deepEqual(b.events,[]);
});
test('batch does not create network, messaging or persistence dependencies',async()=>{
 const fs=await import('node:fs');
 const content=fs.readFileSync(new URL('./apd-offer-audit-batch.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(content,/\bfetch\s*\(|XMLHttpRequest|supabase|service_role|Authorization|localStorage|WebSocket|telegram|whatsapp|gmail|resend|twilio/i);
 assert.doesNotMatch(content,/send|publish|dispatch|notify|email/i);
});
