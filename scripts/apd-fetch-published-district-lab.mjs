/* Published-only cursor backed district fetch: lab-only strategy.
 * Does not replace the production Worker unless an independent approval.
 * Source offer records stay in memory, with the minimum public allowlist.
 * Callers MUST sanitize raw and observations before returning any alert.
 */
import {PUBLIC_ALERT_FIELDS} from "./apd-abc-published-projected-cursor-readonly.mjs";
export async function apdFetchPublishedOnlyDistrict({
 district,fetchImpl,normalizeDistrict,districtVariants,escapeSolr,keyFromOffer,
 rows=100,maxPages=12,maxWallMs=20000,now=()=>performance.now()
}={}){
 if(typeof fetchImpl!=="function"||typeof normalizeDistrict!=="function"||
    typeof districtVariants!=="function"||typeof escapeSolr!=="function"||
    typeof keyFromOffer!=="function")throw Error("Published cursor dependencies missing");
 if(!Number.isSafeInteger(rows)||rows<1||rows>200||
    !Number.isSafeInteger(maxPages)||maxPages<2||maxPages>15||
    !Number.isSafeInteger(maxWallMs)||maxWallMs<1000||maxWallMs>60000||
    typeof now!=="function")
   throw Error("Published cursor bounded limits invalid");
 const canonical=normalizeDistrict(district||"");
 const variants=districtVariants(canonical);
 // An invalid district preference is not evidence of zero published offers.
 // Reject rather than silently tell a teacher that no matching vacancies exist.
 if(!canonical||!Array.isArray(variants)||!variants.length||
    variants.some(v=>typeof v!=="string"||!v.trim()))
  throw Error("Invalid ABC district identity or alias variants");
 const districtQuery=`(${variants.map(v=>`descdistrito:"${escapeSolr(v)}"`).join(" OR ")})`;
 const q=districtQuery+' AND estado:"Publicada"';
 const endpoint="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
 // A single district budget bounds ALL sequential pages, not just each GET.
 // A timeout is a source failure, never permission to return truncated offers.
 const started=now();
 if(!Number.isFinite(started))throw Error("ABC Published monotonic clock invalid");
 const remaining=()=>{
  const elapsed=now()-started;
  if(!Number.isFinite(elapsed)||elapsed<0)
   throw Error("ABC Published monotonic clock invalid");
  const left=maxWallMs-elapsed;
  if(left<=0)throw Error("ABC Published district time budget exceeded");
  return left;
 };
 // Only for a TRUE zero published result: independently ask Solr for the
 // same district WITHOUT the estado filter, using rows=0 and state facets.
 // No documents, IDs, CUIL or observation text are fetched by this proof.
 // Source contradictions, missing facets, timeouts and 429 reject the zero.
 const confirmZeroPublished=async()=>{
  const url=new URL(endpoint);
  for(const [field,value] of Object.entries({
   q:districtQuery,wt:"json",rows:"0",facet:"true",
   "facet.field":"estado","facet.mincount":"1","facet.limit":"-1",
   "facet.missing":"true"
  }))url.searchParams.set(field,value);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),Math.min(15000,Math.ceil(remaining())));
  let body;
  try{
   const response=await fetchImpl(url,{
    method:"GET",credentials:"omit",redirect:"error",
    cache:"no-store",signal:controller.signal,
    headers:{"accept":"application/json"}
   });
   if(!response?.ok)throw Error("ABC Published zero-proof HTTP "+(response?.status??"unknown"));
   const buffer=await response.arrayBuffer();
   if(buffer.byteLength>100000)throw Error("ABC Published zero-proof response too large");
   body=JSON.parse(new TextDecoder("iso-8859-1").decode(buffer));
  }catch(error){
   if(controller.signal.aborted)throw Error("ABC Published zero-proof timed out");
   throw error;
  }finally{clearTimeout(timeout)}
  remaining();
  const totalAllStates=body?.response?.numFound;
  const facet=body?.facet_counts?.facet_fields?.estado;
  if(body?.responseHeader?.partialResults===true||
     !Number.isSafeInteger(totalAllStates)||totalAllStates<0||
     !Array.isArray(body?.response?.docs)||body.response.docs.length!==0||
     !Array.isArray(facet)||facet.length%2!==0)
   throw Error("ABC Published zero-proof facet response invalid");
  let counted=0,published=0;
  for(let i=0;i<facet.length;i+=2){
   const label=facet[i];
   const count=facet[i+1];
   if(!(typeof label==="string"||label===null)||
      !Number.isSafeInteger(count)||count<0)
    throw Error("ABC Published zero-proof facet count invalid");
   counted+=count;
   if(String(label||"").trim().toUpperCase()==="PUBLICADA")published+=count;
  }
  if(!Number.isSafeInteger(counted)||counted!==totalAllStates)
   throw Error("ABC Published zero-proof facet totals incomplete");
  if(published!==0)
   throw Error("ABC Published zero contradicts independent state facets");
  return true;
 };
 const docs=[];
 const ids=new Set(),keys=new Set(),cursors=new Set();
 const allowlist=new Set(PUBLIC_ALERT_FIELDS);
 let cursor="*",total=null;
 for(let pageIndex=0;pageIndex<maxPages;pageIndex++){
  // Check before allocating the next page request.
  const requestBudget=Math.min(15000,Math.ceil(remaining()));
  if(cursors.has(cursor))throw Error("Repeated ABC cursor");
  cursors.add(cursor);
  const url=new URL(endpoint);
  for(const [field,value] of Object.entries({
   q,wt:"json",sort:"id asc",cursorMark:cursor,
   rows:String(rows),fl:PUBLIC_ALERT_FIELDS.join(",")
  }))url.searchParams.set(field,value);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),requestBudget);
  let data;
  try{
   const response=await fetchImpl(url,{
    method:"GET",credentials:"omit",redirect:"error",
    cache:"no-store",signal:controller.signal,
    headers:{"accept":"application/json"}
   });
   if(!response?.ok)throw Error("ABC Published cursor HTTP "+(response?.status??"unknown"));
   const buffer=await response.arrayBuffer();
   if(buffer.byteLength>1600000)throw Error("ABC Published page exceeds safe byte cap");
   data=JSON.parse(new TextDecoder("iso-8859-1").decode(buffer));
  }catch(error){
   if(controller.signal.aborted)
    throw Error("ABC Published district request timed out");
   throw error;
  }finally{clearTimeout(timeout)}
  // Also enforce the deadline if a test double or transport ignores abort.
  remaining();
  if(data?.responseHeader?.partialResults===true)
   throw Error("ABC source reported partial results");
  const reported=data?.response?.numFound;
  const rowsFound=data?.response?.docs;
  const next=data?.nextCursorMark;
  if(!Number.isSafeInteger(reported)||reported<0||!Array.isArray(rowsFound)||
    rowsFound.length>rows||typeof next!=="string"||!next)
   throw Error("Invalid ABC Published page or cursor");
  if(total===null)total=reported;
  if(reported!==total)throw Error("ABC total changed during Published cursor");
  for(const offer of rowsFound){
   if(!offer||typeof offer!=="object"||Array.isArray(offer)||
      Object.keys(offer).some(key=>!allowlist.has(key)))
     throw Error("ABC returned unexpected offer fields");
   const docDistrict=normalizeDistrict(offer.descdistrito);
   if(!(docDistrict===canonical||variants.includes(docDistrict))||
      String(offer.estado||"").trim().toUpperCase()!=="PUBLICADA")
     throw Error("ABC returned foreign district or non-published offer");
   const id=String(offer.id??"");
   const detail=String(offer.iddetalle??"").replace(/[^0-9]/g,"");
   const key=keyFromOffer(offer);
   if(!id||id.length>300||!detail||key!=="D_"+detail||
      ids.has(id)||keys.has(key))
     throw Error("ABC Published source duplicate or invalid offer identity");
   ids.add(id);keys.add(key);docs.push(offer);
  }
  // We have all expected UNIQUE rows: requesting one extra empty Solr page
  // would add latency without improving completeness of this one-pass read.
  // A later independent second pass still provides drift protection.
  if(ids.size===total){
   remaining();
   if(total===0)await confirmZeroPublished();
   return {docs,query:q,totalBruto:total,totalFiltrado:docs.length};
  }
  if(next===cursor)throw Error("ABC Published incomplete cursor coverage");
  if(rowsFound.length===0)throw Error("ABC cursor advanced on empty page");
  cursor=next;
 }
 throw Error("ABC Published cursor exceeded bounded page cap: no partial results returned");
}
