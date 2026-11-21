/* Read-only two-pass ABC identity AND Worker-key stability audit.
 * Reads only id, iddetalle, idoferta (no personal attributes).
 * Maps exist in memory only and must not be returned or persisted.
 * This checks a source observation, NOT the database or production deployment.
 */
import {readPublishedIdsByCursor} from "./apd-abc-cursor-full-readonly.mjs";

function workerKeyPass(keyFunction){
 const idToKey=new Map(), keyToId=new Map();
 const stats={numeric_detail:0,fallback_solr_id:0,fallback_idoferta:0,
  composite_or_missing_numeric:0,empty_worker_key:0,key_collisions:0};
 const digits=value=>String(value??"").replace(/[^0-9]/g,"");
 return {
  observe(doc){
   const id=String(doc?.id??"");
   if(!id||id.length>300)throw Error("Source identity absent in key projection");
   let sourceType;
   if(digits(doc?.iddetalle))sourceType="numeric_detail";
   else if(digits(doc?.id))sourceType="fallback_solr_id";
   else if(digits(doc?.idoferta))sourceType="fallback_idoferta";
   else sourceType="composite_or_missing_numeric";
   stats[sourceType]++;
   const mapped=keyFunction(doc);
   const key=typeof mapped==="string"?mapped.trim():"";
   if(!key||key.length>220)stats.empty_worker_key++;
   if(idToKey.has(id))throw Error("Duplicate source identity in projected cursor pass");
   idToKey.set(id,key);
   if(key){
    if(keyToId.has(key)&&keyToId.get(key)!==id)stats.key_collisions++;
    else keyToId.set(key,id);
   }
  },
  final(){
   return {idToKey,counts:{...stats,distinct_worker_keys:keyToId.size}};
  }
 };
}

export async function auditTwoWorkerKeyPasses({
 fetchImpl,keyFunction,sourceDistrict="LA MATANZA",rows=60,maxPages=12
}={}){
 if(typeof fetchImpl!=="function"||typeof keyFunction!=="function")
  throw Error("Read-only dependencies missing");
 const firstObserver=workerKeyPass(keyFunction);
 const first=await readPublishedIdsByCursor({
  fetchImpl,sourceDistrict,rows,maxPages,
  includeWorkerKeyFields:true,onDocument:doc=>firstObserver.observe(doc)
 });
 const secondObserver=workerKeyPass(keyFunction);
 const second=await readPublishedIdsByCursor({
  fetchImpl,sourceDistrict,rows,maxPages,
  includeWorkerKeyFields:true,onDocument:doc=>secondObserver.observe(doc)
 });
 const a=firstObserver.final(),b=secondObserver.final();
 if(a.idToKey.size!==first.ids.size||b.idToKey.size!==second.ids.size)
  throw Error("Cursor and key projections did not cover identical documents");
 let removed=0,added=0,remapped=0;
 for(const [id,key] of a.idToKey){
  if(!b.idToKey.has(id)) removed++;
  else if(b.idToKey.get(id)!==key)remapped++;
 }
 for(const id of b.idToKey.keys())if(!a.idToKey.has(id))added++;
 const sameIds=first.total===second.total&&removed===0&&added===0;
 const keysUniqueAndNonEmpty=[a,b].every(x=>x.counts.empty_worker_key===0&&
   x.counts.key_collisions===0&&x.counts.distinct_worker_keys===x.idToKey.size);
 const primaryOnly=[a,b].every(x=>x.counts.numeric_detail===x.idToKey.size);
 const stable=sameIds&&remapped===0&&keysUniqueAndNonEmpty;
 // Fail closed for fallback IDs as production snapshot currently uses D_<iddetalle>
 const safeForFurtherReview=stable&&primaryOnly&&first.total>0;
 // Important: never return IDs/keys, even to the caller.
 return {
  first_total:first.total,second_total:second.total,
  first_pages:first.pages,second_pages:second.pages,
  first_keys:a.counts,second_keys:b.counts,
  removed_solr_ids:removed,added_solr_ids:added,
  same_solr_id_remapped_worker_key:remapped,
  identical_solr_id_sets:sameIds,
  unique_nonempty_worker_keys_both_passes:keysUniqueAndNonEmpty,
  only_numeric_detail_primary_keys:primaryOnly,
  identity_and_key_mapping_stable:stable,
  safe_for_further_review:safeForFurtherReview,
  production_activation_authorized:false
 };
}
