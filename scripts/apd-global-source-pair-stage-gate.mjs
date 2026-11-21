/* Isolated source-to-staging bridge. No ABC, Supabase or production calls.
 * Accept two complete public source ID -> Worker-key manifests, reject drift
 * and global key collisions BEFORE any authorized localhost PG17 staging RPC.
 * Individual source IDs and keys never appear in summaries or JSON stringify.
 */
const DISTRICT=/^[A-Z0-9 ÁÉÍÓÚÜÑ()\/.,'-]{2,100}$/u;
const KEY=/^D_[0-9]+$/;
const ID_MAX=300,KEY_MAX=220;
const goodCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000;
function stageSnapshot(entries,previousDistricts=null){
 if(!Array.isArray(entries)||entries.length<2||entries.length>12)
  throw Error("Invalid global preflight district count");
 const map=new Map(),globalIds=new Set(),globalKeys=new Set();
 for(const entry of entries){
  const district=entry?.district;
  if(typeof district!=="string"||!DISTRICT.test(district)||district!==district.trim()||
     map.has(district)||!Array.isArray(entry?.pairs)||!goodCount(entry?.sourceTotal)||
     entry.sourceTotal!==entry.pairs.length)
   throw Error("Global preflight incomplete or invalid district source");
  if(previousDistricts && !previousDistricts.has(district))
   throw Error("Global preflight district set changed between passes");
  const local=new Map(),localKeys=new Set();
  for(const pair of entry.pairs){
   if(!pair||typeof pair!=="object"||Array.isArray(pair)||
      Object.keys(pair).length!==2||
      !Object.hasOwn(pair,"id")||!Object.hasOwn(pair,"source_offer_key"))
    throw Error("Global preflight malformed ID/Worker-key pair");
   const {id,source_offer_key:key}=pair;
   if(typeof id!=="string"||!id||id.length>ID_MAX||id!==id.trim()||
      typeof key!=="string"||key.length>KEY_MAX||!KEY.test(key))
    throw Error("Global preflight rejected source ID/Worker-key mapping");
   if(local.has(id)||localKeys.has(key)||
      globalIds.has(id)||globalKeys.has(key))
    throw Error("Global preflight source-ID or Worker-key collision");
   local.set(id,key);localKeys.add(key);
   globalIds.add(id);globalKeys.add(key);
  }
  map.set(district,local);
 }
 return {map,total:globalKeys.size};
}
export function prepareGlobalSourcePairsForLab({
 first,second
}={}){
 const a=stageSnapshot(first);
 const b=stageSnapshot(second,new Set(a.map.keys()));
 if(a.total!==b.total||a.map.size!==b.map.size)
  throw Error("Global preflight source total or district set drifted");
 for(const [district,ids] of a.map){
  const later=b.map.get(district);
  if(!later||later.size!==ids.size)
   throw Error("Global preflight district source count drifted");
  for(const [id,key] of ids){
   if(!later.has(id))throw Error("Global preflight Solr ID set drifted");
   if(later.get(id)!==key)
    throw Error("Global preflight Worker-key mapping drifted");
  }
 }
 const summary=Object.freeze({
  districts_checked:a.map.size,
  total_source_ids:a.total,
  total_worker_keys:a.total,
  complete_source_passes:2,
  global_worker_key_collision_count:0,
  staging_ready_districts:[...a.map.values()].filter(x=>x.size>0).length,
  no_personal_records_or_source_ids_returned:true,
  source_content_hashes_checked:false,
  deploy_authorized:false,
  production_modified:false
 });
 // Pair arrays are accessible ONLY for authorized local staging; never
 // include them in the JSON-serializable public summary.
 function pairsForIsolatedStaging(district,stagedKeys){
  const ids=a.map.get(district);
  if(!ids||ids.size===0)throw Error("Global preflight cannot stage unknown or empty district");
  if(!Array.isArray(stagedKeys)||stagedKeys.length===0||
     stagedKeys.length>ids.size)
   throw Error("Global preflight invalid staged key subset");
  const allowed=new Set(ids.values()),seen=new Set();
  for(const key of stagedKeys){
   if(typeof key!=="string"||!allowed.has(key)||seen.has(key))
    throw Error("Global preflight staged Worker key not in source pairs");
   seen.add(key);
  }
  return [...ids].map(([id,source_offer_key])=>({id,source_offer_key}))
   .sort((x,y)=>x.id.localeCompare(y.id));
 }
 return Object.freeze({summary,pairsForIsolatedStaging});
}
