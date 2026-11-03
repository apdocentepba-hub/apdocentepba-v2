import test from "node:test";
import assert from "node:assert/strict";
import {auditGlobalPublishedKeys} from "./audit-apd-global-published-keys-readonly.mjs";
const districts=["LA MATANZA","AVELLANEDA","QUILMES"];
const offer=(district,index,detail)=>({
 id:"SOLR_FAKE_"+district.replaceAll(" ","_")+"_"+index,
 iddetalle:String(detail),idoferta:String(detail+100000),
 descdistrito:district,estado:"Publicada",
 escuela:"ESCUELA FICTICIA",descripcioncargo:"PRECEPTOR",
 descripcionarea:"PRECEPTOR",turno:"M",
 observaciones:"Aviso de prueba"
});
const data=()=>({
 "LA MATANZA":[offer("LA MATANZA",1,10001),offer("LA MATANZA",2,10002)],
 AVELLANEDA:[offer("AVELLANEDA",1,20001),offer("AVELLANEDA",2,20002)],
 QUILMES:[offer("QUILMES",1,30001)]
});
const deep=x=>JSON.parse(JSON.stringify(x));
const key=row=>"D_"+String(row.iddetalle||"");
function fromDataset(first,second=first){
 let calls=0;
 return {
  readDistrict:async district=>{
   const pass=Math.floor(calls/districts.length);
   calls++;
   const docs=deep((pass===0?first:second)[district]??[]);
   return {docs,totalBruto:docs.length,totalFiltrado:docs.length};
  },
  calls:()=>calls
 };
}
const audit=src=>auditGlobalPublishedKeys({
 districts,readDistrict:src.readDistrict,keyFromOffer:key
});
test("complete three-district double snapshot returns aggregate counts only",async()=>{
 const s=fromDataset(data());
 const report=await audit(s);
 assert.equal(s.calls(),6);
 assert.deepEqual(report.audited_districts,[
  {district:"LA MATANZA",published_count:2},
  {district:"AVELLANEDA",published_count:2},
  {district:"QUILMES",published_count:1}
 ]);
 assert.equal(report.global_distinct_worker_keys,5);
 assert.equal(report.completed_full_passes,2);
 assert.equal(report.no_global_or_within_district_collision,true);
 assert.doesNotMatch(JSON.stringify(report),/SOLR_FAKE|D_10001|ESCUELA FICTICIA|Aviso de prueba/);
});
test("a Worker key repeated by two different districts is rejected",async()=>{
 const dataset=data();dataset.AVELLANEDA[0].iddetalle="10001";
 await assert.rejects(()=>audit(fromDataset(dataset)),/cross-district Worker key collision/);
});
test("same Solr ID in two districts is rejected even with distinct Worker keys",async()=>{
 const dataset=data();dataset.AVELLANEDA[0].id=dataset["LA MATANZA"][0].id;
 await assert.rejects(()=>audit(fromDataset(dataset)),/cross-district Solr ID collision/);
});
test("two source IDs reusing a Worker key within one district are rejected",async()=>{
 const dataset=data();dataset.AVELLANEDA[1].iddetalle=dataset.AVELLANEDA[0].iddetalle;
 await assert.rejects(()=>audit(fromDataset(dataset)),/duplicate Worker keys within a district/);
});
test("count-stable replacement of a source offer fails closed",async()=>{
 const first=data(),second=deep(first);
 second.QUILMES[0]=offer("QUILMES",7,30007);
 await assert.rejects(()=>audit(fromDataset(first,second)),/source-ID set drifted at equal count/);
});
test("same Solr ID remapped to another Worker detail key fails closed",async()=>{
 const first=data(),second=deep(first);
 second.QUILMES[0].iddetalle="30099";
 await assert.rejects(()=>audit(fromDataset(first,second)),/source-key mapping drifted/);
});
test("same source keys but changed cargo, shift, or observations fails closed",async()=>{
 for(const change of [
  {descripcioncargo:"MAESTRO DE GRADO"},{turno:"N"},
  {observaciones:"Texto del aviso actualizado"}
 ]){
  const first=data(),second=deep(first);
  Object.assign(second.QUILMES[0],change);
  await assert.rejects(()=>audit(fromDataset(first,second)),/projected content drifted/);
 }
});
test("legitimate cross-run source count change is rejected rather than reported as stable",async()=>{
 const first=data(),second=deep(first);
 second.QUILMES.push(offer("QUILMES",2,30002));
 await assert.rejects(()=>audit(fromDataset(first,second)),/district count changed/);
});
test("missing or incomplete source capture never becomes safe for promotion",async()=>{
 const s=fromDataset(data());
 const broken={readDistrict:async district=>{
  const result=await s.readDistrict(district);
  return district==="AVELLANEDA"?{...result,totalBruto:result.totalBruto+1}:result;
 }};
 await assert.rejects(()=>audit(broken),/incomplete district capture/);
});
test("zero offers in one district still requires both independent source passes",async()=>{
 const dataset=data();dataset.QUILMES=[];
 const s=fromDataset(dataset);
 const report=await audit(s);
 assert.equal(s.calls(),6);
 assert.equal(report.global_distinct_worker_keys,4);
 assert.equal(report.audited_districts[2].published_count,0);
});
test("reject duplicate district names, less than 2 districts and malformed input",async()=>{
 for(const list of [["AVELLANEDA"],["QUILMES","QUILMES"],["", "QUILMES"],[]]){
  await assert.rejects(()=>auditGlobalPublishedKeys({
   districts:list,readDistrict:()=>{},keyFromOffer:key
  }),/Invalid global key audit configuration/);
 }
});
test("no records, IDs, hashes or PII in successful report",async()=>{
 const dataset=data();dataset.QUILMES[0].observaciones="fake@example.com";
 const report=await audit(fromDataset(dataset));
 const json=JSON.stringify(report);
 assert.doesNotMatch(json,/example\.com|10001|30001|SOLR_FAKE|sha256/);
 assert.equal(report.output_contains_no_ids_keys_hashes_or_offer_text,true);
 assert.equal(report.production_modified,false);
 assert.equal(report.deploy_authorized,false);
});
