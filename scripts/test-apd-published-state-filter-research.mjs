/* Research-only: test published-state Solr filtering for panel, matching
 * the existing live email reader. Does not change uploaded Cloudflare module.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const worker=readFileSync("worker-live/worker_hotfix.js","utf8");
function def(name,async=false){
 const st=worker.indexOf((async?"async ":"")+"function "+name+"(");
 const en=worker.indexOf("\n__name("+name+",",st);
 assert.ok(st>=0&&en>st,name+" missing");
 return worker.slice(st,en);
}
const helpers=["norm","normDistritoABC","districtQueryVariants","escaparSolr",
 "sanitizeSolrNumber","sanitizeKeyText","buildSourceOfferKeyFromOferta",
 "estadoOfertaEsPublicada"].map(name=>def(name)).join("\n");
const orig=def("traerOfertasAPDDeUnDistrito",true);
const marker='      sort: "ult_movimiento desc"';
assert.equal(orig.split(marker).length,2);
const candidate=orig.replace(marker,marker+',\n      fq: \'estado:"Publicada"\'');
function reader(code,fetchFn){
 return new Function("fetch",helpers+"\n"+code+"\nreturn traerOfertasAPDDeUnDistrito;")(fetchFn);
}
const offer=(id,estado)=>({iddetalle:id,estado,descdistrito:"QUILMES",ult_movimiento:"2026-11-04T11:00:00Z"});
function fakeSource(docs,throttle=false){
 let calls=0,filtered=0;
 const fetchFn=async url=>{
  calls++;
  const p=new URL(url).searchParams;
  assert.ok(p.get("q")?.includes("QUILMES"));
  const fq=p.get("fq")==='estado:"Publicada"';
  if(fq)filtered++;
  if(throttle)return {ok:false,status:429,text:async()=>"simulated"};
  const selection=fq?docs.filter(d=>d.estado==="Publicada"):docs;
  const first=Number(p.get("start")),take=Number(p.get("rows"));
  const bytes=new TextEncoder().encode(JSON.stringify({response:{docs:selection.slice(first,first+take),numFound:selection.length}}));
  return {ok:true,status:200,arrayBuffer:async()=>bytes.buffer};
 };
 return {fetchFn,stats:()=>({calls,filtered})};
}
test("filter preserves a published offer and avoids seven unnecessary ABC pages",async()=>{
 const docs=[offer(8,"Publicada"),...Array.from({length:1800},(_,i)=>offer(i+100,"Designada"))];
 const a=fakeSource(docs),b=fakeSource(docs);
 const raw=await reader(orig,a.fetchFn)("QUILMES");
 const live=await reader(candidate,b.fetchFn)("QUILMES");
 assert.deepEqual(live.docs.map(d=>d.iddetalle),raw.docs.filter(d=>d.estado==="Publicada").map(d=>d.iddetalle));
 assert.deepEqual(live.docs.map(d=>d.iddetalle),[8]);
 assert.equal(a.stats().calls,8);
 assert.equal(b.stats().calls,1);
 assert.equal(b.stats().filtered,1);
});
test("filter reaches published items beyond original eight-page cap in a fixture",async()=>{
 const docs=[...Array.from({length:1700},(_,i)=>offer(i+100,"Cerrada")),offer(90001,"Publicada")];
 const a=fakeSource(docs),b=fakeSource(docs);
 const old=await reader(orig,a.fetchFn)("QUILMES");
 const updated=await reader(candidate,b.fetchFn)("QUILMES");
 assert.equal(old.docs.filter(d=>d.estado==="Publicada").length,0);
 assert.deepEqual(updated.docs.map(d=>d.iddetalle),[90001]);
 assert.equal(a.stats().calls,8);
 assert.equal(b.stats().calls,1);
});
test("source 429 propagates instead of returning zero offers",async()=>{
 await assert.rejects(()=>reader(candidate,fakeSource([],true).fetchFn)("QUILMES"),/ABC ERROR 429/);
});
test("uploaded zero-traffic version builder remains unchanged",()=>{
 const src=readFileSync("scripts/build-apd-bounded-abc-worker-release.mjs","utf8");
 assert.doesNotMatch(src,/fq: ['"]estado:/);
 assert.match(worker,/async function traerOfertasAPDDeUnDistrito/);
});
