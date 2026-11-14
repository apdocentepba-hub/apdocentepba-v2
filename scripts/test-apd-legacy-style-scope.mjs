import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 allowedSelectorFixes,verifyLegacyPatchScope
} from './check-apd-legacy-style-scope.mjs';

const candidate=readFileSync('frontend_easy_fixes_patch.js','utf8');
const baseline=allowedSelectorFixes.reduceRight((content,[before,after])=>{
 assert.equal(content.split(after).length-1,1,'Current scoped selector missing');
 return content.replace(after,before);
},candidate);

test('Legacy CSS patch is unchanged except for the two targeted overrides',()=>{
 const result=verifyLegacyPatchScope(baseline,candidate);
 assert.equal(result.only_approved_selectors_modified,true);
 assert.equal(result.replacements,2);
});
test('Any unrelated styling or runtime mutation is denied',()=>{
 assert.throws(()=>verifyLegacyPatchScope(
  baseline,candidate.replace('setTimeout(function()', 'setTimeout(function(){return;}')),
  /changed beyond/);
 assert.throws(()=>verifyLegacyPatchScope(
  baseline,candidate.replace('html,body{scroll-padding-top:92px!important}',
    'html,body{scroll-padding-top:0!important}')),/changed beyond/);
});
test('The wildcard override cannot be added back',()=>{
 assert.throws(()=>verifyLegacyPatchScope(baseline,baseline),
  /changed beyond|Blanket rule/);
});
