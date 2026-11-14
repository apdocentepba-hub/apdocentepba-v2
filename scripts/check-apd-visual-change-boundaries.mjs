/**
 * Protect non-visual dashboard code during an intentionally isolated card UI PR.
 * A PR that changes authentication, API calls, billing, notification handling,
 * or any code outside two renderer functions MUST fail before merge.
 *
 * This does not assert that arbitrary edits inside those functions are safe:
 * their rendering semantics are covered by independent Node and Chromium QA.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

function sections(input){
 const a=input.indexOf('function renderPidMatchBlock(alerta, resumen) {');
 const b=input.indexOf('\nfunction renderAlertaActual()',a);
 const c=input.indexOf('\nfunction alertaRow(',b);
 assert.ok(a>0&&b>a&&c>b,'Expected unmodified function boundaries in app_v2.js');
 assert.equal(input.indexOf('function renderPidMatchBlock(',a+1),-1);
 assert.equal(input.indexOf('function renderAlertaActual(',b+1),-1);
 return {
  protectedPrefix:input.slice(0,a),
  pid:input.slice(a,b),
  offer:input.slice(b,c),
  protectedSuffix:input.slice(c)
 };
}
export function checkVisualOnly(base,candidate){
 const before=sections(base),after=sections(candidate);
 assert.equal(after.protectedPrefix,before.protectedPrefix,
  'Non-card code changed before the PID renderer; reject this candidate');
 assert.equal(after.protectedSuffix,before.protectedSuffix,
  'Non-card code changed after the offer renderer; reject this candidate');
 // Explicitly limit the amount of markup changed in these two functions.
 const altered=Math.abs(after.pid.length-before.pid.length)+
  Math.abs(after.offer.length-before.offer.length);
 assert.ok(altered<=4000,'Visual renderer change exceeds approved review budget');
 assert.match(after.pid,/<details class="alerta-pid-disclosure">/,
  'The PID details must remain keyboard-discoverable');
 assert.match(after.pid,/\$\{esc\(info\.title\)\}/,
  'PID status must stay HTML escaped');
 assert.match(after.pid,/\$\{esc\(info\.text\)\}/,
  'PID brief must stay HTML escaped');
 assert.match(after.offer,/alerta-location-value alerta-school-key/,
  'The school ABC key must remain primary');
 assert.match(after.offer,/\$\{esc\(schoolCode \|\| schoolName \|\| "Escuela no informada"\)\}/,
  'The displayed school key/name must stay HTML escaped');
 assert.doesNotMatch(after.pid+after.offer,
  /\b(?:fetch|XMLHttpRequest|sendBeacon|eval)\s*\(|new Function\s*\(|navigator\.geolocation|localStorage|sessionStorage/,
  'UI render functions may not introduce network, tracking or execution');
 return Object.freeze({
  non_visual_code_unchanged:true,
  allowed_functions:['renderPidMatchBlock','renderAlertaActual'],
  changed_char_budget:altered
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const baseline=execFileSync('git',['show','origin/main:app_v2.js'],{
  encoding:'utf8',maxBuffer:4*1024*1024
 });
 const current=readFileSync('app_v2.js','utf8');
 console.log('APD_VISUAL_CHANGE_GUARD '+JSON.stringify(checkVisualOnly(baseline,current)));
}
