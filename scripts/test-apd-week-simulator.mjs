import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateWeek,mergeIntervals,intervalText} from './apd-week-simulator.mjs';
test('union avoids double counting duplicate or intersecting intervals',()=>{
 assert.deepEqual(mergeIntervals([[60,120],[90,180],[180,240],[60,120]]),[[60,240]]);
 const p={jobs:[{school:'Fixture',days:[1],start:'08:00',end:'10:00'}],travelGapMinutes:0};
 const s=simulateWeek('Lunes: 09:00 a 11:00; Lunes: 10:00 a 12:00',p);
 assert.equal(s.status,'overlap');assert.deepEqual(s.totals,{offerMinutes:180,currentMinutes:120,combinedMinutes:240,overlapMinutes:60});
 assert.equal(intervalText(s.days[0].combined),'08:00–12:00');
});
test('morning module reference is explicit; profile is not changed',()=>{
 const p={jobs:[],moduleSchedule:['M1-1','M2-1'],travelGapMinutes:0};
 const before=JSON.stringify(p),s=simulateWeek('Lunes: 08:00 a 09:00',p);
 assert.equal(s.referenceMorning,true);assert.equal(s.totals.overlapMinutes,60);
 assert.equal(JSON.stringify(p),before);
});
test('afternoon with no clock never invents total or compatible result',()=>{
 const s=simulateWeek('Martes: 14:00 a 15:00',{jobs:[],moduleSchedule:['T0-2','T3-2']});
 assert.equal(s.status,'unverified');assert.equal(s.totals.combinedMinutes,null);
 assert.deepEqual(s.days[1].afternoon,['Prehora','3']);assert.equal(s.totals.offerMinutes,60);
});
test('unknown profile or incomplete offer cannot establish availability',()=>{
 const s=simulateWeek('Lunes: 08:00 a 09:00',{jobs:[]});
 assert.equal(s.status,'unverified');assert.equal(s.totals.currentMinutes,null);
 assert.equal(simulateWeek('a confirmar',{jobs:[]}).totals,null);
 assert.equal(simulateWeek('Lunes: 08:00 a 09:00',{jobs:[],moduleSchedule:['M0-1']}).totals,null);
});
test('weekend and disjoint intervals remain distinct',()=>{
 const s=simulateWeek('Sábado: 09:00 a 10:00; Domingo: 12:00 a 13:00',{jobs:[],moduleSchedule:['M1-6'],travelGapMinutes:0});
 assert.equal(s.status,'no-overlap');assert.equal(s.totals.offerMinutes,120);assert.equal(s.totals.combinedMinutes,180);
 assert.deepEqual(s.days[5].combined,[[440,500],[540,600]]);
});
