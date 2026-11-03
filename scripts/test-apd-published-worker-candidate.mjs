import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {apdFetchPublishedOnlyDistrict} from "./apd-fetch-published-district-lab.mjs";
import {PUBLIC_ALERT_FIELDS} from "./apd-abc-published-projected-cursor-readonly.mjs";
const fakeOffer=(district,index)=>({
 id:"SOLR_"+district.replaceAll(" ","_")+"_"+index,
 iddetalle:String(index+(district==="AVELLANEDA"?100000:10000)),
 idoferta:String(index+200000),
 descdistrito:district,estado:"Publicada",
 escuela:"ESCUELA FICTICIA",descripcioncargo:"PRECEPTOR",
 descripcionarea:"PRECEPTOR",descnivelmodalidad:"SECUNDARIA",
 turno:"M",finoferta:"2026-11-30",ult_movimiento:"2026-11-02",
 observaciones:"No publicar datos de terceros"
});
function fakeApi(entries,settings={}){
 const requests=[];
 const fetchImpl=async(url,options)=>{
  assert.equal(options.method,"GET");
  assert.equal(options.credentials,"omit");
  assert.equal(options.redirect,"error");
  assert.equal(options.cache,"no-store");
  assert.equal(url.hostname,"servicios3.abc.gob.ar");
  assert.equal(url.searchParams.get("sort"),"id asc");
  assert.equal(url.searchParams.has("start"),false);
  assert.deepEqual(url.searchParams.get("fl").split(","),PUBLIC_ALERT_FIELDS);
  assert.doesNotMatch(url.searchParams.get("fl"),/cuil|reemp|domicilio|idsuna/i);
  const q=url.searchParams.get("q")||"";
  assert.match(q,/estado:"Publicada"/);
  const district=q.includes("LA MATANZA")?"LA MATANZA":"AVELLANEDA";
  const all=entries[district]||[];
  const cursor=url.searchParams.get("cursorMark");
  const offset=cursor==="*"?0:Number(cursor.slice(1));
  const rows=Number(url.searchParams.get("rows"));
  const docs=all.slice(offset,offset+rows).map(d=>({...d}));
  settings.change?.(docs,offset,district);
  requests.push({district,offset,found:docs.length});
  if(settings.httpError)return {ok:false,status:429};
  const count=settings.total?.(cursor,district)??all.length;
  const next=docs.length?("C"+(offset+docs.length)):cursor;
  const blob=new TextEncoder().encode(JSON.stringify({
   responseHeader:settings.partial?{partialResults:true}:{},
   response:{numFound:count,docs},nextCursorMark:next
  }));
  return {ok:true,status:200,arrayBuffer:async()=>blob.buffer};
 };
 return {fetchImpl,requests};
}
async function run(api,district="LA MATANZA",overrides={}){
 return apdFetchPublishedOnlyDistrict({
  district,fetchImpl:api.fetchImpl,
  normalizeDistrict:s=>String(s||"").toUpperCase(),
  districtVariants:d=>[d],
  escapeSolr:s=>String(s).replace(/"/g,'\\"'),
  keyFromOffer:d=>"D_"+String(d.iddetalle||"").replace(/[^0-9]/g,""),
  rows:100,maxPages:12,...overrides
 });
}
test("all 183 Published La Matanza offers recovered with no truncation (2 pages)",async()=>{
 const docs=Array.from({length:183},(_,i)=>fakeOffer("LA MATANZA",i+1));
 const api=fakeApi({"LA MATANZA":docs});
 const result=await run(api);
 assert.equal(result.totalBruto,183);
 assert.equal(result.totalFiltrado,183);
 assert.deepEqual(result.docs,docs);
 assert.equal(api.requests.length,2);
 assert.match(result.query,/estado:"Publicada"/);
});
test("Avellaneda 65 Published offers full coverage with 1 page",async()=>{
 const data=Array.from({length:65},(_,i)=>fakeOffer("AVELLANEDA",i+1));
 const api=fakeApi({AVELLANEDA:data});
 const result=await run(api,"AVELLANEDA");
 assert.deepEqual(result.docs,data);
 assert.equal(result.totalBruto,65);
 assert.equal(api.requests.length,1);
});
test("many historical non-Published rows do not cause a false 1600-row cutoff",async()=>{
 const docs=Array.from({length:183},(_,i)=>fakeOffer("LA MATANZA",i+1));
 const api=fakeApi({"LA MATANZA":docs});
 const result=await run(api);
 assert.equal(result.docs.length,183);
 assert.doesNotMatch(result.query,/ult_movimiento desc|start=/);
});
test("unexpected CUIL field returned despite fl fails closed",async()=>{
 const api=fakeApi({"LA MATANZA":[fakeOffer("LA MATANZA",1)]},{
  change:rows=>{if(rows[0])rows[0].cuilautor="SENSITIVE_FAKE";}
 });
 await assert.rejects(()=>run(api),/unexpected offer fields/);
});
test("duplicate Worker keys or Solr IDs fail closed",async()=>{
 const docs=[fakeOffer("LA MATANZA",1),fakeOffer("LA MATANZA",2)];
 docs[1].iddetalle=docs[0].iddetalle;
 await assert.rejects(()=>run(fakeApi({"LA MATANZA":docs})),/duplicate or invalid offer identity/);
 const ids=[fakeOffer("LA MATANZA",1),fakeOffer("LA MATANZA",2)];
 ids[1].id=ids[0].id;
 await assert.rejects(()=>run(fakeApi({"LA MATANZA":ids})),/duplicate or invalid offer identity/);
});
test("unexpected closed status or foreign district must be rejected",async()=>{
 for(const change of [{estado:"Cerrada"},{descdistrito:"QUILMES"}]){
  const api=fakeApi({"LA MATANZA":[fakeOffer("LA MATANZA",1)]},{
   change:rows=>{if(rows[0])Object.assign(rows[0],change)}
  });
  await assert.rejects(()=>run(api),/foreign district or non-published offer/);
 }
});
test("changed ABC numFound, partialResults, 429 or page cap are hard errors",async()=>{
 const data=Array.from({length:183},(_,i)=>fakeOffer("LA MATANZA",i+1));
 await assert.rejects(()=>run(fakeApi({"LA MATANZA":data},{
  total:cursor=>cursor==="*"?183:182
 })),/total changed/);
 await assert.rejects(()=>run(fakeApi({"LA MATANZA":data},{partial:true})),/partial results/);
 await assert.rejects(()=>run(fakeApi({"LA MATANZA":data},{httpError:true})),/HTTP 429/);
 const overCap=Array.from({length:250},(_,i)=>fakeOffer("LA MATANZA",i+1));
 await assert.rejects(()=>run(fakeApi({"LA MATANZA":overCap}),"LA MATANZA",
  {rows:100,maxPages:2}),/bounded page cap/);
});
test("district-wide deadline rejects a multi-page response after cumulative latency",async()=>{
 const docs=Array.from({length:183},(_,i)=>fakeOffer("LA MATANZA",i+1));
 let clock=0;
 const api=fakeApi({"LA MATANZA":docs},{change:()=>{clock+=1200;}});
 await assert.rejects(
  ()=>run(api,"LA MATANZA",{maxWallMs:2000,now:()=>clock}),
  /district time budget exceeded/
 );
 assert.equal(api.requests.length,2);
});
test("deadline rejects a slow last page even if all expected offers arrived",async()=>{
 const docs=Array.from({length:183},(_,i)=>fakeOffer("LA MATANZA",i+1));
 let clock=0;
 const api=fakeApi({"LA MATANZA":docs},{
  change:(_rows,offset)=>{clock+=offset===0?1800:250;}
 });
 await assert.rejects(
  ()=>run(api,"LA MATANZA",{maxWallMs:2000,now:()=>clock}),
  /district time budget exceeded/
 );
 assert.equal(api.requests.length,2);
});
test("empty Published result cannot be declared complete after district budget expired",async()=>{
 let clock=0;
 const api=fakeApi({"LA MATANZA":[]},{change:()=>{clock=1001;}});
 await assert.rejects(
  ()=>run(api,"LA MATANZA",{maxWallMs:1000,now:()=>clock}),
  /district time budget exceeded/
 );
});
test("unreasonable deadline and non-monotonic clocks are rejected",async()=>{
 const api=fakeApi({"LA MATANZA":[]});
 for(const maxWallMs of [0,999,60001,1.5,NaN]){
  await assert.rejects(()=>run(api,"LA MATANZA",{maxWallMs}),/bounded limits invalid/);
 }
 let tick=100;
 const back=fakeApi({"LA MATANZA":[]},{change:()=>{tick=99;}});
 await assert.rejects(
  ()=>run(back,"LA MATANZA",{now:()=>tick}),
  /monotonic clock invalid/
 );
});
test("valid complete multi-page result still passes within total budget",async()=>{
 const docs=Array.from({length:183},(_,i)=>fakeOffer("LA MATANZA",i+1));
 let clock=0;
 const api=fakeApi({"LA MATANZA":docs},{change:()=>{clock+=700;}});
 const result=await run(api,"LA MATANZA",{maxWallMs:2000,now:()=>clock});
 assert.equal(result.docs.length,183);
 assert.equal(result.totalBruto,183);
 assert.equal(api.requests.length,2);
});
test("privacy-and-performance combined generated Worker is syntax-complete",()=>{
 const worker=readFileSync("tmp/apd-alerts-performance/worker_published_minimized_candidate.js","utf8");
 const original=readFileSync("worker-live/worker_hotfix.js","utf8");
 assert.match(worker,/function apdMinimizedRawAlertOffer\(/);
 assert.match(worker,/async function apdFetchPublishedOnlyDistrict\(/);
 assert.match(worker,/AND estado:"Publicada"/);
 assert.match(worker,/cursorMark/);
 assert.match(worker,/maxWallMs=20000/);
 assert.match(worker,/ABC Published district time budget exceeded/);
 assert.match(worker,/Math\.min\(2, distritos\.length\)/);
 assert.match(worker,/apdSafeObservationNotice\(oferta\.observaciones\)/);
 assert.ok(!original.includes("function apdMinimizedRawAlertOffer("));
 assert.ok(!original.includes("async function apdFetchPublishedOnlyDistrict("));
});
