/**
 * Lectura mínima del agregado de ofertas públicas ABC.
 * No descarga filas, documentos ni datos de docentes; evita endpoints autenticados.
 */
import assert from "node:assert/strict";
const API="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const target=new URL(API);
target.searchParams.set("q",'estado:"Publicada"');
target.searchParams.set("rows","0");
target.searchParams.set("start","0");
target.searchParams.set("wt","json");
const controller=new AbortController();
const deadline=setTimeout(()=>controller.abort(),15000);
try {
 const res=await fetch(target,{
   method:"GET",redirect:"error",signal:controller.signal,
   headers:{"Accept":"application/json","User-Agent":"APDocentePBA-count-audit/1.0"},
   cache:"no-store"
 });
 assert.equal(res.status,200,"ABC endpoint HTTP "+res.status);
 const data=await res.json();
 const response=data?.response;
 assert.ok(response&&typeof response==="object","ABC no devolvió una respuesta de conteo Solr");
 assert.ok(Number.isSafeInteger(response.numFound)&&response.numFound>=0,"Conteo ABC no verificable");
 assert.ok(Array.isArray(response.docs)&&response.docs.length===0,"La consulta de conteo no debe descargar ofertas");
 console.log(JSON.stringify({
   source:"ABC endpoint público de ofertas (consulta anónima, rows=0)",
   query:'estado:"Publicada"',
   observed_at_utc:new Date().toISOString(),
   published_count_source:response.numFound,
   project_scan_2026_11_02:2609,
   difference_vs_previous_scan:response.numFound-2609,
   caveat:"Conteos tomados en instantes distintos; ABC usa criterios propios de publicación y vigencia. Ningún dato privado descargado."
 },null,2));
} finally {
 clearTimeout(deadline);
}
