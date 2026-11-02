/* Full two-pass ABC Solr cursor scan of PUBLIC source document IDs only.
 * No offers, names of people/schools or private data are fetched or persisted.
 * This is read-only research, NOT an operational replacement for the Worker.
 */
export const SOLR_SELECT="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";

export async function readPublishedIdsByCursor({
 fetchImpl,sourceDistrict="LA MATANZA",rows=60,maxPages=12,
 includeWorkerKeyFields=false,onDocument=null
}={}){
 if(typeof fetchImpl!=="function")throw Error("Fetch dependency missing");
 if(!/^[A-ZÁÉÍÓÚÜÑ0-9 /().,-]{2,80}$/u.test(sourceDistrict))throw Error("Invalid public district");
 if(!Number.isSafeInteger(rows)||rows<1||rows>100||
    !Number.isSafeInteger(maxPages)||maxPages<2||maxPages>30)throw Error("Invalid cursor limits");
 if(typeof includeWorkerKeyFields!=="boolean" ||
    (onDocument!==null&&typeof onDocument!=="function"))
   throw Error("Invalid optional private-free ID projection observer");
 const ids=new Set();
 let cursor="*",total=null,pages=0;
 const cursorsSeen=new Set();
 while(pages<maxPages){
  if(cursorsSeen.has(cursor))throw Error("Repeated cursor before completion");
  cursorsSeen.add(cursor);
  const url=new URL(SOLR_SELECT);
  for(const [key,val] of Object.entries({
   q:'descdistrito:"'+sourceDistrict.replace(/(["\\])/g,"\\$1")+'" AND estado:"Publicada"',
   wt:"json",rows:String(rows),sort:"id asc",cursorMark:cursor,fl:"id"
  }))url.searchParams.set(key,val);
  if(includeWorkerKeyFields)url.searchParams.set("fl","id,iddetalle,idoferta");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  let response;
  try{
   const req=await fetchImpl(url,{method:"GET",redirect:"error",cache:"no-store",
      credentials:"omit",signal:controller.signal,headers:{Accept:"application/json"}});
   if(!req?.ok)throw Error("ABC cursor read failed HTTP "+(req?.status??"unknown"));
   const raw=new TextDecoder("iso-8859-1").decode(await req.arrayBuffer());
   if(raw.length>100000)throw Error("ABC ID-only page unexpectedly large");
   response=JSON.parse(raw);
  } finally {clearTimeout(timer);}
  if(response?.responseHeader?.partialResults===true)
    throw Error("ABC cursor returned partial results");
  const num=response?.response?.numFound;
  const docs=response?.response?.docs;
  const next=response?.nextCursorMark;
  if(!Number.isSafeInteger(num)||num<0||!Array.isArray(docs)||
     docs.length>rows||typeof next!=="string"||!next)
    throw Error("ABC cursor payload invalid");
  if(total===null)total=num;
  if(total!==num)throw Error("ABC total changed between cursor pages");
  for(const doc of docs){
    const id=doc?.id;
    if((typeof id!=="string"&&typeof id!=="number")||
       !String(id).trim()||String(id).length>300)throw Error("ABC unique ID missing");
    const key=String(id);
    if(ids.has(key))throw Error("ABC cursor duplicated an offer ID");
    ids.add(key);
    if(onDocument)onDocument(doc);
  }
  pages++;
  if(next===cursor){
    if(ids.size!==total)throw Error("ABC cursor ended without complete ID coverage");
    return {ids,pages,total};
  }
  if(docs.length===0)throw Error("ABC cursor advanced with empty page");
  cursor=next;
 }
 throw Error("ABC cursor page cap exceeded (not a complete source read)");
}
export async function readTwoPublishedCursorPasses(options){
 const a=await readPublishedIdsByCursor(options);
 const b=await readPublishedIdsByCursor(options);
 const equal=a.total===b.total&&a.ids.size===b.ids.size&&
  [...a.ids].every(id=>b.ids.has(id));
 return {first:a,second:b,identicalIdSets:equal};
}
