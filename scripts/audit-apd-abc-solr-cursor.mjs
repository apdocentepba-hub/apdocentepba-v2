/* ABC Solr cursor capability probe — anonymous, count/ID fields only.
 * Never downloads offer descriptions, people, schools, raw objects or credentials.
 * It does NOT assume that a field is Solr's configured uniqueKey.
 * One two-page read-only probe for each possible sort field, 6 GETs max.
 */
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";

const URL_BASE="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const candidates=["id","iddetalle","idoferta"];
const sourceName="LA MATANZA"; // Official source label verified in PR #214.
const rows=2;
let requests=0;
async function fetchSmall({sort,cursor}){
 const url=new URL(URL_BASE);
 for(const [k,v] of Object.entries({
  q:'descdistrito:"'+sourceName+'" AND estado:"Publicada"',
  wt:"json",rows:String(rows),sort:sort+" asc",cursorMark:cursor,
  fl:"id,iddetalle,idoferta",start:"0"
 }))url.searchParams.set(k,v);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),15000);
 requests++;
 try{
  const response=await fetch(url,{method:"GET",credentials:"omit",
   redirect:"error",cache:"no-store",signal:controller.signal,
   headers:{Accept:"application/json"}});
  if(response.status!==200)return {http:response.status,valid:false};
  const raw=new TextDecoder("iso-8859-1").decode(await response.arrayBuffer());
  assert.ok(raw.length<35000,"Cursor probe unexpectedly large");
  const data=JSON.parse(raw);
  const docs=data?.response?.docs;
  if(!Array.isArray(docs)||docs.length>rows||
     !Number.isSafeInteger(data?.response?.numFound)||
     data.response.numFound<0)return {http:200,valid:false};
  // Never include source offer identifiers in printed logs or saved JSON.
  const stableKeys=docs.map(d=>String(d?.[sort]??""));
  const keysPresent=stableKeys.every(k=>k.length>0 && k.length<250);
  return {http:200,valid:true,numFound:data.response.numFound,
   nextCursorMark:typeof data.nextCursorMark==="string"?data.nextCursorMark:null,
   keysPresent,keys:stableKeys};
 } catch (e){
  return {http:null,valid:false,errorClass:e?.name==="AbortError"?"timeout":"invalid-response"};
 }finally{clearTimeout(timeout);}
}
const report={schema_version:1,
 observed_at_utc:new Date().toISOString(),
 endpoint:"ABC public Solr select",
 district:sourceName,
 rows_requested_per_query:2,
 documents_with_user_data_requested:0,
 sorts:[],
 production_changed:false,
 note:"A successful cursor probe does not establish a consistent snapshot under index mutations. Solr requires the configured uniqueKey in sort; do not guess production configuration."};
for(const sort of candidates){
 const a=await fetchSmall({sort,cursor:"*"});
 let compatible=false,secondChecked=false,overlap=null,reason;
 if(a.valid&&a.nextCursorMark&&a.keysPresent&&a.numFound>2&&a.nextCursorMark!=="*"){
  const b=await fetchSmall({sort,cursor:a.nextCursorMark});
  secondChecked=true;
  overlap=!!(b.valid&&b.keys?.some(k=>a.keys.includes(k)));
  compatible=!!(b.valid&&b.keysPresent&&b.nextCursorMark&&
    !overlap&&b.numFound===a.numFound);
  reason=compatible?"two_pages_with_cursor_and_no_overlap":"second_page_or_identity_invalid";
 }else reason=a.http!==200?"cursor_query_failed":
  a.nextCursorMark===null?"cursor_parameter_unsupported":
  !a.keysPresent?"sort_key_missing":"cursor_not_demonstrated";
 report.sorts.push({
   sort_field:sort,first_http_status:a.http,
   index_publicada_total:a.numFound??null,
   cursor_mark_returned:typeof a.nextCursorMark==="string",
   second_page_tested:secondChecked,
   key_present_in_projected_docs:a.keysPresent??false,
   overlapping_first_two_pages:overlap,
   preliminary_cursor_behavior_supported:compatible,
   diagnostic:reason
 });
}
report.requests_sent=requests;
report.any_preliminary_candidate=report.sorts.some(x=>x.preliminary_cursor_behavior_supported);
const dest=resolve("tmp/apd-abc-solr-cursor/audit.json");
mkdirSync(dirname(dest),{recursive:true});
writeFileSync(dest,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(report.sorts.every(x=>x.first_http_status!==200)){
 console.log("::warning::ABC public Solr unreachable or rejecting candidate sorts; cursor capability remains unknown.");
}
