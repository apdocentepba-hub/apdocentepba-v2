import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadWorkerSourceKey,createSourceKeyStats} from "./apd-worker-source-key-readonly.mjs";
import {readPublishedIdsByCursor} from "./apd-abc-cursor-full-readonly.mjs";

const worker=readFileSync("worker-live/worker_hotfix.js","utf8");
const workerKey=loadWorkerSourceKey(worker);
test("actual Worker source_offer_key retains iddetalle priority and normalizes numbers",()=>{
 assert.equal(workerKey({id:"001",iddetalle:"1250",idoferta:"34"}),"D_1250");
 assert.equal(workerKey({id:"001",iddetalle:null,idoferta:"34"}),"D_001");
 assert.equal(workerKey({id:"ABC",idoferta:"34"}),"O_34");
});
test("fallback from Solr ID can collide and is flagged rather than ignored",()=>{
 const stats=createSourceKeyStats(workerKey);
 stats.observe({id:"document-001"});
 stats.observe({id:"offer-001"});
 const result=stats.summarize();
 assert.equal(result.checked,2);
 assert.equal(result.fallback_to_solr_id,2);
 assert.equal(result.duplicate_worker_keys,1);
 assert.equal(result.source_keys_are_unique,false);
});
test("different iddetalle values retain unique keys",()=>{
 const stats=createSourceKeyStats(workerKey);
 stats.observe({id:"solrID-5",iddetalle:120});
 stats.observe({id:"solrID-6",iddetalle:"121"});
 const result=stats.summarize();
 assert.equal(result.checked,2);
 assert.equal(result.with_iddetalle,2);
 assert.equal(result.distinct_worker_keys,2);
 assert.equal(result.source_keys_are_unique,true);
});
test("real cursor reader optional projected ID fields sends only 3 fields",async()=>{
 const fields=[];
 const ids=["SOLR_100","SOLR_101","SOLR_102"];
 const get=async url=>{
  fields.push(url.searchParams.get("fl"));
  const mark=url.searchParams.get("cursorMark");
  const offset=mark==="*"?0:Number(mark.slice(1));
  const docs=ids.slice(offset,offset+2).map((id,i)=>({
    id,iddetalle:String(offset+i+1),idoferta:"999"
  }));
  const response={response:{numFound:3,docs},nextCursorMark:docs.length?"C"+(offset+docs.length):mark};
  return {ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(response)).buffer};
 };
 const stats=createSourceKeyStats(workerKey);
 const result=await readPublishedIdsByCursor({fetchImpl:get,rows:2,maxPages:5,
   includeWorkerKeyFields:true,onDocument:doc=>stats.observe(doc)});
 assert.equal(result.total,3);
 assert.deepEqual(fields,["id,iddetalle,idoferta","id,iddetalle,idoferta","id,iddetalle,idoferta"]);
 assert.equal(stats.summarize().source_keys_are_unique,true);
});
test("audit neither stores nor prints Solr IDs or individual offer documents",()=>{
 const script=readFileSync("scripts/audit-apd-abc-worker-key-compat.mjs","utf8");
 assert.match(script,/source_key_mapping_verified_against_live_ABC/);
 assert.match(script,/no_identifiers_persisted:true/);
 assert.doesNotMatch(script,/JSON\.stringify\(result\.ids\)|Array\.from\(result\.ids\)|supabaseUpsert|method:"POST"|service_role/);
});
