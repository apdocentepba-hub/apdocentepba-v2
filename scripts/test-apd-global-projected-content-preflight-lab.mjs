import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareProjectedGlobalPairsForIsolatedPg17,LAB_PROJECTED_FIELDS}
 from './apd-global-projected-content-preflight-lab.mjs';
const offer=(id,key,district)=>({
 id,iddetalle:String(key),idoferta:'OFF_'+key,
 descdistrito:district,estado:'Publicada',escuela:'ESCUELA FICTICIA',
 descripcioncargo:'INFORMATICA',turno:'TM',observaciones:'privado@example.com'
});
const example=()=>({
 MORENO:[offer('SOLR_1',9401,'MORENO'),offer('SOLR_2',9402,'MORENO')],
 TIGRE:[offer('SOLR_3',9501,'TIGRE')],
 QUILMES:[]
});
const clone=x=>structuredClone(x);
const keyFromOffer=x=>'D_'+x.iddetalle;
function mock(data,change=()=>{},calls=[]){
 let pass=0;
 return async district=>{
  calls.push(district);if(district==='MORENO')pass++;
  const obj=clone(data);if(pass>1)change(obj);
  const docs=obj[district];
  return {docs,totalBruto:docs.length,totalFiltrado:docs.length};
 };
}
const run=(reader,districts=['MORENO','TIGRE','QUILMES'])=>
 prepareProjectedGlobalPairsForIsolatedPg17({districts,readDistrict:reader,keyFromOffer});
test('two full projected captures bind content and IDs to isolated pair staging',async()=>{
 const calls=[];
 const gate=await run(mock(example(),()=>{},calls));
 assert.deepEqual(calls,['MORENO','TIGRE','QUILMES','MORENO','TIGRE','QUILMES']);
 assert.equal(gate.summary.source_content_hashes_checked,true);
 assert.equal(gate.summary.total_worker_keys,3);
 assert.equal(gate.summary.projected_fields_checked,29);
 assert.deepEqual(gate.pairsForIsolatedStaging('TIGRE',['D_9501']),[
  {id:'SOLR_3',source_offer_key:'D_9501'}
 ]);
 assert.throws(()=>gate.pairsForIsolatedStaging('QUILMES',[]),/unknown or empty/);
 const serialized=JSON.stringify(gate);
 assert.doesNotMatch(serialized,/SOLR_|D_9401|privado|example\.com|SHA256|digest/i);
 assert.equal(gate.summary.deploy_authorized,false);
});
test('ordering of docs and field enumeration does not cause false drift',async()=>{
 const gate=await run(mock(example(),obj=>{
  for(const district of Object.keys(obj)){
   obj[district].reverse();
   obj[district]=obj[district].map(doc=>Object.fromEntries(Object.entries(doc).reverse()));
  }
 }));
 assert.equal(gate.summary.source_content_hashes_checked,true);
});
test('equal counts, IDs and keys cannot mask changes of important fields',async()=>{
 for(const [field,value] of [
  ['descripcioncargo','MATEMATICA'],['turno','TT'],
  ['observaciones','cambio de texto'],['escuela','OTRA ESCUELA'],
  ['finoferta','2099-01-01']
 ]){
  await assert.rejects(()=>run(mock(example(),obj=>{obj.MORENO[0][field]=value})),
   /source content drifted/,field);
 }
});
test('remapping a Solr ID to another Worker key fails closed',async()=>{
 await assert.rejects(()=>run(mock(example(),obj=>{
  obj.MORENO[0].iddetalle='9999';
 })),/Worker-key mapping drifted/);
});
test('cross-district global key and ID collisions fail closed',async()=>{
 for(const variant of ['key','id']){
  const data=example();
  if(variant==='key')data.TIGRE[0].iddetalle='9401';
  else data.TIGRE[0].id='SOLR_1';
  await assert.rejects(()=>run(mock(data)),/collision/);
 }
});
test('incomplete or misreported results never authorize pair staging',async()=>{
 await assert.rejects(()=>run(async district=>({docs:[],totalBruto:2,totalFiltrado:1})),
  /incomplete district capture/);
});
test('foreign fields, private raw and wrong district/status are rejected',async()=>{
 for(const mutation of [
  x=>{x.MORENO[0].raw={email:'secret@invalid'}},
  x=>{x.MORENO[0].descdistrito='TIGRE'},
  x=>{x.MORENO[0].estado='Cerrada'},
  x=>{x.MORENO[0].iddetalle='not-a-number'}
 ]){
  const data=example();mutation(data);
  await assert.rejects(()=>run(mock(data)),/rejected/);
 }
});
test('callback errors fail closed without returning source text',async()=>{
 const privateText='private-email@example.com';
 await assert.rejects(()=>run(async()=>{throw Error(privateText)}),err=>{
  assert.doesNotMatch(err.message,/private-email|example/);return true;
 });
});
test('invalid config and oversized or malformed district requests reject',async()=>{
 assert.equal(LAB_PROJECTED_FIELDS.length,29);
 await assert.rejects(()=>run(mock(example()),['MORENO','MORENO']),/invalid laboratory dependencies/);
 await assert.rejects(()=>run(mock(example()),['moreno','TIGRE']),/invalid laboratory dependencies/);
});
