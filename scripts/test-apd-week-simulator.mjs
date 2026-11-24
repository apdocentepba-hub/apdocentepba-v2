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

import {validateCareerProfile,projectCareerSchedule,lookupSchoolClassification,marginalPay} from './apd-career-profile-core.mjs';
const careerPosition={id:'cargo-1',schoolKey:'0005MS0004',school:'Escuela de prueba',role:'Matemática',level:'Secundaria',kind:'modulo',status:'titular',quantity:2,modules:['T1-1','T2-1'],blocks:[{day:1,start:'14:00',end:'16:00'}]};
const career={schema:1,seniorityYears:10,positions:[careerPosition]};
test('career projection preserves all legacy checkboxes and distinguishes unassigned modules',()=>{
 const result=projectCareerSchedule(career,['M1-2','T1-1']);
 assert.deepEqual(result.modules,['M1-2','T1-1','T2-1']);
 assert.deepEqual(result.unassignedModules,['M1-2']);
 assert.deepEqual(result.jobs,[{school:'Escuela de prueba',schoolKey:'0005MS0004',days:[1],start:'14:00',end:'16:00'}]);
});
test('reject duplicate module assignments and invalid clocks; never infer salary quantity',()=>{
 assert.throws(()=>validateCareerProfile({...career,positions:[careerPosition,{...careerPosition,id:'cargo-2'}]}));
 assert.throws(()=>validateCareerProfile({...career,positions:[{...careerPosition,blocks:[{day:1,start:'16:00',end:'14:00'}]}]}));
 assert.equal(validateCareerProfile(career).positions[0].quantity,2);
});
test('school classification needs unique official evidence and does not default to zero',()=>{
 const row={schoolKey:'0005MS0004',classification:'U0',asOf:'2026-11-18',source:'DGCYE_PBA'};
 assert.equal(lookupSchoolClassification(row.schoolKey,[]).status,'unknown');
 assert.equal(lookupSchoolClassification(row.schoolKey,[row,row]).status,'unknown');
 assert.equal(lookupSchoolClassification(row.schoolKey,[{...row,asOf:'2026-02-31'}]).status,'unknown');
 assert.deepEqual(lookupSchoolClassification(row.schoolKey,[row]),{status:'reported',classification:'U0',asOf:'2026-11-18',source:'DGCYE_PBA'});
});
test('net marginal pay is full payroll after minus before, integer cents, same period',()=>{
 const a={source:'FEB',period:'2026-11',netCentavos:80000000},b={...a,netCentavos:95000000};
 assert.equal(marginalPay(a,b).deltaCentavos,15000000);
 assert.equal(marginalPay(b,a).deltaCentavos,-15000000);
 assert.throws(()=>marginalPay(a,{...b,period:'2026-10'}));
 assert.throws(()=>marginalPay(a,{...b,source:'SUTEBA'}));
});
