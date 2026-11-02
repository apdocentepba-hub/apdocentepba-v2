import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {apdSourceDistrictForCatalog} from "../worker-live/apd_scanner_source_district_alias_candidate.mjs";
const src=readFileSync("scripts/audit-apd-scanner-minimal-samples.mjs","utf8");
test("only three non-personal fields are projected",()=>{
 assert.match(src,/"fl","descdistrito,estado,finoferta"/);
 assert.match(src,/requestDistrict\(source_name,1\)/);
 assert.match(src,/requestDistrict\("CAPITAN SARMIENTO",0\)/);
 assert.match(src,/documents_stored_or_logged:0/);
 assert.match(src,/credentials:"omit"/);
 assert.doesNotMatch(src,/idoferta|iddetalle|cuil|dni|user_id|service_role|Authorization|method:"POST"/i);
});
test("all six aliases have distinct labels and Capitán Sarmiento remains unresolved",()=>{
 const six=["MATANZA","LAS HERAS","NUEVE DE JULIO","GENERAL LAMADRID","HIPOLITO YRIGOYEN","JUAREZ"];
 assert.equal(new Set(six.map(apdSourceDistrictForCatalog)).size,6);
 for(const k of six)assert.notEqual(apdSourceDistrictForCatalog(k),k);
 assert.equal(apdSourceDistrictForCatalog("CORONEL SARMIENTO"),"CORONEL SARMIENTO");
});
