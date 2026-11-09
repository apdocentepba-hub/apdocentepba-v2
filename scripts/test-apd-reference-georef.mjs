import test from 'node:test';
import assert from 'node:assert/strict';
import {findAddressReference,parseGeorefReferences,validateReferenceQuery} from './apd-reference-georef.mjs';

const response=obj=>{
 const bytes=new TextEncoder().encode(JSON.stringify(obj));
 return {ok:true,headers:{get:()=>String(bytes.byteLength)},
  arrayBuffer:async()=>bytes.buffer};
};
const safe={direcciones:[{
 nomenclatura:'MITRE 200, Avellaneda, Buenos Aires',
 ubicacion:{lat:-34.66,lon:-58.36},provincia:{nombre:'Buenos Aires'},departamento:{nombre:'Avellaneda'}
}]};

test('address lookup only on explicit call, no GPS or state storage',async()=>{
 let calls=[];
 const fetchImpl=async (url,opts)=>{calls.push({url,opts});return response(safe)};
 assert.equal(calls.length,0);
 const found=await findAddressReference('Mitre 200, Avellaneda',{fetchImpl});
 assert.equal(calls.length,1);
 const u=new URL(calls[0].url);
 assert.equal(u.hostname,'apis.datos.gob.ar');
 assert.equal(u.pathname,'/georef/api/direcciones');
 assert.equal(u.searchParams.get('provincia'),'Buenos Aires');
 assert.equal(u.searchParams.get('direccion'),'Mitre 200');
 assert.equal(u.searchParams.get('departamento'),'Avellaneda');
 assert.equal(calls[0].opts.credentials,'omit');
 assert.equal(calls[0].opts.method,'GET');
 assert.equal(found.length,1);
 assert.equal(found[0].source,'GEOREF_AR');
 assert.equal(found[0].lat,-34.66);
 assert.equal(found[0].lon,-58.36);
 assert.equal(Object.hasOwn(found[0],'query'),false);
});

test('rejects vague queries before any external lookup',async()=>{
 let fetches=0;
 const fetchImpl=async()=>{fetches++;return response(safe)};
 for(const value of ['Avellaneda','Wilde','', 'sin calle','Mitre 200']){
  assert.equal(validateReferenceQuery(value),false);
  await assert.rejects(findAddressReference(value,{fetchImpl}),/reference_needs_street/);
 }
 assert.equal(fetches,0);
 assert.equal(validateReferenceQuery('Mitre 200, Avellaneda'),true);
 assert.equal(validateReferenceQuery('Mitre y Lavalle, Avellaneda'),true);
});

test('discard georef points out of PBA or with unknown geometry, and duplicates',()=>{
 const list=parseGeorefReferences({direcciones:[
  ...safe.direcciones,...safe.direcciones,
  {nomenclatura:'Otro lugar',ubicacion:{lat:-12,lon:-43},provincia:{nombre:'Buenos Aires'}},
  {nomenclatura:'Otra provincia',ubicacion:{lat:-34.67,lon:-58.30},provincia:{nombre:'Santa Fe'}},
  {nomenclatura:'Sin punto',ubicacion:null}
 ]});
 assert.equal(list.length,1);
 assert.deepEqual(list.map(x=>x.label),['MITRE 200, Avellaneda, Buenos Aires']);
 assert.equal(parseGeorefReferences({direcciones:safe.direcciones},
  {department:'Quilmes'}).length,0);
});

test('network and oversized provider responses fail without persisting address',async()=>{
 await assert.rejects(findAddressReference('Mitre 200, Avellaneda',{
  fetchImpl:async()=>({ok:false})
 }),/georef_unavailable/);
 await assert.rejects(findAddressReference('Mitre 200, Avellaneda',{
  fetchImpl:async()=>({ok:true,headers:{get:()=>String(120001)}})
 }),/georef_response_too_large/);
 assert.deepEqual(parseGeorefReferences({direcciones:new Array(6).fill(safe.direcciones[0])}),[]);
});
