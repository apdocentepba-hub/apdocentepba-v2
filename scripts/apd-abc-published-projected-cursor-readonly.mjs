/* Public ABC Published-only projected cursor feasibility, NOT a Worker change.
 * Strict GET allowlist, no personal IDs/CUIL requested beyond source offer IDs.
 * Existing Worker key function is supplied by caller; no duplicated key logic.
 * Returns aggregate counters ONLY, never actual source documents/keys/IDs.
 */
export const SOLR_SELECT="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
export const PUBLIC_ALERT_FIELDS=Object.freeze([
 "id","iddetalle","idoferta","descdistrito","estado",
 "escuela","cargo","descripcioncargo","descripcionarea",
 "descnivelmodalidad","nivelmodalidad","turno","jornada",
 "hsmodulos","cursodivision","supl_desde","supl_hasta",
 "finoferta","ult_movimiento","supl_revista","lunes",
 "martes","miercoles","jueves","viernes","sabado",
 "observaciones","tipooferta","iniciooferta"
]);
const allowed=new Set(PUBLIC_ALERT_FIELDS);
const forbidden=new Set(["cuilautor","reemp_cuil","reemp_apeynom",
 "domiciliodesempeno","idsuna","acargodireccion"]);
export async function auditProjectedPublicOffers({
 fetchImpl,keyFunction,district,rows=100,maxPages=8
}={}){
 if(typeof fetchImpl!=="function"||typeof keyFunction!=="function")
  throw Error("Read-only public source dependencies required");
 if(!["LA MATANZA","AVELLANEDA"].includes(district))
  throw Error("Only two previously verified districts permitted");
 if(!Number.isSafeInteger(rows)||rows<1||rows>200||
    !Number.isSafeInteger(maxPages)||maxPages<2||maxPages>12)
  throw Error("Invalid bounded cursor limits");
 let cursor="*",total=null,pages=0,readBytes=0,maxPageBytes=0;
 const seenId=new Set(),seenKey=new Set(),seenCursors=new Set();
 while(pages<maxPages){
  if(seenCursors.has(cursor))throw Error("Repeated cursor before complete scan");
  seenCursors.add(cursor);
  const url=new URL(SOLR_SELECT);
  url.searchParams.set("q",`descdistrito:"${district}" AND estado:"Publicada"`);
  url.searchParams.set("wt","json");
  url.searchParams.set("sort","id asc");
  url.searchParams.set("cursorMark",cursor);
  url.searchParams.set("rows",String(rows));
  url.searchParams.set("fl",PUBLIC_ALERT_FIELDS.join(","));
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  let page;
  try{
   const response=await fetchImpl(url,{
    method:"GET",credentials:"omit",redirect:"error",
    cache:"no-store",signal:controller.signal,
    headers:{Accept:"application/json"}
   });
   if(!response?.ok)throw Error("Public ABC GET failed HTTP "+(response?.status??"unknown"));
   const buffer=await response.arrayBuffer();
   const size=buffer.byteLength;
   if(size>1600000)throw Error("Projected page byte cap exceeded");
   readBytes+=size;
   maxPageBytes=Math.max(maxPageBytes,size);
   page=JSON.parse(new TextDecoder("iso-8859-1").decode(buffer));
  }finally{clearTimeout(timer)}
  if(page?.responseHeader?.partialResults===true)
   throw Error("Partial results from ABC cannot be treated as complete");
  const count=page?.response?.numFound;
  const docs=page?.response?.docs;
  const next=page?.nextCursorMark;
  if(!Number.isSafeInteger(count)||count<0||!Array.isArray(docs)||
     docs.length>rows||typeof next!=="string"||!next)
   throw Error("Invalid projected cursor response shape");
  if(total===null)total=count;
  if(total!==count)throw Error("Published count changed during cursor scan");
  for(const doc of docs){
   if(!doc||typeof doc!=="object"||Array.isArray(doc))
    throw Error("Malformed public offer");
   const keys=Object.keys(doc);
   if(keys.some(k=>!allowed.has(k)||forbidden.has(k)))
    throw Error("Solr returned non-allowlisted field; reject page");
   const id=String(doc.id??"");
   const detail=String(doc.iddetalle??"").replace(/[^0-9]/g,"");
   if(!id||id.length>300||!detail||
      String(doc.estado||"").toLowerCase()!=="publicada"||
      String(doc.descdistrito||"").trim().toUpperCase()!==district)
     throw Error("Projected offer identity, district or published state invalid");
   const key=keyFunction(doc);
   if(typeof key!=="string"||key!=="D_"+detail)
    throw Error("Worker key mismatches public detail identity");
   if(seenId.has(id)||seenKey.has(key))
    throw Error("Duplicate source ID or Worker key in projected cursor");
   seenId.add(id);seenKey.add(key);
  }
  pages++;
  if(next===cursor){
   if(seenId.size!==total)throw Error("Incomplete projected public source coverage");
   return {
    district,publicada_total:total,unique_source_ids:seenId.size,
    unique_worker_keys:seenKey.size,pages,bytes_downloaded:readBytes,
    max_page_bytes:maxPageBytes,selected_fields:PUBLIC_ALERT_FIELDS.length,
    non_allowlisted_fields_received:false,
    source_offers_or_individual_keys_returned:false,
    complete_projected_read:true,
    production_activation_authorized:false
   };
  }
  if(docs.length===0)throw Error("Cursor advanced on empty results");
  cursor=next;
 }
 throw Error("Published projected source scan exceeded page cap");
}
