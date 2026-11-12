/* ABC published-state Solr filter feasibility: TWO public read-only requests.
 * No user sessions, credentials, messages or DB updates.
 * Not an approval to change the Worker query.
 */
import assert from "node:assert/strict";
const endpoint="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
for(const district of ["AVELLANEDA","QUILMES"]){
 const params=new URLSearchParams({
  q:'(descdistrito:"'+district+'")',
  fq:'estado:"Publicada"',rows:"10",start:"0",wt:"json",
  sort:"ult_movimiento desc"
 });
 const r=await fetch(endpoint+"?"+params.toString(),{
  method:"GET",redirect:"error",signal:AbortSignal.timeout(20000),
  headers:{
   "accept":"application/json, text/javascript, */*; q=0.01",
   "user-agent":"Mozilla/5.0",
   "referer":"http://servicios2.abc.gob.ar/",
   "origin":"http://servicios2.abc.gob.ar"
  }
 });
 assert.equal(r.status,200,"ABC rejected estado filter");
 const bytes=await r.arrayBuffer();
 assert.ok(bytes.byteLength>0&&bytes.byteLength<1024*1024,"unexpected ABC filtered response size");
 const data=JSON.parse(new TextDecoder("iso-8859-1").decode(bytes));
 const docs=data?.response?.docs;
 assert.ok(Array.isArray(docs),"ABC returned no Solr docs array");
 const observed=docs.map(d=>String(d?.estado||d?.estado_oferta||d?.estado_actual||"").trim().toUpperCase());
 const allPublished=observed.every(v=>v==="PUBLICADA");
 assert.ok(allPublished,"Solr state filter returned not-published offers");
 console.log("APD_ABC_SOLR_PUBLISHED_FILTER "+JSON.stringify({
  district,
  published_num_found:Number(data?.response?.numFound??-1),
  sample_rows:docs.length,
  all_sample_rows_confirmed_published:allPublished,
  query_q_matches_worker:true,
  additional_filter:'estado:"Publicada"',
  query_read_only:true,
  no_authentication:true,
  changes_to_worker:false
 }));
}
