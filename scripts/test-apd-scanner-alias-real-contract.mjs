import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {buildDistrictSourceAliasPreview} from "./build-apd-scanner-source-alias-preview.mjs";
import {apdSourceDistrictForCatalog} from "../worker-live/apd_scanner_source_district_alias_candidate.mjs";

const compiled=buildDistrictSourceAliasPreview(
 readFileSync("worker-live/worker_hotfix.js","utf8"),
 readFileSync("worker-live/apd_scanner_source_district_alias_candidate.mjs","utf8"));
const labels=["MATANZA","LAS HERAS","NUEVE DE JULIO",
 "GENERAL LAMADRID","HIPOLITO YRIGOYEN","JUAREZ"];
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();
function extract(header,stop){
 const start=compiled.indexOf(header);
 const end=compiled.indexOf(stop,start);
 assert.ok(start>=0&&end>start,header+" function not found");
 return compiled.slice(start,end);
}
const fnSources=[
 extract("async function fetchAPDDistrictBatch(","\n__name(fetchAPDDistrictBatch"),
 extract("function buildGlobalSnapshotRow(","\n__name(buildGlobalSnapshotRow")
].join("\n");
function harness(){
 const queries=[];
 const ctx={
  TextDecoder, Date,URL,console,
  apdSourceDistrictForCatalog,
  norm,estadoOfertaEsPublicada:d=>norm(d.estado)==="PUBLICADA",
  ofertaVigente:d=>!d.expired,escaparSolr:x=>String(x).replace(/(["\\])/g,"\\$1"),
  buildSourceOfferKeyFromOferta:d=>"D_"+String(d.iddetalle),
  mapTurnoAPD:x=>x,normalizarCursoDivisionServidor:x=>x,
  fetch:async url=>{
    const q=new URL(url).searchParams.get("q");
    const name=/descdistrito:"([^"]+)"/.exec(q)?.[1]||"";
    queries.push({q,name});
    const doc={descdistrito:name,estado:"Publicada",iddetalle:"12345",idoferta:"54321",
      descripcioncargo:"PRUEBA",escuela:"SCHOOL",finoferta:"2099-12-31"};
    // Fake authoritative ABC: only the actual official labels have documents.
    const exists=labels.some(n=>norm(apdSourceDistrictForCatalog(n))===norm(name));
    const docs=exists?[doc]:[];
    return {ok:true,arrayBuffer:async()=>
      new TextEncoder().encode(JSON.stringify({response:{numFound:docs.length,docs}})).buffer};
  }
 };
 vm.createContext(ctx);
 vm.runInContext(fnSources,ctx,{timeout:1000});
 return {ctx,queries};
}
test("a strict source query with aliases enabled returns records from all six districts",async()=>{
 const {ctx,queries}=harness();
 for(const catalog of labels){
   const found=await ctx.fetchAPDDistrictBatch(catalog,0,1,150,true);
   assert.equal(found.docs.length,1,catalog);
   assert.equal(norm(found.docs[0].descdistrito),norm(apdSourceDistrictForCatalog(catalog)));
 }
 assert.equal(queries.length,6);
 assert.equal(queries.every(x=>x.q.includes('estado:"Publicada"')),true);
});
test("without the feature flag, existing mismatched queries do not invent hits",async()=>{
 const {ctx}=harness();
 for(const catalog of labels){
   const result=await ctx.fetchAPDDistrictBatch(catalog,0,1,150,false);
   assert.equal(result.docs.length,0,catalog);
 }
});
test("canonical storage keeps user-facing district and offer identity stable",async()=>{
 const {ctx}=harness();
 const result=await ctx.fetchAPDDistrictBatch("MATANZA",0,1,150,true);
 const doc=result.docs[0];
 const before=ctx.buildGlobalSnapshotRow(doc,"2026-11-02T00:00:00Z");
 const after=ctx.buildGlobalSnapshotRow(doc,"2026-11-02T00:00:00Z","MATANZA");
 assert.equal(before.distrito,"LA MATANZA");
 assert.equal(after.distrito,"MATANZA");
 assert.equal(before.source_offer_key,after.source_offer_key);
 assert.equal(after.raw.descdistrito,"LA MATANZA");
});
test("Capitán Sarmiento is deliberately not inferred from Coronel Sarmiento",()=>{
 assert.equal(apdSourceDistrictForCatalog("CORONEL SARMIENTO"),"CORONEL SARMIENTO");
 assert.equal(apdSourceDistrictForCatalog("GENERAL SARMIENTO"),"GENERAL SARMIENTO");
});
test("compiled candidate only, never alters active Worker or index",()=>{
 const live=readFileSync("worker-live/worker_hotfix.js","utf8");
 const page=readFileSync("index.html","utf8");
 assert.ok(!live.includes("APD_DISTRICT_SOURCE_ALIASES_ENABLED"));
 assert.ok(page.includes("radar_provincia_live_20261102.js?v=2"));
 assert.ok(!page.includes("apd_scanner_source_district_alias_candidate.mjs"));
});
