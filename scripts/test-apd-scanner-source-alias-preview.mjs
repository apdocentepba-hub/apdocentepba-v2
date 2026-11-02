import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {apdSourceDistrictForCatalog as sourceFor} from "../worker-live/apd_scanner_source_district_alias_candidate.mjs";
import {buildDistrictSourceAliasPreview} from "./build-apd-scanner-source-alias-preview.mjs";

const normalize=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const catalogue=["MATANZA","LAS HERAS","NUEVE DE JULIO","GENERAL LAMADRID","HIPOLITO YRIGOYEN","JUAREZ"];
const abc=["LA MATANZA","GENERAL LAS HERAS","9 DE JULIO","GENERAL LA MADRID","HIPOLITO IRIGOYEN","BENITO JUAREZ"];
test("source mapping exactly matches six documented official district aliases",()=>{
 for(let i=0;i<catalogue.length;i++){
   assert.equal(sourceFor(catalogue[i]),abc[i]);
   assert.notEqual(normalize(catalogue[i]),normalize(abc[i]));
   assert.equal(normalize(sourceFor(catalogue[i])),normalize(abc[i]));
 }
});
test("no silent alias for Capitán Sarmiento; legacy and unrelated names unchanged",()=>{
 for(const name of ["CORONEL SARMIENTO","GENERAL SARMIENTO","CAÑUELAS","AVELLANEDA","TIGRE","LA PLATA"]){
  assert.equal(sourceFor(name),name);
 }
 assert.notEqual(sourceFor("CORONEL SARMIENTO"),"CAPITAN SARMIENTO");
});
test("compiled Worker candidate is syntax-valid, gated, and affects only scanner query/filter/pruning",()=>{
 const live=readFileSync("worker-live/worker_hotfix.js","utf8");
 const alias=readFileSync("worker-live/apd_scanner_source_district_alias_candidate.mjs","utf8");
 const preview=buildDistrictSourceAliasPreview(live,alias);
 assert.equal((preview.match(/APD_DISTRICT_SOURCE_ALIASES_ENABLED/g)||[]).length,2);
 assert.equal((preview.match(/function apdSourceDistrictForCatalog\(/g)||[]).length,1);
 assert.ok(!live.includes("APD_DISTRICT_SOURCE_ALIASES_ENABLED"));
 assert.match(preview,/const queryDistrict = aliasesEnabled \? apdSourceDistrictForCatalog\(distritoAPD\) : distritoAPD;/);
 assert.match(preview,/norm\(doc\?\.descdistrito \|\| ""\) === norm\(queryDistrict\)/);
 assert.match(preview,/canonicalDistrict \? norm\(canonicalDistrict\) : norm\(oferta\.descdistrito \|\| ""\)/);
 assert.match(preview,/env\?\.APD_DISTRICT_SOURCE_ALIASES_ENABLED === "true"/);
 assert.match(preview,/const deletePath = "apd_ofertas_global_current\?distrito=eq\."/);
 assert.equal((preview.match(/async function fetchAPDDistrictBatch\(/g)||[]).length,1);
 assert.throws(()=>buildDistrictSourceAliasPreview(preview,alias),/already integrated/);
 const check=spawnSync(process.execPath,["--input-type=module","--check"],{input:preview,encoding:"utf8",maxBuffer:4*1024*1024});
 assert.equal(check.status,0,check.stderr);
});
test("source filter correctly accepts alias labels only when flag is explicitly enabled",()=>{
 const docs=["LA MATANZA","GENERAL LAS HERAS","9 DE JULIO","BENITO JUAREZ"];
 for(const [i,doc] of docs.entries()){
  const cat=[catalogue[0],catalogue[1],catalogue[2],catalogue[5]][i];
  assert.notEqual(normalize(doc),normalize(cat),"Old scanner cannot match district label");
  assert.equal(normalize(doc),normalize(sourceFor(cat)),"Flag-enabled scanner must use real ABC label");
 }
});
test("no production or sensitive changes baked into candidate",()=>{
 const source=readFileSync("scripts/build-apd-scanner-source-alias-preview.mjs","utf8");
 assert.match(source,/tmp\/apd-scanner-alias-preview/);
 assert.doesNotMatch(source,/mcp__Supabase|SUPABASE_SERVICE_ROLE|process\.env\.[A-Z]|method:\s*"POST"/);
});
