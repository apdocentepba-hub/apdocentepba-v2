/* Control público de conteos; máximo 3 GET anónimos, sin datos individuales.
 * Lee ABC antes y después del estado del Worker. Solo emite JSON agregado.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync, writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {assessCoverage} from "./apd-abc-coverage-assessment.mjs";

const abc = new URL("https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select");
abc.searchParams.set("q",'estado:"Publicada"');
abc.searchParams.set("wt","json");
abc.searchParams.set("rows","0");
abc.searchParams.set("start","0");
const source=readFileSync("app_v2.js","utf8");
const match=source.match(/^const API_URL = "(https:\/\/[^"]+)";/m);
assert.ok(match,"Missing canonical APDocente Worker origin");
const worker = new URL(match[1]);
assert.equal(worker.protocol,"https:");
assert.match(worker.hostname,/^[a-z0-9-]+\.apdocentepba\.workers\.dev$/);
assert.equal(worker.pathname,"/");
const stateUrl=new URL("/api/provincia/backfill-status",worker);
const allowedOrigins = new Set([abc.origin,worker.origin]);

async function requestJson(url){
  assert.ok(allowedOrigins.has(url.origin),"Unexpected third-party destination");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(url,{
      method:"GET",signal:controller.signal,redirect:"error",
      cache:"no-store",credentials:"omit",
      headers:{"Accept":"application/json"}
    });
    assert.equal(response.status,200,"Public GET error "+response.status);
    const size=Number(response.headers.get("content-length")||0);
    assert.ok(size<1000000,"Unexpectedly large aggregated response");
    const body=await response.json();
    return {body,at:new Date().toISOString()};
  } finally {clearTimeout(timer);}
}
function parseAbc(data){
 const value=data?.response?.numFound;
 assert.ok(typeof value==="number" && Number.isSafeInteger(value)&&value>=0,
   "ABC did not return an integer count");
 assert.ok(Array.isArray(data?.response?.docs)&&data.response.docs.length===0,
   "ABC must return zero offer documents");
 return value;
}
const observedAt = new Date().toISOString();
const before=await requestJson(abc);
const workerResult=await requestJson(stateUrl);
const after=await requestJson(abc);
assert.equal(workerResult.body?.ok,true,"Worker scan state unavailable");
const report=assessCoverage({
 abcBefore:{count:parseAbc(before.body),at:before.at},
 abcAfter:{count:parseAbc(after.body),at:after.at},
 scan:workerResult.body,
 observedAt:new Date().toISOString()
});
report.worker_origin=worker.origin;
report.source_name="Portal ABC, endpoint anónimo de recuento Publicada";
const dest=resolve("tmp/apd-abc-coverage-audit/report.json");
mkdirSync(dirname(dest),{recursive:true});
writeFileSync(dest,JSON.stringify(report,null,2)+"\n","utf8");
console.log(JSON.stringify(report,null,2));
if(report.diagnostic_classification==="ABC_CAMBIO_DURANTE_LECTURA" ||
   report.diagnostic_classification==="CAPTURA_ANTERIOR_NO_COMPARABLE"){
 console.log("::notice::Las cifras tienen distinta referencia temporal. No atribuir diferencias a ofertas perdidas.");
}
if(report.diagnostic_classification==="BARRIDO_NO_VALIDADO"){
 console.log("::warning::El barrido no está completo o sus fechas son inválidas: no hay diferencia numérica validada.");
}
