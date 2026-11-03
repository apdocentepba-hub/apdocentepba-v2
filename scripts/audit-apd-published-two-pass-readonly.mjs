/* AUDIT ONLY. Two independent, complete source passes; no worker integration.
 * Source IDs, mapped Worker keys and projected field values stay in RAM,
 * and never appear in aggregate outputs, logs or artifacts.
 */
import {createHash} from "node:crypto";
import {PUBLIC_ALERT_FIELDS} from "./apd-abc-published-projected-cursor-readonly.mjs";

function stableValue(value){
 if(Array.isArray(value))return value.map(stableValue);
 if(value && typeof value==="object")
  return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
   .map(([k,v])=>[k,stableValue(v)]));
 return value===undefined?null:value;
}
function identityAndContent(rows,keyFromOffer){
 const pairById=new Map();
 for(const row of rows){
  const id=String(row.id??"");
  const key=keyFromOffer(row);
  if(!id||!key||pairById.has(id))throw Error("Bad source identity in audit");
  // Include operational fields AND observations, but only in transient hashing.
  // Neither original text nor per-offer digest leaves this function.
  const projected=Object.fromEntries(PUBLIC_ALERT_FIELDS.map(field=>[
    field,stableValue(row[field])
  ]));
  const digest=createHash("sha256").update(JSON.stringify(projected)).digest("hex");
  pairById.set(id,{key,digest});
 }
 return pairById;
}
export async function auditPublishedTwoPass({
 district,readDistrict,keyFromOffer
}={}){
 if(typeof district!=="string"||!district.trim()||
    typeof readDistrict!=="function"||typeof keyFromOffer!=="function")
  throw Error("Missing two-pass audit dependencies");
 const stats=[];
 let initial=null;
 for(let pass=1;pass<=2;pass++){
  // Both passes are FULL, independent cursor traversals (no cached result).
  const result=await readDistrict(district);
  if(!result||!Array.isArray(result.docs)||
    !Number.isSafeInteger(result.totalBruto)||result.totalBruto<0||
    result.totalFiltrado!==result.docs.length||
    result.docs.length!==result.totalBruto)
   throw Error("Incomplete two-pass source capture");
  const manifest=identityAndContent(result.docs,keyFromOffer);
  if(manifest.size!==result.totalBruto)
   throw Error("Duplicate or incomplete source identity in audit");
  stats.push({pass, count:manifest.size});
  if(pass===1){initial=manifest;continue}
  if(manifest.size!==initial.size)
   throw Error("Published source count changed between passes");
  // Fail even if count is identical: replacement, re-mapping or content drift.
  for(const [id,entry] of initial){
   const actual=manifest.get(id);
   if(!actual)throw Error("Source ID set changed at equal count");
   if(actual.key!==entry.key)
    throw Error("Worker key mapping changed at equal count");
   if(actual.digest!==entry.digest)
    throw Error("Projected offer content changed at equal count");
  }
 }
 return Object.freeze({
  district,passes_completed:2,
  published_count_verified:stats[0].count,
  source_id_mapping_stable:true,
  projected_offer_content_stable:true,
  no_ids_keys_digests_or_observations_returned:true,
  no_production_writes:true,
  production_deploy_authorized:false
 });
}
