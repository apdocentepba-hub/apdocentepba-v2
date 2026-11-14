import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkVisualOnly} from './check-apd-visual-change-boundaries.mjs';
const source=readFileSync('app_v2.js','utf8');
test('current rendering contract meets limited visual boundaries',()=>{
 const result=checkVisualOnly(source,source);
 assert.equal(result.non_visual_code_unchanged,true);
 assert.deepEqual(result.allowed_functions,['renderPidMatchBlock','renderAlertaActual']);
});
test('minor presentation copy inside allowed renderer is permitted',()=>{
 const candidate=source.replace('Ver desglose PID','Mostrar desglose PID');
 assert.notEqual(candidate,source);
 assert.equal(checkVisualOnly(source,candidate).non_visual_code_unchanged,true);
});
test('changes to PID scoring code before the renderers are rejected',()=>{
 const candidate=source.replace(
  'function buildPidChanceInfo(',
  'function buildPidChanceInfoUnsafe(');
 assert.notEqual(candidate,source);
 assert.throws(()=>checkVisualOnly(source,candidate),/Non-card code changed before/);
});
test('state/cache or helpers after renderers cannot change',()=>{
 const original='function alertaRow(label, value, visualClass = "") {';
 const candidate=source.replace(original,original+'\n  void "injected";');
 assert.notEqual(candidate,source);
 assert.throws(()=>checkVisualOnly(source,candidate),/Non-card code changed after/);
});
test('new tracking or unsafe evaluation inside renderers is rejected',()=>{
 const candidate=source.replace('Ver desglose PID',
  'Ver desglose PID\x27; eval(\x27danger\x27)');
 assert.throws(()=>checkVisualOnly(source,candidate),/network, tracking or execution/);
});
test('visible PID summary and escaped school key cannot be dropped',()=>{
 assert.throws(()=>checkVisualOnly(source,
  source.replace('<details class="alerta-pid-disclosure">',
   '<div class="alerta-pid-disclosure">')),/PID details/);
 assert.throws(()=>checkVisualOnly(source,
  source.replace('alerta-location-value alerta-school-key',
   'alerta-location-value')),/school ABC key/);
});
