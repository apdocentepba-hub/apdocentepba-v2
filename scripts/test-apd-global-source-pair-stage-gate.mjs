import test from "node:test";
import assert from "node:assert/strict";
import {prepareGlobalSourcePairsForLab} from "./apd-global-source-pair-stage-gate.mjs";
const x=(id,key)=>({id,source_offer_key:key});
const original=()=>[
 {district:"LA MATANZA",sourceTotal:2,pairs:[x("SOLR_A1","D_1001"),x("SOLR_A2","D_1002")]},
 {district:"AVELLANEDA",sourceTotal:1,pairs:[x("SOLR_B1","D_2001")]},
 {district:"QUILMES",sourceTotal:0,pairs:[]}
];
const copy=v=>structuredClone(v);
const run=(first,second=copy(first))=>prepareGlobalSourcePairsForLab({first,second});
test("two complete global snapshots and pair mapping enable isolated staging only",()=>{
 const gate=run(original());
 assert.equal(gate.summary.total_worker_keys,3);
 assert.equal(gate.summary.staging_ready_districts,2);
 assert.equal(gate.summary.complete_source_passes,2);
 assert.deepEqual(gate.pairsForIsolatedStaging("LA MATANZA",["D_1002"]),[
  x("SOLR_A1","D_1001"),x("SOLR_A2","D_1002")
 ]);
 assert.equal(gate.summary.deploy_authorized,false);
});
test("second capture may enumerate districts or IDs in different order",()=>{
 const first=original(),second=copy(first).reverse();
 second.forEach(row=>row.pairs.reverse());
 assert.equal(run(first,second).summary.total_source_ids,3);
});
test("same key claimed across different districts fails before any staging",()=>{
 const first=original();first[1].pairs[0].source_offer_key="D_1001";
 assert.throws(()=>run(first),/source-ID or Worker-key collision/);
});
test("identical Solr ID with different Worker keys in two districts fails",()=>{
 const first=original();first[1].pairs[0].id="SOLR_A1";
 assert.throws(()=>run(first),/source-ID or Worker-key collision/);
});
test("duplicate key or Solr ID within district fails",()=>{
 for(const key of ["id","source_offer_key"]){
  const first=original();
  first[0].pairs[1][key]=first[0].pairs[0][key];
  assert.throws(()=>run(first),/source-ID or Worker-key collision/);
 }
});
test("same source count but changed ID or remapped source key rejects second pass",()=>{
 const first=original(),second=copy(first);
 second[0].pairs[0].id="SOLR_REPLACED";
 assert.throws(()=>run(first,second),/Solr ID set drifted/);
 const third=copy(first);
 third[0].pairs[0].source_offer_key="D_9999";
 assert.throws(()=>run(first,third),/Worker-key mapping drifted/);
});
test("missing district, changed count, incomplete sourceTotal are hard errors",()=>{
 const first=original();
 assert.throws(()=>run(first,first.slice(0,2)),/source total or district set drifted/);
 const second=copy(first);second[0].pairs.pop();second[0].sourceTotal=1;
 assert.throws(()=>run(first,second),/source total or district set drifted|district source count drifted/);
 const third=copy(first);third[0].sourceTotal=3;
 assert.throws(()=>run(first,third),/incomplete or invalid district source/);
});
test("staging key absent from verified source and repeated staged keys rejected",()=>{
 const gate=run(original());
 assert.throws(()=>gate.pairsForIsolatedStaging("LA MATANZA",["D_9999"]),/not in source/);
 assert.throws(()=>gate.pairsForIsolatedStaging("LA MATANZA",["D_1001","D_1001"]),/not in source/);
 assert.throws(()=>gate.pairsForIsolatedStaging("QUILMES",["D_9999"]),/unknown or empty district/);
 assert.throws(()=>gate.pairsForIsolatedStaging("LA MATANZA",[]),/invalid staged key subset/);
});
test("reject pair objects with extraneous fields, PII or illegal key formats",()=>{
 const first=original();first[0].pairs[0].email="PRIVATE_FAKE";
 assert.throws(()=>run(first),/malformed ID\/Worker-key pair/);
 const second=original();second[1].pairs[0].source_offer_key="SOLR_B1";
 assert.throws(()=>run(second),/rejected source ID\/Worker-key mapping/);
 const third=original();third[1].pairs[0].id=" TEST ";
 assert.throws(()=>run(third),/rejected source ID\/Worker-key mapping/);
});
test("no private mapping is JSON-serializable or exposed as plain properties",()=>{
 const gate=run(original());
 const report=JSON.stringify(gate);
 assert.deepEqual(Object.keys(gate),["summary","pairsForIsolatedStaging"]);
 assert.doesNotMatch(report,/SOLR_A|SOLR_B|D_1001|D_2001|email|PRIVATE_FAKE/);
 assert.equal(gate.summary.source_content_hashes_checked,false);
});
test("zero-source district is audited but cannot accidentally stage or prune",()=>{
 const gate=run(original());
 assert.equal(gate.summary.districts_checked,3);
 assert.throws(()=>gate.pairsForIsolatedStaging("QUILMES",[]),
  /unknown or empty district/);
});
test("reject non-array captures, duplicate/invalid districts, oversized mappings",()=>{
 const base=original();
 for(const x of [null,[],[base[0],base[0]],[{...base[0],district:"quILMES"},base[1]],
   [{...base[0],sourceTotal:10001},base[1]]]){
  assert.throws(()=>prepareGlobalSourcePairsForLab({first:x,second:copy(base)}));
 }
});
