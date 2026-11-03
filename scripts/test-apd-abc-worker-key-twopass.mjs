import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditTwoWorkerKeyPasses} from "./apd-abc-worker-key-two-pass-readonly.mjs";
import {loadWorkerSourceKey} from "./apd-worker-source-key-readonly.mjs";

const workerKey=loadWorkerSourceKey(readFileSync("worker-live/worker_hotfix.js","utf8"));
const sample=n=>Array.from({length:n},(_,i)=>({
 id:"SOLR_"+String(i+1).padStart(4,"0"),
 iddetalle:String(100000+i+1),
 idoferta:String(300000+i+1)
}));
function source(passes,{partial=false,invalidCursor=false}={}){
 let pass=-1;let requests=0;
 const fetchImpl=async(url,init)=>{
  assert.equal(url.hostname,"servicios3.abc.gob.ar");
  assert.equal(init.method,"GET");
  assert.equal(init.credentials,"omit");
  assert.equal(url.searchParams.get("wt"),"json");
  assert.equal(url.searchParams.get("fl"),"id,iddetalle,idoferta");
  assert.equal(url.searchParams.get("sort"),"id asc");
  assert.equal(url.searchParams.has("start"),false);
  assert.equal(url.searchParams.get("q"),'descdistrito:"LA MATANZA" AND estado:"Publicada"');
  const cursor=url.searchParams.get("cursorMark");
  if(cursor==="*")pass++;
  const docsAll=passes[Math.min(pass,passes.length-1)];
  const offset=cursor==="*"?0:Number(cursor.slice(1));
  const rows=Number(url.searchParams.get("rows"));
  const docs=docsAll.slice(offset,offset+rows);
  const next=invalidCursor?"INVALID":(docs.length>0?"C"+(offset+docs.length):cursor);
  requests++;
  const json=JSON.stringify({
   responseHeader:partial&&offset>=60?{partialResults:true}:{},
   response:{numFound:docsAll.length,docs},nextCursorMark:next
  });
  return {ok:true,status:200,arrayBuffer:async()=>(new TextEncoder().encode(json)).buffer};
 };
 return {fetchImpl,get requests(){return requests;}};
}
const run=fetchImpl=>auditTwoWorkerKeyPasses({fetchImpl,keyFunction:workerKey,sourceDistrict:"LA MATANZA",rows:60,maxPages:12});

test("two full consistent cursor passes include identical canonical Worker keys",async()=>{
 const sourceApi=source([sample(161)]);
 const r=await run(sourceApi.fetchImpl);
 assert.equal(r.first_total,161);
 assert.equal(r.second_total,161);
 assert.equal(r.first_pages,4);
 assert.equal(r.second_pages,4);
 assert.equal(sourceApi.requests,8);
 assert.equal(r.identical_solr_id_sets,true);
 assert.equal(r.unique_nonempty_worker_keys_both_passes,true);
 assert.equal(r.only_numeric_detail_primary_keys,true);
 assert.equal(r.safe_for_further_review,true);
 assert.equal(r.production_activation_authorized,false);
 assert.equal(r.first_keys.numeric_detail,161);
 assert.equal(r.same_solr_id_remapped_worker_key,0);
 assert.equal(r.removed_solr_ids,0);
 assert.equal(r.added_solr_ids,0);
 assert.equal(Object.keys(r).some(k=>/^(?:ids|idToKey|keys|docs|raw)$/i.test(k)),false);
 assert.doesNotMatch(JSON.stringify(r),/SOLR_0001|D_100001/);
});
test("same Solr IDs and counts but different iddetalle must flag key drift",async()=>{
 const first=sample(161),second=sample(161);
 second[100]={...second[100],iddetalle:"999999"};
 const r=await run(source([first,second]).fetchImpl);
 assert.equal(r.identical_solr_id_sets,true);
 assert.equal(r.same_solr_id_remapped_worker_key,1);
 assert.equal(r.safe_for_further_review,false);
});
test("same numFound but one replaced Solr document fails closed",async()=>{
 const first=sample(161),second=sample(161);
 second[100]={...second[100],id:"SOLR_9999"};
 second.sort((a,b)=>a.id.localeCompare(b.id));
 const r=await run(source([first,second]).fetchImpl);
 assert.equal(r.first_total,r.second_total);
 assert.equal(r.removed_solr_ids,1);
 assert.equal(r.added_solr_ids,1);
 assert.equal(r.safe_for_further_review,false);
});
test("different Solr docs mapping to the same Worker key are a collision",async()=>{
 const docs=sample(161);
 docs[90]={...docs[90],iddetalle:docs[20].iddetalle};
 const r=await run(source([docs]).fetchImpl);
 assert.equal(r.first_keys.key_collisions,1);
 assert.equal(r.second_keys.key_collisions,1);
 assert.equal(r.unique_nonempty_worker_keys_both_passes,false);
 assert.equal(r.safe_for_further_review,false);
});
test("non-numeric iddetalle that falls back to Solr ID is not auto-approved",async()=>{
 const docs=sample(161);
 docs[5]={...docs[5],iddetalle:null};
 const r=await run(source([docs]).fetchImpl);
 assert.equal(r.first_keys.fallback_solr_id,1);
 assert.equal(r.only_numeric_detail_primary_keys,false);
 assert.equal(r.safe_for_further_review,false);
});
test("empty source key when no numeric candidates is rejected",async()=>{
 const docs=sample(161);
 docs[5]={id:"SOLR_ABC",iddetalle:null,idoferta:null};
 const r=await run(source([docs]).fetchImpl);
 assert.equal(r.first_keys.empty_worker_key,1);
 assert.equal(r.safe_for_further_review,false);
});
test("source partialResults errors abort rather than issuing green summary",async()=>{
 await assert.rejects(()=>run(source([sample(161)],{partial:true}).fetchImpl),/partial results/);
});
test("source cursor errors abort rather than issuing green summary",async()=>{
 await assert.rejects(()=>run(source([sample(161)],{invalidCursor:true}).fetchImpl),/NaN|invalid|Repeated|complete|cursor/i);
});
test("all integration files stay GET-only and never store identifiers",()=>{
 const src=readFileSync("scripts/audit-apd-abc-worker-key-twopass.mjs","utf8");
 const module=readFileSync("scripts/apd-abc-worker-key-two-pass-readonly.mjs","utf8");
 const cursor=readFileSync("scripts/apd-abc-cursor-full-readonly.mjs","utf8");
 assert.match(cursor,/method:"GET"/);
 assert.match(cursor,/credentials:"omit"/);
 assert.match(cursor,/id,iddetalle,idoferta/);
 assert.match(src,/identifiers_stored_or_printed:false/);
 assert.doesNotMatch(src+module,/service_role|SUPABASE_SERVICE_ROLE|supabaseUpsert|Authorization|\.\s*POST\b|method:"POST"|console\.log\(.*(?:doc|idToKey)/);
});
