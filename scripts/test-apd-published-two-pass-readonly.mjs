import test from "node:test";
import assert from "node:assert/strict";
import {auditPublishedTwoPass} from "./audit-apd-published-two-pass-readonly.mjs";
import {apdFetchPublishedOnlyDistrict} from "./apd-fetch-published-district-lab.mjs";

const mk=(i)=>({
 id:"SOLR_TEST_"+i,iddetalle:String(1000+i),idoferta:String(2000+i),
 descdistrito:"QUILMES",estado:"Publicada",
 escuela:"ESCUELA FICTICIA",descripcioncargo:"PRECEPTOR",
 descripcionarea:"PRECEPTOR",turno:"M",finoferta:"2099-01-01",
 observaciones:"Prueba sin datos personales",
 ult_movimiento:"2026-11-03T08:00:00Z"
});
const key=x=>"D_"+String(x.iddetalle);
const copied=x=>JSON.parse(JSON.stringify(x));
const complete=docs=>({docs,totalBruto:docs.length,totalFiltrado:docs.length});
function reader(first,second){
 let calls=0;
 const readDistrict=async district=>{
  assert.equal(district,"QUILMES");
  calls++;
  return complete(copied(calls===1?first:second));
 };
 return {readDistrict,calls:()=>calls};
}
const audit=readerFunc=>auditPublishedTwoPass({
 district:"QUILMES",readDistrict:readerFunc,keyFromOffer:key
});
test("identical full manifests pass and return aggregate counters only",async()=>{
 const docs=[mk(1),mk(2),mk(3)];
 const source=reader(docs,docs);
 const result=await audit(source.readDistrict);
 assert.equal(source.calls(),2);
 assert.equal(result.published_count_verified,3);
 assert.equal(result.passes_completed,2);
 assert.equal(result.projected_offer_content_stable,true);
 assert.doesNotMatch(JSON.stringify(result),/SOLR_TEST_|D_100|Prueba sin datos/);
});
test("array order and document key enumeration order do not cause false drift",async()=>{
 const docs=[mk(1),mk(2)];
 const shuffled=copied([...docs].reverse()).map(row=>
  Object.fromEntries(Object.entries(row).reverse()));
 assert.equal((await audit(reader(docs,shuffled).readDistrict))
  .source_id_mapping_stable,true);
});
test("same numFound, one Solr ID replaced MUST reject",async()=>{
 const first=[mk(1),mk(2)];
 const second=[mk(1),mk(3)];
 await assert.rejects(()=>audit(reader(first,second).readDistrict),
  /Source ID set changed at equal count/);
});
test("same Solr ID, changed Worker source key MUST reject",async()=>{
 const first=[mk(1),mk(2)],second=copied(first);
 second[1].iddetalle="900009";
 await assert.rejects(()=>audit(reader(first,second).readDistrict),
  /Worker key mapping changed at equal count/);
});
test("same IDs/keys/count but cargo or shift changed MUST reject",async()=>{
 for(const change of [
  {descripcioncargo:"MATEMATICA"},{turno:"N"},
  {finoferta:"2099-01-03"},{observaciones:"CAMBIÓ EL AVISO"}
 ]){
  const first=[mk(1),mk(2)],second=copied(first);
  Object.assign(second[1],change);
  await assert.rejects(()=>audit(reader(first,second).readDistrict),
   /Projected offer content changed at equal count/);
 }
});
test("changed numFound between passes MUST reject",async()=>{
 await assert.rejects(()=>audit(reader([mk(1)],[mk(1),mk(2)]).readDistrict),
  /Published source count changed between passes/);
});
test("truncated second pass rejects, not a false zero alerts",async()=>{
 let pass=0;
 const fn=async()=>{
  pass++;
  const docs=[mk(1)];
  return pass===1?complete(docs):{docs,totalBruto:2,totalFiltrado:1};
 };
 await assert.rejects(()=>audit(fn),/Incomplete two-pass source capture/);
});
test("invalid source identity or duplicate IDs on pass 2 fail closed",async()=>{
 const first=[mk(1),mk(2)];
 const duplicate=[mk(1),mk(1)];
 await assert.rejects(()=>audit(reader(first,duplicate).readDistrict),
  /Bad source identity/);
});
test("returned data cannot contain source keys, hashes, full text or raw offer bodies",async()=>{
 const data=[mk(1)];data[0].observaciones="privado@example.com";
 const report=await audit(reader(data,data).readDistrict);
 const serialized=JSON.stringify(report);
 assert.doesNotMatch(serialized,/privado|example|sha256|SOLR_TEST|1001/);
 assert.deepEqual(Object.keys(report).sort(),[
  "district","no_ids_keys_digests_or_observations_returned",
  "no_production_writes","passes_completed","production_deploy_authorized",
  "projected_offer_content_stable","published_count_verified",
  "source_id_mapping_stable"
 ].sort());
});
test("two-pass audit exercises real projected cursor reader via mocked ABC pages",async()=>{
 let pass=0;
 const documents=[mk(1),mk(2),mk(3)];
 const fakeHttp=async(url,opts)=>{
  assert.equal(opts.method,"GET");
  assert.equal(opts.credentials,"omit");
  const cursor=url.searchParams.get("cursorMark");
  if(cursor==="*")pass++;
  const offset=cursor==="*"?0:Number(cursor.slice(1));
  const count=Number(url.searchParams.get("rows"));
  const subset=documents.slice(offset,offset+count);
  const out={
   response:{numFound:documents.length,docs:subset},
   nextCursorMark:subset.length?"C"+(offset+subset.length):cursor
  };
  return {ok:true,status:200,arrayBuffer:async()=>new TextEncoder()
   .encode(JSON.stringify(out)).buffer};
 };
 const readDistrict=district=>apdFetchPublishedOnlyDistrict({
  district,fetchImpl:fakeHttp,
  normalizeDistrict:s=>String(s).toUpperCase(),
  districtVariants:s=>[s],escapeSolr:s=>s,keyFromOffer:key,
  rows:2,maxPages:3
 });
 const report=await audit(readDistrict);
 assert.equal(pass,2,"Both cursor passes must begin at '*' independently");
 assert.equal(report.published_count_verified,3);
});
