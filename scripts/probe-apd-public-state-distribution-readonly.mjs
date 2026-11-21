/* Public ABC Solr zero-document facet probe.
 * Aggregated source offer state distribution ONLY: rows=0.
 * Four districts, <=4 GETs, no IDs, documents, personal data or writes.
 */
const endpoint="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const districts=["QUILMES","BERAZATEGUI","LOMAS DE ZAMORA","GENERAL SAN MARTIN"];
const allowed=["PUBLICADA","CERRADA","DESIGNADA","DESIERTA","ANULADA","FINALIZADA","NO VIGENTE"];
const results=[];
for(const district of districts){
 const url=new URL(endpoint);
 for(const [k,v] of Object.entries({
  q:`descdistrito:"${district}"`,rows:"0",wt:"json",
  facet:"true","facet.field":"estado","facet.mincount":"1"
 }))url.searchParams.set(k,v);
 try{
  const response=await fetch(url,{
   method:"GET",credentials:"omit",redirect:"error",
   signal:AbortSignal.timeout(15000),
   headers:{Accept:"application/json"}
  });
  if(!response.ok)throw Error("HTTP_"+response.status);
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength>100000)throw Error("Aggregate response too large");
  const json=JSON.parse(new TextDecoder("iso-8859-1").decode(buffer));
  if(!Array.isArray(json?.response?.docs)||json.response.docs.length!==0||
     !Number.isSafeInteger(json?.response?.numFound))
   throw Error("Source returned unexpected document payload");
  const fields=json?.facet_counts?.facet_fields?.estado;
  const states={};
  let counted=0;
  if(Array.isArray(fields)){
   for(let i=0;i+1<fields.length;i+=2){
    const key=String(fields[i]||"").trim().toUpperCase();
    const count=fields[i+1];
    if(!Number.isSafeInteger(count)||count<0)throw Error("Bad facet count");
    counted+=count;
    if(allowed.includes(key))states[key]=count;
   }
  }
  if(!Array.isArray(fields))throw Error("ABC facet unsupported");
  if(counted!==json.response.numFound)
   throw Error("Facet totals differ from ABC numFound");
  results.push({
   district,status:"AGGREGATES_OK",
   total_all_states:json.response.numFound,
   published_count_from_facet:states.PUBLICADA||0,
   selected_state_counts:states,
   other_states_count:counted-Object.values(states).reduce((a,b)=>a+b,0),
   zero_documents_downloaded:true
  });
 }catch(e){
  results.push({
   district,status:"AGGREGATES_UNAVAILABLE",
   issue_class:e?.name||"Error",
   no_missing_offers_inferred:true
  });
 }
}
console.log(JSON.stringify({
 audit:"ABC state distribution for four districts via Solr rows=0 facets",
 districts:results,total_get_requests:districts.length,
 no_user_identity_or_offer_ids_requested:true,
 no_offer_details_logged:true,no_writes:true,
 cannot_establish_why_previous_counts_changed:true
},null,2));
// A successful offline test cannot stand in for an unavailable live ABC observation.
if(results.some(row=>row?.status!=="AGGREGATES_OK"))process.exitCode=1;
