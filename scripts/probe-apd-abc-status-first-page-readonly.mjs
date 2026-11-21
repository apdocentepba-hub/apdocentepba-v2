/* Anonymous ABC public source audit: only first 200 latest records in two
 * districts. Never logs or saves original records, IDs, names or endpoints
 * containing user sessions. Does not alter production.
 */
import assert from "node:assert/strict";
const endpoint="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
for(const district of ["AVELLANEDA","QUILMES"]){
 const params=new URLSearchParams({
  q:'(descdistrito:"'+district+'")',rows:"200",start:"0",
  wt:"json",sort:"ult_movimiento desc"
 });
 const response=await fetch(endpoint+"?"+params.toString(),{
  method:"GET",redirect:"error",signal:AbortSignal.timeout(20000),
  headers:{
   "accept":"application/json, text/javascript, */*; q=0.01",
   "user-agent":"Mozilla/5.0",
   "referer":"http://servicios2.abc.gob.ar/",
   "origin":"http://servicios2.abc.gob.ar"
  }
 });
 assert.equal(response.status,200,"ABC source HTTP "+response.status);
 const buffer=await response.arrayBuffer();
 assert.ok(buffer.byteLength>0&&buffer.byteLength<3*1024*1024,"ABC payload size");
 const payload=JSON.parse(new TextDecoder("iso-8859-1").decode(buffer));
 const docs=payload?.response?.docs;
 assert.ok(Array.isArray(docs)&&docs.length<=200,"ABC source docs malformed");
 const counts={PUBLICADA:0,DESIGNADA:0,ANULADA:0,DESIERTA:0,CERRADA:0,FINALIZADA:0,NO_VIGENTE:0,OTHER:0,MISSING:0};
 for(const d of docs){
  const raw=String(d?.estado||d?.estado_oferta||d?.estado_actual||"").trim().toUpperCase();
  const value=raw==="NO VIGENTE"?"NO_VIGENTE":raw;
  counts[value in counts?value:raw?"OTHER":"MISSING"]++;
 }
 console.log("APD_ABC_STATUS_FIRST_PAGE "+JSON.stringify({
  district,records_in_first_page:docs.length,
  source_num_found:Number(payload.response?.numFound??-1),
  statuses:counts,
  published_in_first_page:counts.PUBLICADA,
  query_limit:"first 200 records only, not the district total",
  source_read_only:true,account_sessions_used:false
 }));
}
