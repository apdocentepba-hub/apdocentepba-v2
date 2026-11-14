/**
 * Prove that the legacy UI patch changed only two CSS selector strings.
 * No DOM mutation, authentication, tab, timing, or business logic changes.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const allowedSelectorFixes=Object.freeze([
 Object.freeze([
  '.stat-box,.alerta-floating,.historico-box',
  '.stat-box,.alerta-floating:not(.alerta-main-card),.historico-box'
 ]),
 Object.freeze([
  "#panel-alertas .alerta-row,#panel-alertas .alerta-floating,#panel-alertas [class*='alerta-']{border-radius:18px!important;border-color:#dbe7f5!important}",
  "#panel-alertas .alerta-row,#panel-alertas .alerta-floating:not(.alerta-main-card){border-radius:18px!important;border-color:#dbe7f5!important}"
 ])
]);
export function verifyLegacyPatchScope(baseline,candidate){
 let expected=baseline;
 for(const [old,neu] of allowedSelectorFixes){
  assert.equal(expected.split(old).length-1,1,
   'Expected exactly one historical conflicting CSS selector');
  expected=expected.replace(old,neu);
 }
 assert.equal(candidate,expected,
  'Legacy UI patch changed beyond the two approved CSS selector fixes');
 assert.doesNotMatch(candidate,/#panel-alertas \[class\*='alerta-'\]/,
  'Blanket rule on every alert subelement must stay removed');
 return Object.freeze({
  only_approved_selectors_modified:true,
  replacements:allowedSelectorFixes.length
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const baseline=execFileSync('git',['show','origin/main:frontend_easy_fixes_patch.js'],{
  encoding:'utf8',maxBuffer:2*1024*1024
 });
 const current=readFileSync('frontend_easy_fixes_patch.js','utf8');
 console.log('APD_LEGACY_STYLE_SCOPE '+JSON.stringify(verifyLegacyPatchScope(baseline,current)));
}
