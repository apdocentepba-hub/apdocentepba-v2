/* Limited public GETs (exactly 2) for aggregate privacy risk; no credentials.
 * ONLY fl=observaciones, no IDs or personal columns, never print raw strings.
 */
import {summarizeObservationRisk} from "./apd-public-observation-risk-readonly.mjs";
const endpoint="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const districts=["LA MATANZA","AVELLANEDA"];
let completed=0;
try{
 const results=[];
 for(const district of districts){
  const url=new URL(endpoint);
  for(const [key,val] of Object.entries({
   q:`descdistrito:"${district}" AND estado:"Publicada"`,
   rows:"200",start:"0",wt:"json",fl:"observaciones"
  }))url.searchParams.set(key,val);
  const response=await fetch(url,{method:"GET",redirect:"error",credentials:"omit",
   signal:AbortSignal.timeout(15000),headers:{Accept:"application/json"}});
  if(!response.ok)throw Error("Public source HTTP "+response.status);
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength>400000)throw Error("Observation payload cap exceeded");
  const json=JSON.parse(new TextDecoder("iso-8859-1").decode(buffer));
  const docs=json?.response?.docs;
  const total=json?.response?.numFound;
  if(!Array.isArray(docs)||!Number.isSafeInteger(total)||
      total<0||docs.length!==total||docs.length>200)
   throw Error("Public source observations incomplete; do not infer privacy");
  const extra=docs.some(row=>!row||typeof row!=="object"||
    Object.keys(row).some(k=>k!=="observaciones"));
  if(extra)throw Error("Unexpected source fields returned");
  results.push({district,published_count:total,
    screening:summarizeObservationRisk(docs)});
  completed++;
 }
 console.log(JSON.stringify({
  scope:"Two public ABC districts, Published-only free-text field",
  completed_reads:completed,
  no_authentication:true,no_source_id_requested:true,
  no_raw_observation_values_logged:true,no_production_writes:true,
  results,not_a_privacy_clearance:true
 },null,2));
}catch(error){
 console.warn(JSON.stringify({
  scope:"Public observations aggregate privacy preflight",
  completed_reads:completed,
  error_name:error?.name||"Error",
  no_privacy_clearance:true,no_zero_offer_inference:true,
  no_raw_observation_values_logged:true,no_production_writes:true
 }));
}
