import test from 'node:test';
import assert from 'node:assert/strict';
import {updateApplicationDiary as update} from './apd-application-diary.mjs';
const now=new Date('2026-11-24T15:00:00Z'),base={revision:0,entries:[]};
test('manual status never claimed official, revision and deletion',()=>{
 const a=update(base,{action:'set',key:'D_1',status:'postulada',revision:0},now);
 assert.equal(a.record.entries[0].origin,'self_reported');assert.equal(a.record.revision,1);
 assert.equal(update(a.record,{action:'set',key:'D_1',status:'adjudicada',revision:0},now).code,'conflict');
 const b=update(a.record,{action:'set',key:'D_1',status:'adjudicada',revision:1},now);
 assert.equal(b.record.entries[0].status,'adjudicada');
 assert.deepEqual(update(b.record,{action:'remove',key:'D_1',revision:2},now).record,{revision:3,entries:[]});
});
test('invalid identities and statuses rejected; repeated status is idempotent',()=>{
 for(const m of [{key:'D_1\n',status:'postulada'},{key:'D_1',status:'official_verified'}])assert.throws(()=>update(base,{action:'set',revision:0,...m},now));
 const m={action:'set',key:'D_1',status:'postulada',revision:0};
 const a=update(base,m,now);
 assert.equal(update(a.record,{...m,revision:1},now).changed,false);
});
