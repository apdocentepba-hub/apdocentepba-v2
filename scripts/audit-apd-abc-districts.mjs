/* Una lectura agregada del portal ABC, sin descargar ofertas individuales.
 * Referencia APD fechada y guardada; no accede a Supabase ni modifica producción.
 */
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync,existsSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {assessDistrictCoverage} from "./apd-abc-district-assessment.mjs";

const source="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const url=new URL(source);
for(const [k,v] of Object.entries({
 q:'estado:"Publicada"',rows:"0",start:"0",wt:"json",facet:"true",
 "facet.field":"descdistrito","facet.limit":"-1","facet.mincount":"1"
}))url.searchParams.set(k,v);
const ctrl=new AbortController();
const timeout=setTimeout(()=>ctrl.abort(),16000);
let body;
try{
 const res=await fetch(url,{method:"GET",credentials:"omit",redirect:"error",signal:ctrl.signal,cache:"no-store",headers:{Accept:"application/json"}});
 assert.equal(res.status,200,"ABC HTTP "+res.status);
 const raw=new TextDecoder("iso-8859-1").decode(await res.arrayBuffer());
 assert.ok(raw.length<200000,"Unexpected size of aggregated ABC response");
 body=JSON.parse(raw);
} finally {clearTimeout(timeout);}
const response=body?.response;
assert.ok(Number.isSafeInteger(response?.numFound)&&response.numFound>=0);
assert.deepEqual(response.docs,[],"rows=0 must not download offer records");
const field=body?.facet_counts?.facet_fields?.descdistrito;
assert.ok(Array.isArray(field)&&field.length%2===0,"ABC district faceting unavailable");
const buckets=[];
for(let i=0;i<field.length;i+=2)buckets.push({name:field[i],count:field[i+1]});

const snapshot=JSON.parse(readFileSync("audits/apd_scan_district_reference_20261102.json","utf8"));
const earlier=resolve("tmp/apd-abc-coverage-audit/report.json");
let bracket=null;
if(existsSync(earlier)){
  const prior=JSON.parse(readFileSync(earlier,"utf8"));
  bracket={
    before_count:prior.abc?.before_count,
    after_count:prior.abc?.after_count,
    before_at_utc:prior.abc?.before_at_utc,
    after_at_utc:prior.abc?.after_at_utc
  };
}
const report=assessDistrictCoverage({
  snapshot,facet:{numFound:response.numFound,buckets},
  bracket,observedAt:new Date().toISOString()
});
const dest=resolve("tmp/apd-abc-coverage-audit/district-report.json");
mkdirSync(dirname(dest),{recursive:true});
writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({
  report_path:"tmp/apd-abc-coverage-audit/district-report.json",
  abc_published_at_observation:report.abc.numFound,
  abc_districts:report.abc.bucket_count,
  apd_captured_at_scan:report.apd.captured_total,
  apd_reference_age_minutes:report.apd.age_minutes,
  abc_bracketed_count_stable:report.abc.bracketed_count_stable,
  unmatched_districts:report.reconciliation.unknown_abc_districts,
  classification:report.reconciliation.diagnostic_classification,
  caveat:"Diferencias NO equivalen a ofertas o cargos perdidos; comparación de dos referencias temporales."
},null,2));
