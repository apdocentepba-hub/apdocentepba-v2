/* ABC public Solr: two full passes for TWO districts, cross-district
 * source_offer_key collision audit. All source IDs and Worker keys remain in
 * temporary in-memory Maps. Return and log ONLY counts and booleans.
 * No writes, no credentials, no production integration.
 */
import {readPublishedIdsByCursor} from "./apd-abc-cursor-full-readonly.mjs";

export const PILOT_DISTRICTS=Object.freeze(["LA MATANZA","AVELLANEDA"]);

export async function auditWorkerKeysAcrossDistricts({
 fetchImpl,keyFunction,districts=PILOT_DISTRICTS,rows=60,maxPages=12
}={}){
 if(typeof fetchImpl!=="function"||typeof keyFunction!=="function")
   throw Error("Missing read-only audit dependency");
 if(!Array.isArray(districts)||districts.length!==2||
    districts.some(d=>!PILOT_DISTRICTS.includes(d))||new Set(districts).size!==2)
   throw Error("Cross-district pilot is limited to the two validated districts");
 const scans=[];
 for(let pass=0;pass<2;pass++){
   const idOwner=new Map(),keyOwner=new Map(),byDistrict=new Map();
   const counts={cross_district_worker_key_collisions:0,
    cross_district_solr_id_reuse:0,missing_or_nonprimary_worker_keys:0,
    duplicated_keys_within_district:0,source_total:0,cursor_pages:0};
   for(const district of districts){
     const documentKeys=new Map(),keysHere=new Set();
     const result=await readPublishedIdsByCursor({
       fetchImpl,sourceDistrict:district,rows,maxPages,
       includeWorkerKeyFields:true,onDocument(doc){
         const id=String(doc.id);
         const digits=String(doc.iddetalle??"").replace(/[^0-9]/g,"");
         const key=keyFunction(doc);
         if(typeof key!=="string"||!key||!digits||key!=="D_"+digits)
           counts.missing_or_nonprimary_worker_keys++;
         if(keysHere.has(key))counts.duplicated_keys_within_district++;
         keysHere.add(key);
         if(idOwner.has(id)&&idOwner.get(id)!==district)
           counts.cross_district_solr_id_reuse++;
         else idOwner.set(id,district);
         if(keyOwner.has(key)&&keyOwner.get(key)!==district)
           counts.cross_district_worker_key_collisions++;
         else keyOwner.set(key,district);
         documentKeys.set(id,key);
       }
     });
     if(documentKeys.size!==result.ids.size)
       throw Error("Projected source IDs and cursor total disagree");
     byDistrict.set(district,{map:documentKeys,total:result.total,pages:result.pages});
     counts.source_total+=result.total;
     counts.cursor_pages+=result.pages;
   }
   scans.push({byDistrict,counts});
 }
 const first=scans[0],second=scans[1];
 let added=0,removed=0,remapped=0;
 const districtTotals=[];
 for(const district of districts){
   const a=first.byDistrict.get(district),b=second.byDistrict.get(district);
   for(const [id,key] of a.map){
     if(!b.map.has(id))removed++;
     else if(b.map.get(id)!==key)remapped++;
   }
   for(const id of b.map.keys())if(!a.map.has(id))added++;
   districtTotals.push({district,first_total:a.total,second_total:b.total,
     first_pages:a.pages,second_pages:b.pages,
     same_total:a.total===b.total});
 }
 const checks=[first,second].every(p=>p.counts.cross_district_worker_key_collisions===0&&
    p.counts.cross_district_solr_id_reuse===0&&
    p.counts.missing_or_nonprimary_worker_keys===0&&
    p.counts.duplicated_keys_within_district===0&&p.counts.source_total>0);
 const stable=checks&&added===0&&removed===0&&remapped===0&&
   districtTotals.every(x=>x.same_total);
 // Never expose actual IDs or keys in the result (including errors).
 return {
   scope:"ABC Publicada projected id/iddetalle/idoferta, two audited districts",
   district_totals:districtTotals,
   total_first_pass:first.counts.source_total,
   total_second_pass:second.counts.source_total,
   cross_district_worker_key_collisions_first:first.counts.cross_district_worker_key_collisions,
   cross_district_worker_key_collisions_second:second.counts.cross_district_worker_key_collisions,
   cross_district_solr_id_reuse_first:first.counts.cross_district_solr_id_reuse,
   cross_district_solr_id_reuse_second:second.counts.cross_district_solr_id_reuse,
   duplicated_keys_within_district_first:first.counts.duplicated_keys_within_district,
   duplicated_keys_within_district_second:second.counts.duplicated_keys_within_district,
   nonprimary_or_missing_keys_first:first.counts.missing_or_nonprimary_worker_keys,
   nonprimary_or_missing_keys_second:second.counts.missing_or_nonprimary_worker_keys,
   added_source_ids_between_passes:added,
   removed_source_ids_between_passes:removed,
   remapped_worker_keys_between_passes:remapped,
   key_stability_and_global_uniqueness_observed:stable,
   safe_for_further_review:stable,
   production_activation_authorized:false,
   source_ids_or_worker_keys_returned:false
 };
}
