import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePlannerAccountHomeWrite as decide} from './apd-account-home-write-policy.mjs';

const address='Calle de Ejemplo 319, Wilde, Avellaneda, Buenos Aires';
const point={source:'GEOREF_AR_V2',label:address,height:319,
 lat:-34.70,lon:-58.33,scope:'partido',reviewed:true};

test('Insigne saves only schedules without deleting the same account location',()=>{
 const result=decide({address_text:address,georef:point},address,null);
 assert.equal(result.needsWrite,false,'no PUT should be triggered');
 assert.deepEqual(result.georef,point,'keep already verified location');
 assert.equal(result.reusedSavedGeoref,true);
});
test('Insigne can store a newly selected location if account has only address text',()=>{
 const result=decide({address_text:address,georef:null},address,point);
 assert.equal(result.needsWrite,true);
 assert.deepEqual(result.georef,point);
});
test('explicit changed home address removes stale location',()=>{
 const next='Nueva Avenida 180, Avellaneda';
 const result=decide({address_text:address,georef:point},next,null);
 assert.equal(result.needsWrite,true);
 assert.equal(result.georef,null);
 assert.equal(result.address_text,next);
});
test('same account address and same explicitly selected point avoids redundant write',()=>{
 const result=decide({address_text:address,georef:point},address,{...point});
 assert.equal(result.needsWrite,false);
 assert.deepEqual(result.georef,point);
});
test('new account home can be created without a location',()=>{
 const result=decide(null,address,null);
 assert.equal(result.needsWrite,true);
 assert.equal(result.georef,null);
});
test('empty private planner home never wipes account address',()=>{
 const result=decide({address_text:address,georef:point},'',null);
 assert.equal(result.needsWrite,false);
 assert.equal(result.georef,null);
});
