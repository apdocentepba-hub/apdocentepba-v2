import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeWeeklyOffers as opt} from './apd-week-optimizer.mjs';
import {planFavoriteDeadlineReminder as remind} from './apd-favorite-reminder-policy.mjs';
const now=new Date('2026-11-24T12:00:00Z');
const profile={jobs:[{school:'Escuela actual',days:[5],start:'07:20',end:'09:20'}],travelGapMinutes:30};
const offer=(key,horario,extras={})=>({source_offer_key:key,horario,estado:'PUBLICADA',finoferta:'2026-11-25T15:00:00Z',...extras});
test('exact optimizer chooses two shorter offers over one incompatible long one',()=>{
 const r=opt({now,profile,offers:[offer('A','Lunes: 08:00 a 13:00'),offer('B','Lunes: 08:00 a 10:00'),offer('C','Lunes: 10:30 a 12:30')]});
 assert.deepEqual(r.best,{keys:['B','C'],minutes:240});
});
test('minutes objective chooses longer one; travel margin excludes short gaps',()=>{
 const r=opt({now,profile,objective:'minutes',offers:[offer('A','Lunes: 08:00 a 13:00'),offer('B','Lunes: 08:00 a 10:00'),offer('C','Lunes: 10:15 a 12:30')]});
 assert.deepEqual(r.best,{keys:['A'],minutes:300});
});
test('exclude unknown and closed, current conflict and unresolved afternoon',()=>{
 const r=opt({now,profile:{...profile,moduleSchedule:['T2-2']},offers:[offer('A','Viernes: 08:00 a 10:00'),offer('B','Martes: 14:00 a 16:00'),offer('C','Lunes: 08:00 a 10:00',{estado:'FINALIZADA'}),offer('D','Lunes: 08:00 a 10:00',{finoferta:''}),offer('E','sin datos'),offer('F','Lunes: 08:00 a 10:00',{finoferta:'2026-11-24T09:00:00Z'})]});
 assert.equal(r.best.keys.length,0);assert.deepEqual(r.excluded.map(x=>x.reason),['overlap','unverified','closed','deadline-unverified','schedule-unverified','closed']);
});
test('same weekday overlapping blocks rejected and identity unique',()=>{
 assert.equal(opt({now,profile,offers:[offer('A','Lunes: 08:00 a 10:00; Lunes: 09:00 a 11:00')]}).excluded[0].reason,'schedule-unverified');
 assert.throws(()=>opt({now,profile,offers:[offer('A','Lunes: 08:00 a 10:00'),offer('A','Martes: 08:00 a 10:00')]}));
 assert.throws(()=>opt({now,profile,offers:Array.from({length:13},(_,i)=>offer('D_'+i,'Lunes: 08:00 a 10:00'))}));
});
test('no profile is not assumed free',()=>{assert.equal(opt({now,offers:[offer('A','Lunes: 08:00 a 10:00')]}).excluded[0].reason,'unverified');});
const time=now.getTime(),base={favorite:{key:'D_1',status:'open',stillSaved:true},consent:true,now:time,deadline:time+3*3600000,sourceVerifiedAt:time-1000};
test('reminders require consent, current verified source, saved offer and future deadline',()=>{
 assert.equal(remind(base).band,'24h');
 for(const p of [{consent:false},{sourceVerifiedAt:time-3600001},{deadline:time},{favorite:{...base.favorite,status:'unknown'}},{favorite:{...base.favorite,stillSaved:false}}])assert.equal(remind({...base,...p}),null);
});
test('idempotency is tied to offer, deadline and time window',()=>{
 const x=remind(base);assert.equal(remind({...base,alreadyClaimed:[x.id]}),null);
 const later=remind({...base,now:time+2*3600000,sourceVerifiedAt:time+2*3600000,alreadyClaimed:[x.id]});
 assert.equal(later.band,'2h');assert.notEqual(later.id,x.id);
});
