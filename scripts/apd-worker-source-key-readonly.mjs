/* Read-only source-key audit using the EXACT Worker function. Never store IDs. */
import vm from "node:vm";
export function loadWorkerSourceKey(workerCode){
 const extract=name=>{
  const start=workerCode.indexOf("function "+name+"(");
  const end=workerCode.indexOf("\n__name("+name+",",start);
  if(start<0||end<start)throw Error("Worker key contract function missing: "+name);
  return workerCode.slice(start,end);
 };
 const ctx=vm.createContext({});
 vm.runInContext(["norm","sanitizeSolrNumber","sanitizeKeyText",
  "buildSourceOfferKeyFromOferta"].map(extract).join("\n"),ctx,{timeout:1000});
 if(typeof ctx.buildSourceOfferKeyFromOferta!=="function")
  throw Error("Worker mapping unavailable");
 return ctx.buildSourceOfferKeyFromOferta;
}
export function createSourceKeyStats(keyFunction){
 if(typeof keyFunction!=="function")throw Error("Invalid key function");
 const keys=new Set();
 const stats={checked:0,with_iddetalle:0,fallback_to_solr_id:0,
  fallback_to_idoferta:0,no_numeric_key_source:0,empty_worker_key:0,
  duplicate_worker_keys:0};
 const digits=value=>String(value??"").replace(/[^0-9]/g,"");
 return {
  observe(doc){
   stats.checked++;
   if(digits(doc?.iddetalle))stats.with_iddetalle++;
   else if(digits(doc?.id))stats.fallback_to_solr_id++;
   else if(digits(doc?.idoferta))stats.fallback_to_idoferta++;
   else stats.no_numeric_key_source++;
   const key=keyFunction(doc);
   if(!key)stats.empty_worker_key++;
   if(key){
    if(keys.has(key))stats.duplicate_worker_keys++;
    keys.add(key);
   }
  },
  summarize(){
   return {...stats,distinct_worker_keys:keys.size,
    source_keys_are_unique:stats.empty_worker_key===0&&
      stats.duplicate_worker_keys===0&&keys.size===stats.checked,
    source_key_mapping_verified_against_live_ABC:false};
  }
 };
}
