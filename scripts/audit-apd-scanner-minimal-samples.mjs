/* Minimal read-only ABC sample contract, without personal or offer identifiers.
 * Six rows=1 with field projection only: descdistrito, estado, finoferta.
 * One rows=0 for Capitán Sarmiento. Logs booleans and counts only.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {apdSourceDistrictForCatalog} from "../worker-live/apd_scanner_source_district_alias_candidate.mjs";
const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();
const labels=["MATANZA","LAS HERAS","NUEVE DE JULIO","GENERAL LAMADRID","HIPOLITO YRIGOYEN","JUAREZ"];
const origin="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
async function requestDistrict(label,rows){
 const url=new URL(origin);
 url.searchParams.set("q",'descdistrito:"'+label+'" AND estado:"Publicada"');
 url.searchParams.set("rows",String(rows));
 url.searchParams.set("start","0");
 url.searchParams.set("wt","json");
 url.searchParams.set("fl","descdistrito,estado,finoferta");
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const res=await fetch(url,{method:"GET",redirect:"error",credentials:"omit",cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}});
  assert.equal(res.status,200,"ABC HTTP "+res.status);
  const body=new TextDecoder("iso-8859-1").decode(await res.arrayBuffer());
  assert.ok(body.length<50000,"Unexpected oversized minimal result");
  const parsed=JSON.parse(body);
  assert.ok(Number.isSafeInteger(parsed?.response?.numFound) && parsed.response.numFound>=0);
  assert.ok(Array.isArray(parsed.response.docs)&&parsed.response.docs.length<=rows);
  return {numFound:parsed.response.numFound,docs:parsed.response.docs};
 }finally{clearTimeout(timeout);}
}
const results=[];
for(const catalog_name of labels){
 const source_name=apdSourceDistrictForCatalog(catalog_name);
 const result=await requestDistrict(source_name,1);
 const first=result.docs[0]||null;
 // Do not emit any document fields, names, IDs, or dates from the source.
 const match=first!==null&&normalize(first.descdistrito)===normalize(source_name);
 const status=first!==null&&normalize(first.estado)==="PUBLICADA";
 const finofertaType=first===null?"none":(typeof first.finoferta==="string"?"string":
   first.finoferta==null?"missing":"unexpected");
 results.push({catalog_name,source_name,numFound:result.numFound,
   one_projected_document_received:first!==null,
   sample_matches_source_district:match,
   sample_estado_publicada:status,
   finoferta_field_type:finofertaType});
 if(first!==null)assert.ok(match&&status,"Scanner would reject source label or status");
 if(result.numFound>0)assert.equal(result.docs.length,1,"ABC count has a missing first document");
}
const capitan=await requestDistrict("CAPITAN SARMIENTO",0);
assert.deepEqual(capitan.docs,[]);
const report={schema_version:1,generated_at_utc:new Date().toISOString(),
 documents_stored_or_logged:0,source:"ABC public index",
 requests_sent:7,source_label_samples:results,capitan_sarmiento_publicada_count:capitan.numFound,
 catalog_note:"Capitán Sarmiento is official municipality. Existing CORONEL/GENERAL SARMIENTO are NOT automatic aliases.",
 conclusion:"Confirms first projected source label/status only; does NOT validate closing-date filter, deduplication or notification delivery."};
const outfile=resolve("tmp/apd-scanner-sample-contract/report.json");
mkdirSync(dirname(outfile),{recursive:true});
writeFileSync(outfile,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
