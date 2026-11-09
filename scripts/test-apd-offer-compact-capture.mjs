import test from 'node:test';
import assert from 'node:assert/strict';
import {compactCaptureFromPages,detectBetweenCompactCaptures} from './apd-offer-compact-capture.mjs';

const capturedAt='2026-11-09T07:35:36Z';
const a={source_offer_key:'D_100',estado:'Publicada',distrito:'AVELLANEDA',
 finoferta:'2026-11-12T07:30:00Z',turno:'Mañana',cargo:'Preceptor',raw:{sensitive:'secret'},
 pid_puntaje_total:38.10,email:'private@example.com'};
const b={...a,source_offer_key:'D_101',turno:'Tarde'};
const make=(pages,props={})=>compactCaptureFromPages({scope:'AVELLANEDA',capturedAt,pages,...props});
const page=(rows,offset=0,total=rows.length)=>({offset,sourceTotal:total,rows});

test('complete compact capture retains only fields needed for change detection',()=>{
 const capture=make([page([a,b])]);
 assert.equal(capture.complete,true);
 assert.equal(capture.rows.length,2);
 assert.equal(capture.sourceTotal,2);
 assert.equal(capture.fieldCount,14);
 assert.equal(capture.rows[0].source_offer_key,'D_100');
 assert.equal('raw' in capture.rows[0],false);
 assert.equal('email' in capture.rows[0],false);
 assert.equal('pid_puntaje_total' in capture.rows[0],false);
 assert.equal(Object.keys(capture.rows[0]).length,14);
 assert.equal(capture.digest.length,64);
});

test('order of source pages does not change compact fingerprint',()=>{
 const a1=make([page([a,b])]);
 const a2=make([page([b,a])]);
 assert.equal(a1.digest,a2.digest);
});
test('missing pages and inconsistent source totals cannot pass',()=>{
 const partial=make([page([a],0,2)]);
 assert.equal(partial.complete,false);
 assert.equal(partial.reason,'incomplete_page_coverage');
 const inconsistent=make([page([a],0,2),page([b],1,3)]);
 assert.equal(inconsistent.complete,false);
 assert.equal(inconsistent.reason,'source_total_changed_mid_scan');
});
test('reject missing, duplicate, shifted, and out-of-scope identifiers',()=>{
 assert.equal(make([page([a,a])]).reason,'duplicate_offer_identity');
 assert.equal(make([page([a],1,1)]).reason,'invalid_page_coverage');
 assert.equal(make([page([{...a,distrito:'QUILMES'}])]).reason,'row_identity_or_scope_invalid');
 assert.equal(make([page([{...a,source_offer_key:''}])]).reason,'row_identity_or_scope_invalid');
});
test('fail closed for missing timestamps, mode, non-UTC capture and invalid rows',()=>{
 assert.equal(make([page([a])],{capturedAt:'2026-11-09T07:35:36'}).complete,false);
 assert.equal(make([page([a])],{scanStatus:'running'}).complete,false);
 assert.equal(make([page([a])],{scanMode:'partial'}).complete,false);
 assert.equal(make([],{}).complete,false);
});
test('true zero-offer scope is not mistaken for a missing page',()=>{
 const c=make([page([],0,0)]);
 assert.equal(c.complete,true);
 assert.equal(c.sourceTotal,0);
});
test('two complete synthetic scans can find shift without messaging or storage',()=>{
 const previous=make([page([a])],{capturedAt:'2026-11-09T07:35:36Z'});
 const current=make([page([{...a,turno:'Tarde'}])],{capturedAt:'2026-11-09T08:35:36Z'});
 const result=detectBetweenCompactCaptures(previous,current,{nowMs:Date.parse('2026-11-09T08:35:40Z')});
 assert.equal(result.verified,true);
 assert.deepEqual(result.events.map(x=>x.field),['turno']);
 assert.equal(result.events[0].push_body.includes('AVELLANEDA'),false);
});
test('an absent row never implies official cancellation',()=>{
 const old=make([page([a])],{capturedAt:'2026-11-09T07:35:36Z'});
 const newer=make([page([],0,0)],{capturedAt:'2026-11-09T08:35:36Z'});
 const result=detectBetweenCompactCaptures(old,newer,{nowMs:Date.parse('2026-11-09T08:35:40Z')});
 assert.equal(result.verified,true);
 assert.deepEqual(result.events,[]);
});
test('no comparison from a partial compact capture',()=>{
 const old=make([page([a],0,2)]);
 const newer=make([page([a])]);
 assert.equal(detectBetweenCompactCaptures(old,newer).verified,false);
});
