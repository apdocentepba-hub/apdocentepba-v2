/* Agregados por distrito: ABC Solr rows=0 + referencia cerrada APD.
 * Nunca define una diferencia como "oferta perdida" ni igualdad de criterios.
 * Función pura, sin red, datos personales ni acceso a base de datos.
 */
export function normalizeDistrict(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
// Equivalencias documentadas con nomenclatura municipal bonaerense.
// NO convertir CAPITAN SARMIENTO en CORONEL SARMIENTO: no son nombres equivalentes.
const ABC_TO_CATALOG = new Map([
  ["LA MATANZA","MATANZA"],
  ["GENERAL LAS HERAS","LAS HERAS"],
  ["9 DE JULIO","NUEVE DE JULIO"],
  ["GENERAL LA MADRID","GENERAL LAMADRID"],
  ["HIPOLITO IRIGOYEN","HIPOLITO YRIGOYEN"],
  ["BENITO JUAREZ","JUAREZ"]
]);
const nonNegative = n => typeof n==="number"&&Number.isSafeInteger(n)&&n>=0;
const validTime = t => typeof t==="string"&&Number.isFinite(Date.parse(t));
export function assessDistrictCoverage({snapshot,facet,observedAt,bracket=null}) {
  if(!validTime(observedAt))throw Error("Invalid observation time");
  if(snapshot?.schema_version!==1||snapshot.scope!=="PROVINCIA_FULL"||
     snapshot.scan_mode!=="current_published"||
     !validTime(snapshot.scan_started_at)||!validTime(snapshot.scan_finished_at)||
     Date.parse(snapshot.scan_started_at)>Date.parse(snapshot.scan_finished_at)||
     Date.parse(snapshot.scan_finished_at)>Date.parse(observedAt)+60000||
     snapshot.scan_districts_completed!==snapshot.scan_total_districts||
     !nonNegative(snapshot.scan_offers_processed)||!Array.isArray(snapshot.districts)||
     snapshot.districts.length!==snapshot.scan_total_districts||
     snapshot.districts.length!==137||snapshot.counts_sum!==snapshot.scan_offers_processed){
    throw Error("Invalid completed APD reference snapshot");
  }
  const saved=new Map();
  let total=0,withOffers=0;
  for(const d of snapshot.districts){
    const key=normalizeDistrict(d.abc_name);
    if(!key||saved.has(key)||!nonNegative(d.count))throw Error("Invalid or duplicate APD district");
    saved.set(key,d);
    total+=d.count;if(d.count>0)withOffers++;
  }
  if(total!==snapshot.scan_offers_processed)throw Error("Reference district totals do not match scan");
  if(!facet||!nonNegative(facet.numFound)||!Array.isArray(facet.buckets)){
    throw Error("ABC facet response invalid");
  }
  const abc=new Map(), aliasesApplied=[];
  let sum=0;
  for(const pair of facet.buckets){
    const rawKey=normalizeDistrict(pair.name);
    const key=ABC_TO_CATALOG.get(rawKey)||rawKey;
    if(!key||abc.has(key)||!nonNegative(pair.count))throw Error("ABC facet labels invalid or ambiguous");
    abc.set(key,{name:pair.name,count:pair.count});
    if(key!==rawKey)aliasesApplied.push({abc_name:pair.name,catalog_key:key,count:pair.count});
    sum+=pair.count;
  }
  if(sum!==facet.numFound)throw Error("ABC facet is incomplete or multi-valued; cannot compare");
  const unmatched=[...abc.entries()].filter(([key])=>!saved.has(key))
    .map(([,d])=>({name:d.name,count:d.count}))
    .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  const observedMs=Date.parse(observedAt),scanMs=Date.parse(snapshot.scan_finished_at);
  const ageMinutes=Math.round((observedMs-scanMs)/60000*10)/10;
  let bracketStable=null;
  if(bracket!==null){
    if(!validTime(bracket.before_at_utc)||!validTime(bracket.after_at_utc)||
       !nonNegative(bracket.before_count)||!nonNegative(bracket.after_count)||
       Date.parse(bracket.before_at_utc)>Date.parse(bracket.after_at_utc)||
       Date.parse(bracket.after_at_utc)>observedMs+60000){
       throw Error("Invalid ABC count bracket");
    }
    bracketStable=bracket.before_count===bracket.after_count&&
      facet.numFound===bracket.after_count;
  }
  const classification=unmatched.length>0?"NOMBRES_ABC_NO_CONCILIADOS":
    bracketStable===false?"ABC_CAMBIO_DURANTE_LECTURA":
    ageMinutes>15?"CAPTURA_APD_ANTERIOR":
    "CRITERIOS_DISTINTOS_AUN_SI_CERCANOS";
  const districts=snapshot.districts.map(d=>{
    const current=abc.get(normalizeDistrict(d.abc_name));
    return {district:d.name,abc_name:d.abc_name,
      apd_capture_count:d.count,abc_published_at_observation:current?.count??0,
      delta_abc_minus_capture:(current?.count??0)-d.count,
      time_and_filter_equivalence_proven:false};
  }).sort((a,b)=>a.district.localeCompare(b.district,"es"));
  return {
    schema_version:1,source:"ABC Publicada facet descdistrito vs APD dated snapshot",
    observed_at_utc:observedAt,
    abc:{query:'estado:"Publicada"',rows_downloaded:0,
      numFound:facet.numFound,bucket_count:abc.size,
      facet_sum:sum,bracketed_count_stable:bracketStable},
    apd:{scan_started_at_utc:snapshot.scan_started_at,
      scan_finished_at_utc:snapshot.scan_finished_at,
      captured_total:snapshot.scan_offers_processed,scan_district_count:saved.size,
      districts_with_offers:withOffers,age_minutes:ageMinutes},
    reconciliation:{mapped_abc_districts:abc.size-unmatched.length,
      unknown_abc_districts:unmatched,
      documented_name_equivalences_applied:aliasesApplied.sort((a,b)=>b.count-a.count),
      abc_total_in_unmapped_districts:unmatched.reduce((n,x)=>n+x.count,0),
      abc_districts_with_nonzero_and_apd_zero:districts.filter(x=>x.apd_capture_count===0&&x.abc_published_at_observation>0).length,
      snapshot_districts_with_nonzero_and_abc_zero:districts.filter(x=>x.apd_capture_count>0&&x.abc_published_at_observation===0).length,
      diagnostic_classification:classification,
      matching_offers_or_lost_jobs_proven:false,
      note:"Los conteos son de momentos y filtros distintos: ABC incluye estado Publicada; APD descarta expiradas y deduplica. Los ceros y deltas no prueban ofertas faltantes."},
    districts,private_records_accessed:false
  };
}
