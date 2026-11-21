import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadWorkerSourceKey} from "./apd-worker-source-key-readonly.mjs";
import {auditProjectedPublicOffers,PUBLIC_ALERT_FIELDS} from "./apd-abc-published-projected-cursor-readonly.mjs";

const workerKey=loadWorkerSourceKey(readFileSync("worker-live/worker_hotfix.js","utf8"));
const make=(district,count)=>Array.from({length:count},(_,i)=>({
 id:"SOLR_"+district.replaceAll(" ","_")+"_"+String(i+1),
 iddetalle:String(i+10001+(district==="AVELLANEDA"?500000:0)),
 idoferta:String(i+20001),descdistrito:district,estado:"Publicada",
 escuela:"EES TEST",cargo:"PRECEPTOR",descripcioncargo:"PRECEPTOR",
 turno:"M",ult_movimiento:"2026-11-02T15:00:00Z",finoferta:"2099-12-31",
 lunes:"7:30"
}));
function mock(dataByDistrict,overrides={}){
 const cursors=new Map(),requests=[];
 const fetchImpl=async(url,init)=>{
  assert.equal(url.hostname,"servicios3.abc.gob.ar");
  assert.equal(init.method,"GET");
  assert.equal(init.credentials,"omit");
  assert.equal(init.redirect,"error");
  assert.equal(init.cache,"no-store");
  const fields=url.searchParams.get("fl").split(",");
  assert.deepEqual(fields,PUBLIC_ALERT_FIELDS);
  assert.ok(!fields.some(x=>/cuil|reemp|domicilio|idsuna/i.test(x)));
  assert.equal(url.searchParams.get("sort"),"id asc");
  assert.equal(url.searchParams.has("start"),false);
  const district=url.searchParams.get("q")?.match(/descdistrito:"([^"]+)" AND estado:"Publicada"/)?.[1];
  const docsAll=dataByDistrict[district];
  assert.ok(Array.isArray(docsAll),"Only allowed pilot districts in fixtures");
  const cursor=url.searchParams.get("cursorMark");
  const offset=cursor==="*"?0:Number(cursor.slice(1));
  const rows=Number(url.searchParams.get("rows"));
  const docs=docsAll.slice(offset,offset+rows).map(x=>({...x}));
  if(overrides.changeDocument)overrides.changeDocument(docs,offset,district);
  const next=docs.length?"C"+(offset+docs.length):cursor;
  const count=(overrides.numFound && overrides.numFound(cursor,district))??docsAll.length;
  requests.push({district,cursor,docs:docs.length});
  const payload=JSON.stringify({
   responseHeader:overrides.partial?{partialResults:true}:{},
   response:{numFound:count,docs},nextCursorMark:next
  });
  return {ok:true,status:200,arrayBuffer:async()=>new TextEncoder().encode(payload).buffer};
 };
 return {fetchImpl,requests};
}
const audit=(fetchImpl,district="LA MATANZA",options={})=>
 auditProjectedPublicOffers({fetchImpl,district,keyFunction:workerKey,rows:100,maxPages:8,...options});
test("full published projection covers all 183 documents, 3 cursor pages, no personal fields",async()=>{
 const f=mock({"LA MATANZA":make("LA MATANZA",183)});
 const result=await audit(f.fetchImpl);
 assert.equal(result.publicada_total,183);
 assert.equal(result.unique_source_ids,183);
 assert.equal(result.unique_worker_keys,183);
 assert.equal(result.pages,3);
 assert.equal(f.requests.length,3);
 assert.equal(result.complete_projected_read,true);
 assert.equal(result.production_activation_authorized,false);
 assert.equal(result.non_allowlisted_fields_received,false);
 assert.doesNotMatch(JSON.stringify(result),/SOLR_|D_10001|cuilautor/);
});
test("Avellaneda published-only scan is also complete",async()=>{
 const f=mock({AVELLANEDA:make("AVELLANEDA",65)});
 const r=await audit(f.fetchImpl,"AVELLANEDA");
 assert.equal(r.publicada_total,65);
 assert.equal(r.pages,2);
});
test("Solr returning a CUIL, even if not requested, fails closed",async()=>{
 const f=mock({"LA MATANZA":make("LA MATANZA",2)},{
  changeDocument(docs){if(docs[0])docs[0].cuilautor="fake-test-value";}
 });
 await assert.rejects(()=>audit(f.fetchImpl),/non-allowlisted/);
});
test("same Worker key on two source IDs fails, no aggregate green report",async()=>{
 const src=make("LA MATANZA",3);
 src[1].iddetalle=src[0].iddetalle;
 const f=mock({"LA MATANZA":src});
 await assert.rejects(()=>audit(f.fetchImpl),/Duplicate source ID or Worker key/);
});
test("non-published or foreign district returned by source is rejected",async()=>{
 for(const replacement of [{estado:"Cerrada"},{descdistrito:"QUILMES"}]){
  const f=mock({"LA MATANZA":make("LA MATANZA",2)},{
   changeDocument(docs){if(docs[0])Object.assign(docs[0],replacement);}
  });
  await assert.rejects(()=>audit(f.fetchImpl),/identity, district or published state/);
 }
});
test("changed numFound or partial results must never be treated as complete",async()=>{
 const src=make("LA MATANZA",150);
 const altered=mock({"LA MATANZA":src},{
  numFound:cursor=>cursor==="*"?150:149
 });
 await assert.rejects(()=>audit(altered.fetchImpl),/Published count changed/);
 const partial=mock({"LA MATANZA":src},{partial:true});
 await assert.rejects(()=>audit(partial.fetchImpl),/Partial results/);
});
test("page cap detected rather than silently ignoring source offers",async()=>{
 const f=mock({"LA MATANZA":make("LA MATANZA",350)});
 await assert.rejects(()=>audit(f.fetchImpl,"LA MATANZA",{rows:100,maxPages:2}),/page cap/);
});
test("invalid or duplicate Solr source ID fails closed",async()=>{
 const docs=make("LA MATANZA",3);docs[1].id=docs[0].id;
 await assert.rejects(()=>audit(mock({"LA MATANZA":docs}).fetchImpl),/Duplicate source ID/);
 const missing=make("LA MATANZA",2);missing[0].id=null;
 await assert.rejects(()=>audit(mock({"LA MATANZA":missing}).fetchImpl),/identity/);
});
test("HTTP errors never become empty list",async()=>{
 await assert.rejects(()=>audit(async()=>({ok:false,status:429})),/HTTP 429/);
});
test("no credential, mutation, or individual IDs exposed by proof module",()=>{
 const s=readFileSync("scripts/apd-abc-published-projected-cursor-readonly.mjs","utf8");
 assert.match(s,/method:"GET"/);
 assert.match(s,/credentials:"omit"/);
 assert.match(s,/production_activation_authorized:false/);
 assert.doesNotMatch(s,/method:"POST"|supabaseUpsert|\bconsole\.log\(doc\)|Authorization/);
});
