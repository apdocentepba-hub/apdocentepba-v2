import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessDistrictCoverage,normalizeDistrict} from "./apd-abc-district-assessment.mjs";
const reference=JSON.parse(readFileSync("audits/apd_scan_district_reference_20261102.json","utf8"));
const at="2026-11-02T17:21:40Z";
const bracket={before_count:20,after_count:20,before_at_utc:"2026-11-02T17:21:31Z",after_at_utc:"2026-11-02T17:21:36Z"};
function fake(overrides={}){
 const payload={
  snapshot:{
   schema_version:1,scope:"PROVINCIA_FULL",scan_mode:"current_published",
   scan_started_at:"2026-11-02T17:00:00Z",scan_finished_at:"2026-11-02T17:20:00Z",
   scan_districts_completed:137,scan_total_districts:137,
   scan_offers_processed:20,counts_sum:20,districts:[
      {name:"AVELLANEDA",abc_name:"AVELLANEDA",count:12},
      {name:"GENERAL SAN MARTIN",abc_name:"GENERAL SAN MARTIN",count:8},
      ...Array.from({length:135},(_,i)=>({name:"TEST-DISTRICT-"+i,abc_name:"TEST DISTRICT "+i,count:0}))
    ]
  },facet:{numFound:20,buckets:[{name:"AVELLANEDA",count:10},{name:"GENERAL SAN MARTÍN",count:10}]},bracket,observedAt:at
 };
 return assessDistrictCoverage({...payload,...overrides});
}
test("reference from real read-only Supabase groups all 2609 records once",()=>{
 assert.equal(reference.scope,"PROVINCIA_FULL");
 assert.equal(reference.scan_mode,"current_published");
 assert.equal(reference.scan_districts_completed,137);
 assert.equal(reference.scan_total_districts,137);
 assert.equal(reference.districts.length,137);
 assert.equal(reference.districts.reduce((n,x)=>n+x.count,0),2609);
 assert.equal(reference.zero_districts,15);
 assert.equal(reference.districts.filter(x=>x.count>0).length,122);
 assert.equal(new Set(reference.districts.map(d=>normalizeDistrict(d.abc_name))).size,137);
});
test("two readings of same total do not imply identical current offers",()=>{
 const out=fake();
 assert.equal(out.abc.numFound,20);
 assert.equal(out.abc.facet_sum,20);
 assert.equal(out.abc.bracketed_count_stable,true);
 assert.equal(out.reconciliation.unknown_abc_districts.length,0);
 assert.equal(out.reconciliation.diagnostic_classification,"CRITERIOS_DISTINTOS_AUN_SI_CERCANOS");
 assert.equal(out.reconciliation.matching_offers_or_lost_jobs_proven,false);
 assert.equal(out.private_records_accessed,false);
 assert.equal(out.districts.find(x=>x.district==="AVELLANEDA").delta_abc_minus_capture,-2);
 assert.equal(out.districts.find(x=>x.district==="GENERAL SAN MARTIN").delta_abc_minus_capture,2);
});
test("snapshot older than 15 min flagged without blaming missing offers",()=>{
 const out=fake({observedAt:"2026-11-02T17:55:00Z"});
 assert.equal(out.reconciliation.diagnostic_classification,"CAPTURA_APD_ANTERIOR");
 assert.equal(out.reconciliation.matching_offers_or_lost_jobs_proven,false);
});
test("ABC count changed after initial observation gets explicit warning",()=>{
 const out=fake({bracket:{...bracket,after_count:19}});
 assert.equal(out.reconciliation.diagnostic_classification,"ABC_CAMBIO_DURANTE_LECTURA");
 assert.equal(out.abc.bracketed_count_stable,false);
});
test("unknown ABC district is retained as aggregate and blocks confident match",()=>{
 const out=fake({facet:{numFound:22,buckets:[
  {name:"AVELLANEDA",count:10},{name:"GENERAL SAN MARTÍN",count:10},
  {name:"UNKNOWN ABC PLACE",count:2}
 ]},bracket:null});
 assert.equal(out.reconciliation.diagnostic_classification,"NOMBRES_ABC_NO_CONCILIADOS");
 assert.equal(out.reconciliation.unknown_abc_districts[0].count,2);
 assert.equal(out.reconciliation.abc_total_in_unmapped_districts,2);
});
test("facet errors and duplicate normalized names cannot pretend complete",()=>{
 assert.throws(()=>fake({facet:{numFound:22,buckets:[{name:"AVELLANEDA",count:12}]}}),/incomplete/);
 assert.throws(()=>fake({facet:{numFound:20,buckets:[
 {name:"AVELLANEDA",count:8},{name:"Avellaneda",count:2},
 {name:"GENERAL SAN MARTIN",count:10}
 ]}}),/ambiguous/);
 assert.throws(()=>fake({facet:{numFound:20,buckets:[{name:"",count:20}]}}),/invalid/);
});
test("invalid reference with missing districts or mismatched totals fails closed",()=>{
 const src=reference;
 assert.throws(()=>assessDistrictCoverage({
  snapshot:{...src,scan_offers_processed:2608},facet:{numFound:0,buckets:[]},observedAt:at
 }),/Invalid completed/);
 assert.throws(()=>fake({snapshot:{
   schema_version:1,scope:"PROVINCIA_FULL",scan_mode:"current_published",
   scan_started_at:"2026-11-02T17:00:00Z",scan_finished_at:"2026-11-02T17:20:00Z",
   scan_districts_completed:137,scan_total_districts:137,
   scan_offers_processed:20,counts_sum:20,districts:
      [{name:"AVELLANEDA",abc_name:"AVELLANEDA",count:20}]
 }}),/Invalid completed/);
});
test("only aggregate data is fetched, no credentials and no private rows",()=>{
 const src=readFileSync("scripts/audit-apd-abc-districts.mjs","utf8");
 assert.match(src,/facet.field/);
 assert.match(src,/descdistrito/);
 assert.match(src,/rows:"0"/);
 assert.match(src,/credentials:"omit"/);
 assert.match(src,/method:"GET"/);
 assert.doesNotMatch(src,/Bearer |SUPABASE_SERVICE_ROLE|method:"POST"|Authorization:/);
});
