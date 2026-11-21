/* Differential tests of the TWO GENERATED Worker bundles, not a hand-written
 * approximation of the filtered reader. All offers and ABC replies are fake.
 * Requires both builders to run first. No credentials, traffic or database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const first=readFileSync("tmp/apd-bounded-abc-worker-release/worker_hotfix.js","utf8");
const second=readFileSync("tmp/apd-published-query-research/worker_hotfix.js","utf8");
const sha=x=>createHash("sha256").update(x).digest("hex");
const name="traerOfertasAPDDeUnDistrito";
function extract(source,fn,async=false){
 const start=source.indexOf((async?"async ":"")+"function "+fn+"(");
 const stop=source.indexOf("\n__name("+fn+",",start);
 assert.ok(start>=0&&stop>start,"Missing real Worker function "+fn);
 return source.slice(start,stop);
}
const originalFn=extract(first,name,true);
const filteredFn=extract(second,name,true);
const helperNames=["norm","normDistritoABC","districtQueryVariants","escaparSolr",
 "sanitizeSolrNumber","sanitizeKeyText","buildSourceOfferKeyFromOferta"];
const helpers=helperNames.map(n=>extract(first,n)).join("\n");
function makeReader(source,fetchFn){
 return new Function("fetch",helpers+"\n"+extract(source,name,true)+"\nreturn "+name+";")(fetchFn);
}
function offer(id,state="Publicada",other={}){
 return {iddetalle:id,descdistrito:"QUILMES",estado:state,
  ult_movimiento:"2026-11-04T11:00:00Z",finoferta:"2099-12-31",...other};
}
function source(docs,errorStatus){
 const log=[];
 async function fetchFn(url){
  const p=new URL(url).searchParams;
  const stateFilter=p.get("fq");
  const start=Number(p.get("start")),rows=Number(p.get("rows"));
  assert.equal(rows,200);
  assert.ok(p.get("q")?.includes("QUILMES"),"Expected district query");
  assert.ok(stateFilter===null||stateFilter==='estado:"Publicada"');
  log.push({start,rows,stateFilter});
  if(errorStatus)return {ok:false,status:errorStatus,text:async()=>""};
  const matched=stateFilter?docs.filter(d=>d.estado==="Publicada"):docs;
  const buffer=new TextEncoder().encode(JSON.stringify({
   response:{numFound:matched.length,docs:matched.slice(start,start+rows)}
  })).buffer;
  return {ok:true,status:200,arrayBuffer:async()=>buffer};
 }
 return {fetchFn,log};
}
test("second generated Worker is EXACTLY one allowed state-filter change",()=>{
 assert.equal(sha(first),"6ee13869ec0d6363806e1bfc8990d529f7386b956c7bd30530f5e0109c861b6e");
 assert.equal(sha(second),"19c8ab235ca8a07fee305797ad895d9e588535f754ded12470c58f1a83f3e870");
 assert.equal(second.replace(filteredFn,originalFn),first);
 assert.equal(filteredFn.replace('      fq: \'estado:"Publicada"\'',"").includes("fq:"),false);
 assert.match(filteredFn,/fq: 'estado:"Publicada"'/);
});
test("generated readers preserve every published ID, fields, order and deduplication across 200-row pages",async()=>{
 const docs=[
  ...Array.from({length:225},(_,i)=>offer(1000+i)),
  offer(1005),offer(9999,"Designada"),offer(9998,"Cerrada")
 ];
 const a=source(docs),b=source(docs);
 const before=await makeReader(first,a.fetchFn)("QUILMES");
 const after=await makeReader(second,b.fetchFn)("QUILMES");
 const published=before.docs.filter(d=>d.estado==="Publicada");
 assert.deepEqual(after.docs,published,"Filtered candidate changed public offer records/order");
 assert.equal(after.docs.length,225,"Deduplication must retain 225 unique publications");
 assert.deepEqual(b.log.map(x=>x.start),[0,200],"Filter must paginate >200 published rows");
 assert.ok(b.log.every(x=>x.stateFilter==='estado:"Publicada"'));
 assert.ok(a.log.every(x=>x.stateFilter===null));
});
test("generated filter retrieves a publication behind old 1600-row cap",async()=>{
 const docs=[...Array.from({length:1700},(_,i)=>offer(i+1,"Cerrada")),offer(90001)];
 const a=source(docs),b=source(docs);
 const before=await makeReader(first,a.fetchFn)("QUILMES");
 const after=await makeReader(second,b.fetchFn)("QUILMES");
 assert.equal(before.docs.filter(d=>d.estado==="Publicada").length,0);
 assert.deepEqual(after.docs.map(d=>d.iddetalle),[90001]);
 assert.equal(a.log.length,8);
 assert.equal(b.log.length,1);
});
test("generated filtered Worker propagates HTTP 429 and 503, never reports zero offers",async()=>{
 for(const status of [429,503]){
  const a=source([],status);
  await assert.rejects(()=>makeReader(second,a.fetchFn)("QUILMES"),
   new RegExp("ABC ERROR "+status));
  assert.deepEqual(a.log.map(x=>x.stateFilter),['estado:"Publicada"']);
 }
});
console.log("APD_SECOND_GENERATED_CANDIDATE_DIFFERENTIAL: fake source only; no real user, traffic or database");
