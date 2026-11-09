import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parseOfferWeeklySchedule,formatWeeklySchedule,schedulesEquivalent,
 sanitizeWorkProfile,checkScheduleOverlap
} from './apd-mi-jornada-comparador.mjs';
import {assessComparatorCriterion} from './apd-comparador-datos-evaluacion.mjs';
const first='Lunes a viernes: 07:20 a 11:50';
const second='Lunes a Viernes: 7:20 a 11:50';
const hsa='Lunes a Viernes: 7:20HSA 11:50HS';
const jobs=[{school:'Escuela de prueba',days:[1,2,3,4,5],start:'07:20',end:'11:50'}];
test('screenshots: semantically identical ABC horarios are equal despite case and leading zero',()=>{
 assert.deepEqual(parseOfferWeeklySchedule(first),parseOfferWeeklySchedule(second));
 assert.equal(schedulesEquivalent(first,second),true);
 assert.equal(assessComparatorCriterion('Días y horarios',[first,second]).status,'same');
 assert.deepEqual(assessComparatorCriterion('Días y horarios',[first,second]).values,
  ['Lunes a viernes: 07:20 a 11:50','Lunes a viernes: 07:20 a 11:50']);
});
test('HSA, HS and zero width characters match canonical schedule',()=>{
 for(const raw of [hsa,'Lunes a Viernes: 7:20 hs a 11:50 hs',
   'Lunes a Viernes: 7:20\u200b a 11:50','Lunes a Viernes: 7:20 a 11:50  ',
   'Lunes a Viernes: 7:20 a 11:50\uFEFF']){
  assert.equal(schedulesEquivalent(raw,first),true,raw);
 }
});
test('real time/day differences remain different',()=>{
 assert.equal(schedulesEquivalent(first,'Lunes a Viernes: 14:00 a 18:30'),false);
 assert.equal(schedulesEquivalent(first,'Lunes a Jueves: 07:20 a 11:50'),false);
 assert.equal(assessComparatorCriterion('Días y horarios',
  [first,'Lunes a Jueves: 07:20 a 11:50']).status,'different');
});
test('unknown or ambiguous schedule is unverified, not a false difference',()=>{
 for(const raw of ['No informado','7:20 a 11:50',
  'Lunes a Viernes: 07:20 a 11:50 y 14:00 a 17:00',
  'Lunes a Viernes: 11:50 a 07:20','Lunes a Viernes: 7:20 a 11:50 remoto']){
  assert.equal(parseOfferWeeklySchedule(raw),null,raw);
  assert.equal(assessComparatorCriterion('Días y horarios',[first,raw]).status,'unverified',raw);
 }
});
test('explicit non-consecutive weekday list is parsed',()=>{
 const x=parseOfferWeeklySchedule('Lunes, Miércoles y Viernes: 08:00 a 12:00');
 assert.deepEqual(x,{days:[1,3,5],start:480,end:720});
});
test('actual job overlaps offer on declared weekdays and minutes',()=>{
 const x=checkScheduleOverlap(first,{jobs});
 assert.equal(x.status,'overlap');
 assert.deepEqual(x.conflicts[0].days,['Lunes','Martes','Miércoles','Jueves','Viernes']);
 assert.equal(x.conflicts[0].from,'07:20');assert.equal(x.conflicts[0].to,'11:50');
});
test('overlap boundary uses strict time intersection',()=>{
 const overlap=checkScheduleOverlap(first,{jobs:[{...jobs[0],start:'11:20',end:'13:00'}]});
 assert.equal(overlap.status,'overlap');
 assert.equal(overlap.conflicts[0].from,'11:20');
 assert.equal(overlap.conflicts[0].to,'11:50');
 const adjacent=checkScheduleOverlap(first,{jobs:[{...jobs[0],start:'11:50',end:'14:00'}]});
 assert.equal(adjacent.status,'no-overlap');
});
test('different weekdays do not conflict and commute is not certified',()=>{
 const x=checkScheduleOverlap(first,{jobs:[{...jobs[0],days:[6,7]}]});
 assert.equal(x.status,'no-overlap');
 assert.match(x.label,/Sin superposición/);
});
test('lack of work profile and missing offer time are not classified compatible',()=>{
 assert.equal(checkScheduleOverlap(first,{jobs:[]}).status,'unverified');
 assert.equal(checkScheduleOverlap('Turno mañana',{jobs}).status,'unverified');
});
test('validate multiple schools/day fields and reject erroneous data',()=>{
 const profile=sanitizeWorkProfile({domicile:'Avellaneda, PBA',jobs:[
  {school:'Escuela A',days:[5,3,1],start:'07:20',end:'11:50'},
  {school:'Escuela B',days:[2,4],start:'14:00',end:'18:30'}
 ]});
 assert.deepEqual(profile.jobs[0].days,[1,3,5]);
 assert.equal(profile.domicile,'Avellaneda, PBA');
 assert.equal(profile.jobs.length,2);
});
test('privacy/safety: reject wrong working times and malformed days',()=>{
 for(const job of [
  {school:'A',days:[1],start:'07:00',end:'11:00'},
  {school:'Escuela',days:[1,1],start:'07:00',end:'11:00'},
  {school:'Escuela',days:[0],start:'07:00',end:'11:00'},
  {school:'Escuela',days:[1],start:'11:00',end:'11:00'},
  {school:'Escuela',days:[1],start:'25:00',end:'11:00'}
 ])assert.throws(()=>sanitizeWorkProfile({domicile:'',jobs:[job]}));
 assert.throws(()=>sanitizeWorkProfile({domicile:'x\nsecret',jobs:[]}));
 assert.throws(()=>sanitizeWorkProfile({domicile:'',jobs:Array(6).fill(jobs[0])}));
});
