/* Published-only cursor backed district fetch: lab-only strategy.
 * Does not replace the production Worker unless an independent approval.
 * Source offer records stay in memory, with the minimum public allowlist.
 * Callers MUST sanitize raw and observations before returning any alert.
 */
import {PUBLIC_ALERT_FIELDS} from "./apd-abc-published-projected-cursor-readonly.mjs";
export async function apdFetchPublishedOnlyDistrict({
 district,fetchImpl,normalizeDistrict,districtVariants,escapeSolr,keyFromOffer,
 rows=100,maxPages=12
}={}){
 if(typeof fetchImpl!=="function"||typeof normalizeDistrict!=="function"||
    typeof districtVariants!=="function"||typeof escapeSolr!=="function"||
    typeof keyFromOffer!=="function")throw Error("Published cursor dependencies missing");
 if(!Number.isSafeInteger(rows)||rows<1||rows>200||
    !Number.isSafeInteger(maxPages)||maxPages<2||maxPages>15)
   throw Error("Published cursor bounded limits invalid");
 const canonical=normalizeDistrict(district||"");
 const variants=districtVariants(canonical);
 // An invalid district preference is not evidence of zero published offers.
 // Reject rather than silently tell a teacher that no matching vacancies exist.
 if(!canonical||!Array.isArray(variants)||!variants.length||
    variants.some(v=>typeof v!=="string"||!v.trim()))
  throw Error("Invalid ABC district identity or alias variants");
 const q=`(${variants.map(v=>`descdistrito:"${escapeSolr(v)}"`).join(" OR ")}) AND estado:"Publicada"`;
 const endpoint="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
 const docs=[];
 const ids=new Set(),keys=new Set(),cursors=new Set();
 const allowlist=new Set(PUBLIC_ALERT_FIELDS);
 let cursor="*",total=null;
 for(let pageIndex=0;pageIndex<maxPages;pageIndex++){
  if(cursors.has(cursor))throw Error("Repeated ABC cursor");
  cursors.add(cursor);
  const url=new URL(endpoint);
  for(const [field,value] of Object.entries({
   q,wt:"json",sort:"id asc",cursorMark:cursor,
   rows:String(rows),fl:PUBLIC_ALERT_FIELDS.join(",")
  }))url.searchParams.set(field,value);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
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
  }finally{clearTimeout(timeout)}
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
  if(next===cursor){
   if(ids.size!==total)throw Error("ABC Published incomplete cursor coverage");
   return {docs,query:q,totalBruto:total,totalFiltrado:docs.length};
  }
  if(rowsFound.length===0)throw Error("ABC cursor advanced on empty page");
  cursor=next;
 }
 throw Error("ABC Published cursor exceeded bounded page cap: no partial results returned");
}
