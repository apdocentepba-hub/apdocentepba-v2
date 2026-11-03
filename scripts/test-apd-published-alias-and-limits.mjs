/* Disposable contract tests: use exact district alias/normalization/key functions
 * extracted from the current Worker and inject only fake ABC HTTP responses.
 * No external requests, production writes, tokens, or real offer identities.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {apdFetchPublishedOnlyDistrict} from "./apd-fetch-published-district-lab.mjs";
const worker=readFileSync("worker-live/worker_hotfix.js","utf8");
const functionNames=["norm","normDistritoABC","districtQueryVariants",
 "escaparSolr","sanitizeSolrNumber","sanitizeKeyText","buildSourceOfferKeyFromOferta"];
const source=functionNames.map(name=>{
 const begin=worker.indexOf("function "+name+"(");
 const end=worker.indexOf("\n__name("+name+",",begin);
 assert.ok(begin>=0&&end>begin,"Canonical Worker helper not found: "+name);
 return worker.slice(begin,end);
}).join("\n");
const canonical=new Function(source+"\nreturn {"+functionNames.join(",")+"};")();
const record=(name,i)=>({
 id:"CI_SOLR_"+i,iddetalle:String(1000000+i),idoferta:String(2000000+i),
 descdistrito:name,estado:"Publicada",
 descripcioncargo:"PRECEPTOR",escuela:"ESCUELA FICTICIA",
 observaciones:"No publicar texto libre"
});
const docSet=(name,n)=>Array.from({length:n},(_,i)=>record(name,i+1));
function fakeSource(offers,settings={}){
 const urls=[];
 return {
  urls,
  fetchImpl:async(url,opts)=>{
   assert.equal(opts.method,"GET");
   assert.equal(opts.credentials,"omit");
   assert.equal(opts.redirect,"error");
   assert.equal(url.searchParams.get("sort"),"id asc");
   assert.equal(url.searchParams.get("fl")?.includes("cuilautor"),false);
   const cursor=url.searchParams.get("cursorMark");
   const offset=cursor==="*"?0:Number(cursor.slice(1));
   const rows=Number(url.searchParams.get("rows"));
   const out=offers.slice(offset,offset+rows);
   urls.push(url);
   const found=settings.count?.(cursor)??offers.length;
   const payload={response:{numFound:found,docs:out},
    nextCursorMark:out.length?"C"+(offset+out.length):cursor};
   settings.alter?.(payload,cursor);
   const buffer=new TextEncoder().encode(JSON.stringify(payload)).buffer;
   return {ok:true,status:200,arrayBuffer:async()=>buffer};
  }
 };
}
const audit=(district,provider,settings={})=>
 apdFetchPublishedOnlyDistrict({
  district,fetchImpl:provider.fetchImpl,
  normalizeDistrict:canonical.normDistritoABC,
  districtVariants:canonical.districtQueryVariants,
  escapeSolr:canonical.escaparSolr,
  keyFromOffer:canonical.buildSourceOfferKeyFromOferta,
  rows:100,maxPages:12,...settings
 });
test("canonical Lomas de Zamora aliases match a real Worker query and original source spelling",async()=>{
 const provider=fakeSource(docSet("L DE ZAMORA",3));
 const result=await audit("LOMAS DE ZAMORA",provider);
 assert.equal(result.totalBruto,3);
 assert.equal(result.docs.length,3);
 const q=provider.urls[0].searchParams.get("q");
 assert.match(q,/descdistrito:"L DE ZAMORA"/);
 assert.match(q,/estado:"Publicada"/);
});
test("canonical General San Martin and Partido de la Costa source aliases pass without dropping rows",async()=>{
 for(const [requested,raw] of [
  ["GENERAL SAN MARTIN","G SAN MARTIN"],
  ["PARTIDO DE LA COSTA","LA COSTA"],
  ["GENERAL PUEYRREDON","GRAL PUEYRREDON"]
 ]){
  const provider=fakeSource(docSet(raw,3));
  const result=await audit(requested,provider);
  assert.equal(result.docs.length,3,requested);
  assert.ok(provider.urls[0].searchParams.get("q").includes('descdistrito:"'+raw+'"'));
 }
});
test("blank or unresolvable district is explicit error, never false zero offers",async()=>{
 let calls=0;
 const source={fetchImpl:async()=>{calls++;throw Error("Must not fetch invalid district")}};
 await assert.rejects(()=>audit("",source),/Invalid ABC district identity/);
 await assert.rejects(()=>audit("!!!",source),/Invalid ABC district identity/);
 await assert.rejects(()=>audit("LANUS",source,{
  districtVariants:()=>[]
 }),/Invalid ABC district identity/);
 assert.equal(calls,0);
});
test("truly empty source completes with zero, distinct from bad district",async()=>{
 const source=fakeSource([]);
 const output=await audit("AVELLANEDA",source);
 assert.equal(output.totalBruto,0);
 assert.deepEqual(output.docs,[]);
 assert.equal(source.urls.length,1);
});
test("all 1199 offers within page cap complete without any silent truncation",async()=>{
 const source=fakeSource(docSet("LA MATANZA",1199));
 const value=await audit("LA MATANZA",source);
 assert.equal(value.docs.length,1199);
 assert.equal(source.urls.length,12);
});
test("at 1201 offers, bounded limit returns error instead of partially presenting results",async()=>{
 const source=fakeSource(docSet("LA MATANZA",1201));
 await assert.rejects(()=>audit("LA MATANZA",source),/bounded page cap/);
 assert.equal(source.urls.length,12);
});
test("bad cursor and inconsistent totals reject even when initial page appeared valid",async()=>{
 const many=docSet("LA MATANZA",101);
 const bad=fakeSource(many,{alter:(payload,cursor)=>{
  if(cursor==="*")payload.nextCursorMark="*";
 }});
 await assert.rejects(()=>audit("LA MATANZA",bad),/incomplete cursor coverage/);
 const unstable=fakeSource(many,{count:cursor=>cursor==="*"?101:100});
 await assert.rejects(()=>audit("LA MATANZA",unstable),/total changed/);
});
test("no source IDs or observations are emitted by these tests",()=>{
 const text=readFileSync("scripts/apd-fetch-published-district-lab.mjs","utf8");
 assert.doesNotMatch(text,/console\.log\(|console\.warn\(|supabase|workers\.dev/);
});
