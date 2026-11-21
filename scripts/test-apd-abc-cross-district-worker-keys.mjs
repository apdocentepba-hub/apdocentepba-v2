import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadWorkerSourceKey} from "./apd-worker-source-key-readonly.mjs";
import {auditWorkerKeysAcrossDistricts} from "./apd-abc-cross-district-worker-keys-readonly.mjs";

const keyFunction=loadWorkerSourceKey(readFileSync("worker-live/worker_hotfix.js","utf8"));
function docs(prefix,base,size){
 return Array.from({length:size},(_,i)=>({
   id:prefix+"_"+String(i+1).padStart(4,"0"),
   iddetalle:String(base+i+1),
   idoferta:String(base+10000+i+1)
 }));
}
const fixtures=()=>({
 "LA MATANZA":[docs("MATANZA",10000,61)],
 "AVELLANEDA":[docs("AVELLANEDA",20000,61)]
});
function mock(sourceByDistrict){
 const pass={"LA MATANZA":-1,"AVELLANEDA":-1};
 let getCount=0;
 const fetchImpl=async(url,options)=>{
   assert.equal(options.method,"GET");
   assert.equal(options.credentials,"omit");
   assert.equal(url.hostname,"servicios3.abc.gob.ar");
   assert.equal(url.searchParams.get("fl"),"id,iddetalle,idoferta");
   assert.equal(url.searchParams.get("sort"),"id asc");
   const query=url.searchParams.get("q");
   const district=query?.match(/^descdistrito:"([^"]+)" AND estado:"Publicada"$/)?.[1];
   assert.ok(district in sourceByDistrict,"Unknown fixture district");
   const cursor=url.searchParams.get("cursorMark");
   if(cursor==="*")pass[district]++;
   const current=sourceByDistrict[district][Math.min(pass[district],sourceByDistrict[district].length-1)];
   const offset=cursor==="*"?0:Number(cursor.slice(1));
   const rows=Number(url.searchParams.get("rows"));
   const page=current.slice(offset,offset+rows);
   const next=page.length>0?"C"+(offset+page.length):cursor;
   getCount++;
   return {ok:true,status:200,arrayBuffer:async()=>
     (new TextEncoder().encode(JSON.stringify({
        responseHeader:{},response:{numFound:current.length,docs:page},
        nextCursorMark:next
     }))).buffer
   };
 };
 return {fetchImpl,get getCount(){return getCount;}};
}
const run=(fixture)=>auditWorkerKeysAcrossDistricts({
 fetchImpl:mock(fixture).fetchImpl,keyFunction,rows:60,maxPages:6
});

test("two districts: 2 passes each, 122 synthetic offers all distinct",async()=>{
 const fixture=fixtures();
 const svc=mock(fixture);
 const result=await auditWorkerKeysAcrossDistricts({
  fetchImpl:svc.fetchImpl,keyFunction,rows:60,maxPages:6
 });
 assert.equal(result.total_first_pass,122);
 assert.equal(result.total_second_pass,122);
 assert.equal(result.district_totals.length,2);
 assert.ok(result.district_totals.every(x=>x.first_pages===3&&x.second_pages===3));
 assert.equal(result.key_stability_and_global_uniqueness_observed,true);
 assert.equal(result.cross_district_worker_key_collisions_first,0);
 assert.equal(result.cross_district_solr_id_reuse_first,0);
 assert.equal(result.production_activation_authorized,false);
 assert.equal(svc.getCount,12);
 assert.doesNotMatch(JSON.stringify(result),/MATANZA_0001|D_10001|AVELLANEDA_0001/);
});

test("same iddetalle in different districts is rejected, even with different Solr IDs",async()=>{
 const fixture=fixtures();
 fixture.AVELLANEDA[0][3]={...fixture.AVELLANEDA[0][3],
   iddetalle:fixture["LA MATANZA"][0][20].iddetalle};
 const result=await run(fixture);
 assert.equal(result.cross_district_worker_key_collisions_first,1);
 assert.equal(result.cross_district_worker_key_collisions_second,1);
 assert.equal(result.safe_for_further_review,false);
});

test("source Solr ID reused by a different district is detected",async()=>{
 const fixture=fixtures();
 fixture.AVELLANEDA[0][0]={...fixture.AVELLANEDA[0][0],id:fixture["LA MATANZA"][0][0].id};
 const result=await run(fixture);
 assert.equal(result.cross_district_solr_id_reuse_first,1);
 assert.equal(result.safe_for_further_review,false);
});

test("stable ID but changed source_offer_key in the next pass fails",async()=>{
 const fixture=fixtures();
 const changed=fixture.AVELLANEDA[0].map(x=>({...x}));
 changed[2].iddetalle="999991";
 fixture.AVELLANEDA.push(changed);
 const result=await run(fixture);
 assert.equal(result.remapped_worker_keys_between_passes,1);
 assert.equal(result.safe_for_further_review,false);
});

test("count unchanged but ID replaced between passes is rejected",async()=>{
 const fixture=fixtures();
 const changed=fixture["LA MATANZA"][0].map(x=>({...x}));
 changed[5].id="MATANZA_9999";
 changed.sort((a,b)=>a.id.localeCompare(b.id));
 fixture["LA MATANZA"].push(changed);
 const result=await run(fixture);
 assert.equal(result.added_source_ids_between_passes,1);
 assert.equal(result.removed_source_ids_between_passes,1);
 assert.equal(result.safe_for_further_review,false);
});

test("any source fallback instead of numeric iddetalle blocks promotion",async()=>{
 const fixture=fixtures();
 fixture.AVELLANEDA[0][1]={...fixture.AVELLANEDA[0][1],iddetalle:null};
 const result=await run(fixture);
 assert.equal(result.nonprimary_or_missing_keys_first,1);
 assert.equal(result.safe_for_further_review,false);
});

test("same primary key duplicated within a district is rejected",async()=>{
 const fixture=fixtures();
 fixture.AVELLANEDA[0][4]={...fixture.AVELLANEDA[0][4],
  iddetalle:fixture.AVELLANEDA[0][3].iddetalle};
 const result=await run(fixture);
 assert.equal(result.duplicated_keys_within_district_first,1);
 assert.equal(result.safe_for_further_review,false);
});

test("unknown or repeated districts cannot be silently added",async()=>{
 const fixture=fixtures();
 const fetchImpl=mock(fixture).fetchImpl;
 for(const districts of [["LA MATANZA"],["LA MATANZA","LA MATANZA"],["LA MATANZA","OTHER"]])
   await assert.rejects(()=>auditWorkerKeysAcrossDistricts({fetchImpl,keyFunction,districts}),/two validated districts/);
});

test("audit driver writes only aggregate counts, no individual identifiers",()=>{
 const driver=readFileSync("scripts/audit-apd-abc-cross-district-worker-keys.mjs","utf8");
 const source=readFileSync("scripts/apd-abc-cross-district-worker-keys-readonly.mjs","utf8");
 assert.match(driver,/individual_identifiers_persisted:false/);
 assert.doesNotMatch(driver+source,/Authorization|supabaseUpsert|method:"POST"|console\.log\(.*(?:id|key)\)/);
});
