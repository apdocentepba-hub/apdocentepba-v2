/* Auditoría pública del contrato real Solr que utiliza el escáner.
 * 12 GET mínimos (rows=0); no descargan ofertas ni acceden a usuarios.
 * Sin modificar Supabase, Cloudflare ni catálogo. No se ejecuta en cron.
 */
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {apdSourceDistrictForCatalog} from "../worker-live/apd_scanner_source_district_alias_candidate.mjs";

const catalogNames=["MATANZA","LAS HERAS","NUEVE DE JULIO","GENERAL LAMADRID",
  "HIPOLITO YRIGOYEN","JUAREZ"];
const base="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const safeString=s=>typeof s==="string"&&s.length>0&&s.length<100&&/^[A-Z0-9 ]+$/.test(s);
async function count(district){
  assert.ok(safeString(district),"Invalid query district");
  const query='descdistrito:"'+district.replace(/(["\\])/g,"\\$1")+'" AND estado:"Publicada"';
  const url=new URL(base);
  url.searchParams.set("q",query);
  url.searchParams.set("rows","0");
  url.searchParams.set("start","0");
  url.searchParams.set("wt","json");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),16000);
  try{
    const response=await fetch(url,{method:"GET",redirect:"error",credentials:"omit",
      cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}});
    assert.equal(response.status,200,"ABC returned HTTP "+response.status);
    const content=new TextDecoder("iso-8859-1").decode(await response.arrayBuffer());
    assert.ok(content.length<200000,"Unexpectedly large count response");
    const payload=JSON.parse(content);
    assert.ok(Number.isSafeInteger(payload?.response?.numFound)&&payload.response.numFound>=0);
    assert.ok(Array.isArray(payload.response.docs)&&payload.response.docs.length===0,
      "Contract only permits rows=0 (no individual offers)");
    return {count:payload.response.numFound,at:new Date().toISOString()};
  } finally {clearTimeout(timer);}
}
const results=[];
for(const catalogName of catalogNames){
 const officialName=apdSourceDistrictForCatalog(catalogName);
 assert.notEqual(officialName,catalogName,"Expected explicitly documented alias");
 const legacy=await count(catalogName);
 const candidate=await count(officialName);
 results.push({
   catalog_name:catalogName,abc_source_name:officialName,
   legacy_query_count:legacy.count,candidate_query_count:candidate.count,
   previous_queried_at_utc:legacy.at,mapped_queried_at_utc:candidate.at,
   query_contract:"descdistrito quoted AND estado Publicada; rows=0",
   interpretation:"Counts at slightly different instants; may include closed-by-time records. No jobs-lost inference."
 });
}
const report={
 schema_version:1,completed_at_utc:new Date().toISOString(),districts_checked:results.length,
 requests_sent:results.length*2,documents_downloaded:0,
 candidate_nonzero_districts:results.filter(x=>x.candidate_query_count>0).length,
 legacy_nonzero_districts:results.filter(x=>x.legacy_query_count>0).length,
 query_errors:0,source:"ABC anonymous official index",
 note:"Only read-only counts; this test does not validate offer expiration, identify persons or modify the scanner.",
 districts:results
};
const file=resolve("tmp/apd-scanner-abc-dryrun/counts.json");
mkdirSync(dirname(file),{recursive:true});
writeFileSync(file,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(results.every(x=>x.candidate_query_count===0)){
 console.log("::error::All six mapped queries returned zero; review Solr semantics before deployment.");
 process.exitCode=1;
}
