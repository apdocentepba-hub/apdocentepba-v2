import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeObservationRisk} from "./apd-public-observation-risk-readonly.mjs";
test("observation privacy screen outputs only aggregate counts and size bands",()=>{
 const fixture=[{observaciones:"Escuela de práctica"},
  {observaciones:"No devolver datos: docente@example.com"},
  {observaciones:"DNI 12345678"},
  {observaciones:"CUIL 20-12345678-7"},
  {observaciones:"CELULAR consultar a secretaría"},
  {observaciones:"x".repeat(600)},
  {observaciones:""},{observaciones:null}];
 const result=summarizeObservationRisk(fixture);
 assert.equal(result.documents_checked,8);
 assert.equal(result.nonempty_observations,6);
 assert.equal(result.possible_email,1);
 assert.equal(result.possible_personal_identifier,2);
 assert.equal(result.possible_phone_reference,1);
 assert.equal(result.observations_over_500_chars,1);
 assert.equal(result.largest_observation_char_band,"501-1000");
 assert.equal(result.no_observation_values_returned,true);
 assert.doesNotMatch(JSON.stringify(result),/docente@example.com|12345678|secretar/i);
});
test("zero suspect matches NEVER assert free text is safe",()=>{
 const result=summarizeObservationRisk([{observaciones:"Se solicita revisar la carpeta"}]);
 assert.equal(result.possible_personal_identifier,0);
 assert.equal(result.content_cannot_be_declared_private_by_regex_alone,true);
 assert.equal(result.production_use_authorized,false);
});
test("nontext observations counted separately and no raw content returned",()=>{
 const result=summarizeObservationRisk([{observaciones:["SENSITIVE_FAKE"]}]);
 assert.equal(result.observations_nontext,1);
 assert.equal(result.nonempty_observations,0);
 assert.doesNotMatch(JSON.stringify(result),/SENSITIVE_FAKE/);
});
test("driver never exports individual observations or requests personal data",()=>{
 const code=readFileSync("scripts/probe-apd-public-observations-readonly.mjs","utf8");
 assert.match(code,/fl:"observaciones"/);
 assert.match(code,/credentials:"omit"/);
 assert.doesNotMatch(code,/method:"POST"|cuilautor|reemp_cuil|supabase|\.writeFileSync\(/);
});
