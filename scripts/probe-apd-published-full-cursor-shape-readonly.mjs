/* Public ABC published-offer cursor shape feasibility (not deployable).
 * Two GETs total, one per district; prints field names and aggregate counts
 * only, NEVER document values, IDs, emails or tokens.
 */
import {performance} from "node:perf_hooks";
const districts=["LA MATANZA","AVELLANEDA"];
const endpoint="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const required=["id","iddetalle","idoferta","descdistrito","estado",
 "descripcioncargo","descripcionarea","descescuela","turno","ult_movimiento"];
const observations=[];
try{
 for(const district of districts){
  const url=new URL(endpoint);
  url.searchParams.set("q",`descdistrito:"${district}" AND estado:"Publicada"`);
  url.searchParams.set("rows","1");
  url.searchParams.set("cursorMark","*");
  url.searchParams.set("sort","id asc");
  url.searchParams.set("wt","json");
  // No fl parameter: request exactly the source's normal full-document shape.
  const start=performance.now();
  const res=await fetch(url,{
   method:"GET",credentials:"omit",redirect:"error",
   headers:{"accept":"application/json, text/javascript, */*; q=0.01"},
   signal:AbortSignal.timeout(15000)
  });
  if(!res.ok)throw Error("ABC cursor HTTP "+res.status);
  const data=JSON.parse(new TextDecoder("iso-8859-1").decode(await res.arrayBuffer()));
  if(!Array.isArray(data?.response?.docs)||
     !Number.isInteger(data?.response?.numFound)||
     typeof data?.nextCursorMark!=="string")
    throw Error("Missing mandatory full-cursor response fields");
  const item=data.response.docs[0]??null;
  const keys=item&&typeof item==="object" ? Object.keys(item).sort() : [];
  observations.push({
   district,published_num_found:data.response.numFound,
   elapsed_ms:Math.round((performance.now()-start)*10)/10,
   response_document_count:data.response.docs.length,
   field_count:keys.length,
   field_names:keys,
   expected_field_presence:Object.fromEntries(required.map(k=>[k,keys.includes(k)])),
   cursor_mark_returned:true,
   partial_results_reported:data?.responseHeader?.partialResults===true,
   individual_record_values_logged:false
  });
 }
 console.log(JSON.stringify({
  purpose:"read-only shape feasibility for full published-offer cursor",
  requests_sent:2,observations,credentials:false,
  writes:false,not_an_end_to_end_scanner_test:true,
  no_complete_cursor_verified:true,
  no_deployment_authorization:true
 },null,2));
}catch(err){
 console.warn(JSON.stringify({
  purpose:"published cursor feasibility unavailable",
  error_type:err?.name||"Error",
  safe_message:String(err?.message||"unknown").slice(0,170),
  no_offers_absence_inferred:true,credentials:false,writes:false
 }));
}
