import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessCoverage} from "./apd-abc-coverage-assessment.mjs";

const t="2026-11-02T16:00:10.000Z";
const abcBefore={count:2435,at:"2026-11-02T16:00:00.000Z"};
const abcAfter={count:2435,at:t};
const scan={
  ok:true,status:"finished",mode:"current_published",scope:"PROVINCIA_FULL",
  offers_processed:2609,total_districts:137,districts_completed:137,
  started_at:"2026-11-02T14:00:00.000Z",
  finished_at:"2026-11-02T15:55:00.000Z"
};
const check=(overrides={})=>assessCoverage({
  abcBefore,abcAfter,scan,observedAt:t,...overrides
});
test("near-time count mismatch is diagnostic only, not equivalent offer coverage",()=>{
 const report=check();
 assert.equal(report.diagnostic_classification,"CERCANOS_EN_TIEMPO_CRITERIOS_DISTINTOS");
 assert.equal(report.abc.count_stable_during_check,true);
 assert.equal(report.abc.rows_requested,0);
 assert.equal(report.apdocentepba.finished_scan_valid,true);
 assert.equal(report.apdocentepba.completed_districts,137);
 assert.equal(report.difference_abc_minus_scan,-174);
 assert.equal(report.same_time_and_same_criteria_confirmed,false);
 assert.equal(report.private_records_accessed,false);
 assert.match(report.interpretation,/vigencia/);
 assert.match(report.interpretation,/deduplicada/);
});
test("scan older than 15 min is flagged not comparable even with matching totals",()=>{
 const old={...scan,finished_at:"2026-11-02T07:33:18.692Z",
   started_at:"2026-11-02T03:01:16.615Z"};
 const report=check({scan:old,abcBefore:{...abcBefore,count:2609},
  abcAfter:{...abcAfter,count:2609}});
 assert.equal(report.diagnostic_classification,"CAPTURA_ANTERIOR_NO_COMPARABLE");
 assert.equal(report.difference_abc_minus_scan,0);
 assert.equal(report.same_time_and_same_criteria_confirmed,false);
 assert.ok(report.apdocentepba.age_at_first_abc_read_minutes>15);
});
test("ABC count changing across two reads prevents numeric mismatch assertions",()=>{
 const report=check({abcAfter:{...abcAfter,count:2420}});
 assert.equal(report.diagnostic_classification,"ABC_CAMBIO_DURANTE_LECTURA");
 assert.equal(report.difference_abc_minus_scan,null);
 assert.equal(report.abc.count_stable_during_check,false);
});
test("incomplete scan or wrong scope cannot imply missing published offers",()=>{
 for(const bad of [
   {...scan,status:"running"},
   {...scan,districts_completed:136},
   {...scan,scope:"OTRO"},
   {...scan,offers_processed:-1},
   {...scan,started_at:null},
   {...scan,finished_at:"error"}
 ]){
   const report=check({scan:bad});
   assert.equal(report.diagnostic_classification,"BARRIDO_NO_VALIDADO");
   assert.equal(report.difference_abc_minus_scan,null);
 }
});
test("future scan is not considered comparable to earlier ABC observations",()=>{
 const report=check({scan:{
  ...scan,started_at:"2026-11-02T16:30:00.000Z",
  finished_at:"2026-11-02T16:59:00.000Z"
 }});
 assert.equal(report.diagnostic_classification,"BARRIDO_NO_VALIDADO");
});
test("time-inverted and non-numeric responses fail fast",()=>{
 assert.throws(()=>check({abcBefore:{count:"2435",at:abcBefore.at}}),/Invalid ABC/);
 assert.throws(()=>check({abcBefore:{count:2435,at:"invalid"}}),/Invalid ABC/);
 assert.throws(()=>check({abcAfter:{count:2435,at:"2026-11-02T15:00:00Z"}}),/clock/);
 assert.throws(()=>check({observedAt:"n/a"}),/timestamp/);
});
test("network runner only makes three anonymous public GETs and contains no secrets",()=>{
 const script=readFileSync("scripts/audit-apd-abc-coverage-daily.mjs","utf8");
 assert.match(script,/rows","0"/);
 assert.match(script,/requestJson\(abc\)/g);
 assert.match(script,/requestJson\(stateUrl\)/);
 assert.match(script,/method:"GET"/);
 assert.match(script,/credentials:"omit"/);
 assert.doesNotMatch(script,/service_role|SUPABASE_SERVICE_ROLE|Bearer |Authorization:|method:"POST"|cookies/i);
 assert.match(script,/report\.json/);
 assert.doesNotMatch(script,/raw\.json|\.docs\.map\(/);
});
