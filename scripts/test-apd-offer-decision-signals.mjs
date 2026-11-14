import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessOfferDecisionSignals as assess} from '../scripts/apd-offer-decision-signals.mjs';
const baseline={pid_match_verified:null,pid_compatible_panel:null,
 district_preferred:null,turn_preferred:null,horas_hasta_cierre:null,horario:''};
test('no evidence never receives a favorable rating',()=>{
 const r=assess(baseline);
 assert.equal(r.kind,'unknown');
 assert.match(r.label,/Datos por confirmar/);
 assert.ok(r.reasons.some(x=>x.includes('PID')));
 assert.ok(r.reasons.some(x=>x.includes('cierre')));
});
test('only concrete positive signals with known closure and schedule can be favorable',()=>{
 const r=assess({...baseline,pid_compatible_panel:true,
  district_preferred:true,turn_preferred:true,horas_hasta_cierre:50,
  horario:'Lunes 7:30 a 9:30'});
 assert.equal(r.kind,'positive');
 assert.match(r.label,/Coincide con filtros observados/);
 assert.doesNotMatch(r.label,/adjudicad|apto|compatible normativo/i);
 assert.equal(r.reasons.some(x=>/probabilidad|ganar|salario/i.test(x)),false);
});
test('PID mismatch takes precedence over all positive signals',()=>{
 const r=assess({...baseline,pid_match_verified:false,
  pid_compatible_panel:true,district_preferred:true,turn_preferred:true,
  horas_hasta_cierre:72,horario:'Lunes 7:30'});
 assert.equal(r.kind,'review');
 assert.ok(r.reasons.some(x=>/PID/.test(x)));
});
test('unmatched district, shift or expiring deadline requires review',()=>{
 for(const row of [
  {...baseline,pid_compatible_panel:true,district_preferred:false,
   turno:'Mañana',horas_hasta_cierre:80,horario:'Lunes 8 a 10'},
  {...baseline,pid_compatible_panel:true,turn_preferred:false,
   horas_hasta_cierre:80,horario:'Lunes 8 a 10'},
  {...baseline,pid_compatible_panel:true,district_preferred:true,
   horas_hasta_cierre:4,horario:'Lunes 8 a 10'}
 ])assert.equal(assess(row).kind,'review');
});
test('unverified hours and absent work schedule cannot be scored green',()=>{
 const a=assess({...baseline,pid_compatible_panel:true,
  district_preferred:true,turn_preferred:true,horas_hasta_cierre:null,
  horario:'Lunes 8 a 10'});
 assert.equal(a.kind,'unknown');
 const b=assess({...baseline,pid_compatible_panel:true,
  district_preferred:true,turn_preferred:true,horas_hasta_cierre:70,horario:''});
 assert.equal(b.kind,'unknown');
});
test('arbitrary raw user text is not interpolated into warnings and output is immutable',()=>{
 const r=assess({...baseline,pid_compatible_panel:false,
  distrito:'<svg onload=alert(1)>',horario:'<img onerror=alert(1)>'});
 assert.equal(r.kind,'review');
 assert.ok(r.reasons.every(x=>!x.includes('<')));
 assert.ok(Object.isFrozen(r));
 assert.ok(Object.isFrozen(r.reasons));
 const missing=assess(null);assert.equal(missing.kind,'unknown');
});
test('decision signals have no network, personal data, salary or probability engine',()=>{
 const src=readFileSync('scripts/apd-offer-decision-signals.mjs','utf8');
 const ui=readFileSync('apd_comparador_panel.mjs','utf8');
 assert.doesNotMatch(src,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|navigator\.geolocation/);
 assert.match(src,/No network calls/);
 assert.match(ui,/assessOfferDecisionSignals\(row\)/);
 assert.match(ui,/apd-offer-fit-title/);
 assert.match(ui,/fit\.note/);
 assert.doesNotMatch(src,/Math\.random\(|adjudication_probability|score_to_salary/);
});
