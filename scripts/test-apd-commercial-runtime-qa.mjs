import test from 'node:test';
import assert from 'node:assert/strict';
import {extract} from './apd-commercial-runtime-qa.mjs';
test('runtime extracts one-line wrapper without consuming neighbor',()=>{
 const a='function getPlanPreset(code) { return code; }';
 const src=a+'\n__name(getPlanPreset,"getPlanPreset");\nfunction unrelated() { return 1; }\n__name(unrelated,"unrelated");';
 assert.equal(extract(src,'getPlanPreset'),a);
 assert.throws(()=>extract(src.replace('__name(getPlanPreset,"getPlanPreset");',''),'getPlanPreset'));
 assert.throws(()=>extract(a+'\n'+src,'getPlanPreset'));
});
