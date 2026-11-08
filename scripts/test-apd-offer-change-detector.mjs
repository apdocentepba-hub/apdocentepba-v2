import test from 'node:test';
import assert from 'node:assert/strict';
import {detectOfferUpdates,parseVerifiedClosingTime} from './apd-offer-change-detector.mjs';

const A={source_offer_key:'D_8400',estado:'Publicada',escuela:'EEST 6',distrito:'Avellaneda',turno:'Tarde',
  finoferta:'10/11/2026 10:00',hsmodulos:'4',jornada:'simple'};
const previousCapturedAt='2026-11-07T10:00:00Z';
const currentCapturedAt='2026-11-07T20:00:00Z';
const opts={previousComplete:true,currentComplete:true,scope:'Avellaneda',previousScope:'Avellaneda',
  previousCapturedAt,currentCapturedAt,nowMs:Date.parse('2026-11-07T20:02:00Z')};
const run=(old,current,overrides={})=>detectOfferUpdates(old,current,{...opts,...overrides});

test('unchanged published offer never triggers event',()=>{
 const future={...A,finoferta:'30/11/2026 10:00'};
 const x=run([future],[{...future,turno:' TARDE '}]);
 assert.equal(x.verified,true);
 assert.equal(x.events.length,0);
});
test('detects meaningful shift and deadline changes without treating same record as new',()=>{
 const x=run([A],[{...A,turno:'Mañana',finoferta:'11/11/2026 11:00'}]);
 assert.deepEqual(x.events.map(e=>e.field).sort(),['finoferta','turno']);
 assert.ok(x.events.every(e=>e.type==='offer_modified'));
 assert.ok(x.events.every(e=>!e.push_body.includes('EEST')));
});
test('explicit cancellation is a high-priority event, not a generic update',()=>{
 const x=run([A],[{...A,estado:'Anulada',turno:'Mañana'}]);
 assert.equal(x.events.length,1);
 assert.equal(x.events[0].type,'official_state_changed');
 assert.equal(x.events[0].after,'Anulada');
});
test('an absent offer does not imply a closed offer',()=>{
 const x=run([A],[]);
 assert.equal(x.verified,true);
 assert.deepEqual(x.events,[]);
});
test('new offers are handled elsewhere, not double alerted',()=>{
 const x=run([], [A]);
 assert.deepEqual(x.events,[]);
});
test('incomplete scans never trigger changes',()=>{
 for(const change of [{previousComplete:false},{currentComplete:false},{scope:'Quilmes'},{previousScope:''}]){
  const x=run([A],[{...A,turno:'Mañana'}],change);
  assert.equal(x.verified,false);
  assert.deepEqual(x.events,[]);
 }
});
test('ambiguous or duplicated identities fail closed',()=>{
 const x=run([A,A],[{...A,turno:'Mañana'}]);
 assert.equal(x.verified,false);
 assert.equal(x.reason,'ambiguous_offer_identity');
});
test('timestamps must be ordered, comparable and not stale',()=>{
 for(const change of [
  {currentCapturedAt:'2026-11-07T08:00:00Z'},
  {currentCapturedAt:'2026-11-11T20:00:00Z'},
  {currentCapturedAt:'bad'}
 ]){
  assert.equal(run([A],[{...A,turno:'Mañana'}],change).verified,false);
 }
});
test('closingSoon fires only at threshold crossing on same verified deadline',()=>{
 const o={...A,finoferta:'10/11/2026 10:00'};
 const x=run([o],[o]);
 const close=parseVerifiedClosingTime(o.finoferta);
 assert.equal(close,Date.UTC(2026,10,10,13));
 assert.equal(x.events.length,1);
 assert.equal(x.events[0].type,'closing_soon');
 assert.equal(x.events[0].field,'72h');
});
test('time parser rejects ambiguous dates and impossible local datetimes',()=>{
 for(const bad of ['10/11/2026','13/14/2026 12:00','31/02/2026 09:15',
  '2026-11-07T12:00','mañana','']){
  assert.equal(parseVerifiedClosingTime(bad),null,bad);
 }
 assert.equal(parseVerifiedClosingTime('2026-11-07T17:00:00-03:00'),Date.UTC(2026,10,7,20));
});
test('past deadlines are not sent as closingSoon',()=>{
 const x=run([{...A,finoferta:'07/11/2026 10:00'}],[{...A,finoferta:'07/11/2026 10:00'}]);
 assert.equal(x.events.length,0);
});
test('event keys stable for identical change and differ for distinct changes',()=>{
 const x=run([A],[{...A,turno:'Mañana'}]);
 const y=run([A],[{...A,turno:'Mañana'}],{currentCapturedAt:'2026-11-07T19:00:00Z'});
 assert.equal(x.events[0].event_key,y.events[0].event_key);
 const z=run([A],[{...A,turno:'Noche'}]);
 assert.notEqual(x.events[0].event_key,z.events[0].event_key);
});

test('rejects impossible ISO calendar dates even when JS Date.parse would normalize them',()=>{
 for(const invalid of [
  '2026-02-31T10:00:00-03:00','2026-04-31T00:00:00Z',
  '2026-11-31T08:00:00Z','2026-13-01T00:00:00Z',
  '2026-11-07T25:00:00Z','2026-11-07T12:60:00Z',
  '2026-11-07T12:00:60Z','2026-11-07T12:00:00+15:00',
  '2026-11-07T12:00:00+14:30'
 ]){
   assert.equal(parseVerifiedClosingTime(invalid),null,invalid);
 }
});
test('accepts valid leap day and ISO microsecond precision with explicit timezone',()=>{
 assert.equal(parseVerifiedClosingTime('2028-02-29T12:00:00Z'),Date.UTC(2028,1,29,12));
 assert.equal(parseVerifiedClosingTime('2026-11-07T20:00:00.123456+00:00'),
   Date.UTC(2026,10,7,20,0,0,123));
});
test('snapshot timestamps without explicit timezone must not generate changes',()=>{
 for(const change of [
  {previousCapturedAt:'2026-11-07T10:00:00'},
  {currentCapturedAt:'2026-11-07T20:00:00'},
  {currentCapturedAt:'2026-02-31T20:00:00Z'}
 ]){
  const x=run([A],[{...A,turno:'Mañana'}],change);
  assert.equal(x.verified,false);
  assert.deepEqual(x.events,[]);
 }
});
test('stale captures never generate any alerts even if both snapshots were complete',()=>{
 for(const change of [
  {nowMs:Date.parse('2026-11-08T09:00:01Z')},
  {nowMs:Date.parse('2026-11-07T19:54:59Z')},
  {nowMs:NaN}
 ]){
  const x=run([A],[{...A,turno:'Mañana'}],change);
  assert.equal(x.verified,false);
  assert.deepEqual(x.events,[]);
 }
});
test('within 12 hours, complete and identity-stable snapshots still produce change',()=>{
 const x=run([A],[{...A,turno:'Noche'}],{nowMs:Date.parse('2026-11-08T07:59:59Z')});
 assert.equal(x.verified,true);
 assert.ok(x.events.some(e=>e.field==='turno'&&e.after==='Noche'));
});
