import test from 'node:test';
import assert from 'node:assert/strict';
import {assessComparatorCriterion} from './apd-comparador-datos-evaluacion.mjs';

const evalRow=(label,a,b)=>assessComparatorCriterion(label,[a,b]);

test('actual screenshot: ABC HSA/HS horario is same as plain a separator',()=>{
 const a=evalRow('Días y horarios',
  'Lunes a Viernes: 7:20HSA 11:50HS',
  'Lunes a Viernes: 7:20 a 11:50');
 assert.equal(a.status,'same');
 assert.deepEqual(a.values,[
  'Lunes a viernes: 07:20 a 11:50',
  'Lunes a viernes: 07:20 a 11:50'
 ]);
});
test('format-only differences in case, accents and optional HS do not highlight',()=>{
 const a=evalRow('Días y horarios','LUNES A VIERNES: 07:20 hs a 11:50 hs',
  'lunes a viernes: 7:20 a 11:50');
 assert.equal(a.status,'same');
});
test('real shift/day differences are still detected',()=>{
 for(const [a,b] of [
  ['Lunes a Viernes: 7:20HSA 11:50HS','Lunes a Viernes: 14:00 a 18:30'],
  ['Lunes a Jueves: 07:20 a 11:50','Lunes a Viernes: 07:20 a 11:50'],
  ['Lunes a Viernes: 07:20 a 11:50','Lunes a Viernes: 07:20 a 12:00']
 ])assert.equal(evalRow('Días y horarios',a,b).status,'different',a+' VS '+b);
});
test('real screenshot: curso/división 0 versus A is incomplete, not a proven difference',()=>{
 const x=evalRow('Curso / división','0','A');
 assert.equal(x.status,'unverified');
 assert.deepEqual(x.values,[
  'No informado (dato de ABC incompleto)','Dato parcial: A'
 ]);
});
test('complete course and division differ when the source is sufficiently specific',()=>{
 assert.equal(evalRow('Curso / división','1 A','2 B').status,'different');
 assert.equal(evalRow('Curso / división','1° 1°','1° 1°').status,'same');
 assert.equal(evalRow('Curso / división','1 A','1 a').status,'same');
});
test('bare year, single division, placeholders and empty source are non-comparable',()=>{
 for(const candidate of ['1','2°','A','0','','No informado','s/d','—']){
  const r=evalRow('Curso / división',candidate,'2 B');
  assert.equal(r.status,'unverified',candidate);
 }
});
test('unrelated criteria and verified numeric comparisons stay unchanged',()=>{
 assert.equal(evalRow('Escuela','0045MS0013','0045MS0027').status,'different');
 assert.equal(evalRow('Diferencia de puntos','-4,50','-13,05').status,'different');
 assert.equal(evalRow('Cierra','12/11/2026, 07:30','12/11/2026, 07:30').status,'same');
});
test('unknown schedule is not counted as agreement',()=>{
 assert.equal(evalRow('Días y horarios','Sin datos','No informado').status,'unverified');
});
test('helper remains deterministic and does not change caller-owned source data',()=>{
 const raw=Object.freeze(['Lunes a Viernes: 7:20HSA 11:50HS','Lunes a Viernes: 7:20 a 11:50']);
 const a=assessComparatorCriterion('Días y horarios',raw);
 const b=assessComparatorCriterion('Días y horarios',raw);
 assert.deepEqual(a,b);
 assert.equal(raw[0],'Lunes a Viernes: 7:20HSA 11:50HS');
});
