/* Global Worker-key namespace audit across districts, strictly READ-ONLY.
 * Two complete snapshots per district; checks source-ID/Worker-key/content
 * stability and disjoint key-space before any transactional staging promotion.
 * All offer records, keys and hashes remain in memory; only aggregate counts
 * may leave this module. Never import into the published Worker.
 */
import {createHash} from "node:crypto";
import {PUBLIC_ALERT_FIELDS} from "./apd-abc-published-projected-cursor-readonly.mjs";

function normalized(value){
 if(Array.isArray(value))return value.map(normalized);
 if(value && typeof value==="object"){
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalized(value[k])]));
 }
 return value===undefined?null:value;
}
function snapshot(result,district,keyFromOffer,globalKeyOwners,globalIdOwners){
 if(!result||!Array.isArray(result.docs)||
    !Number.isSafeInteger(result.totalBruto)||result.totalBruto<0||
    result.docs.length!==result.totalBruto||
    result.totalFiltrado!==result.totalBruto)
  throw Error("Global key audit rejected incomplete district capture");
 const items=new Map();
 for(const doc of result.docs){
  if(!doc||typeof doc!=="object"||Array.isArray(doc))
   throw Error("Global key audit rejected malformed source record");
  const id=doc.id;
  const detail=String(doc.iddetalle??"").replace(/[^0-9]/g,"");
  const key=keyFromOffer(doc);
  if(typeof id!=="string"||!id||id.length>300||
     !detail||key!=="D_"+detail||
     items.has(id))
   throw Error("Global key audit rejected ambiguous source identity");
  if(globalIdOwners.has(id)&&globalIdOwners.get(id)!==district)
   throw Error("Global key audit found cross-district Solr ID collision");
  if(globalKeyOwners.has(key)&&globalKeyOwners.get(key)!==district)
   throw Error("Global key audit found cross-district Worker key collision");
  // A repeat of the same Worker key within a district is also unsafe.
  const hash=createHash("sha256").update(JSON.stringify(
    Object.fromEntries(PUBLIC_ALERT_FIELDS.map(field=>[
      field,normalized(doc[field])
    ]))
  )).digest("hex");
  items.set(id,{key,hash});
  globalIdOwners.set(id,district);globalKeyOwners.set(key,district);
 }
 if(items.size!==result.totalBruto)
  throw Error("Global key audit missed source records");
 return items;
}
export async function auditGlobalPublishedKeys({
 districts,readDistrict,keyFromOffer
}={}){
 if(!Array.isArray(districts)||districts.length<2||districts.length>12||
    districts.some(d=>typeof d!=="string"||!d.trim())||
    new Set(districts).size!==districts.length||
    typeof readDistrict!=="function"||typeof keyFromOffer!=="function")
  throw Error("Invalid global key audit configuration");
 const verified=[];
 // Repeat all districts as a global snapshot. Source can change legitimately,
 // in which case reject the report instead of claiming a clean global keyspace.
 let initial=null;
 for(let pass=1;pass<=2;pass++){
  const globalIds=new Map(),globalKeys=new Map(),manifest=new Map();
  for(const district of districts){
   const result=await readDistrict(district);
   const items=snapshot(result,district,keyFromOffer,globalKeys,globalIds);
   const distinctKeys=new Set([...items.values()].map(x=>x.key));
   if(distinctKeys.size!==items.size)
    throw Error("Global key audit found duplicate Worker keys within a district");
   manifest.set(district,items);
   if(pass===1)verified.push({district,published_count:items.size});
  }
  if(pass===1){initial=manifest;continue}
  for(const district of districts){
   const before=initial.get(district);
   const after=manifest.get(district);
   if(before.size!==after.size)
    throw Error("Global key audit district count changed between captures");
   for(const [id,original] of before){
    const current=after.get(id);
    if(!current)throw Error("Global key audit source-ID set drifted at equal count");
    if(current.key!==original.key)
     throw Error("Global key audit source-key mapping drifted");
    if(current.hash!==original.hash)
     throw Error("Global key audit projected content drifted");
   }
  }
 }
 const published=verified.reduce((n,x)=>n+x.published_count,0);
 return Object.freeze({
  audited_districts:verified.map(({district,published_count})=>({district,published_count})),
  districts_checked:verified.length,
  global_distinct_source_ids:published,
  global_distinct_worker_keys:published,
  completed_full_passes:2,
  no_global_or_within_district_collision:true,
  identity_key_and_projected_content_stable:true,
  output_contains_no_ids_keys_hashes_or_offer_text:true,
  production_modified:false,
  deploy_authorized:false
 });
}
