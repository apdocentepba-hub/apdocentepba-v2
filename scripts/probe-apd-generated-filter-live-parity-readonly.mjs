/* Live, PUBLIC ABC read-only parity: run the ACTUAL generated district
 * reader (q + fq) and compare against Solr's equivalent q + AND expression.
 * No users, plans, logins, Supabase access, writes, alerts or deployment.
 * Uses at most 4 HTTP GETs total for the two selected districts.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const code=readFileSync("tmp/apd-published-query-research/worker_hotfix.js","utf8");
const url="https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select";
const districts=["QUILMES","TIGRE"];
function def(name,async=false){
 const start=code.indexOf((async?"async ":"")+"function "+name+"(");
 const end=code.indexOf("\n__name("+name+",",start);
 assert.ok(start>=0&&end>start,"Missing generated Worker function: "+name);
 return code.slice(start,end);
}
const helperNames=["norm","normDistritoABC","districtQueryVariants","escaparSolr",
 "sanitizeSolrNumber","sanitizeKeyText","buildSourceOfferKeyFromOferta"];
const helpers=helperNames.map(name=>def(name)).join("\n");
const authorizedFetch=async (requestUrl,options={})=>{
 const target=new URL(requestUrl);
 assert.equal(target.origin,new URL(url).origin,"Only ABC public Solr endpoint is allowed");
 assert.equal(target.pathname,new URL(url).pathname);
 assert.equal(target.searchParams.get("fq"),'estado:"Publicada"');
 assert.equal(target.searchParams.get("rows"),"200");
 return fetch(target,{...options,redirect:"error",signal:AbortSignal.timeout(20000)});
};
const load=new Function("fetch",helpers+"\n"+def("traerOfertasAPDDeUnDistrito",true)+
 "\nreturn {reader:traerOfertasAPDDeUnDistrito, key:buildSourceOfferKeyFromOferta};");
const actual=load(authorizedFetch);
function projected(doc){
 return ["iddetalle","idoferta","descdistrito","estado","finoferta","ult_movimiento",
  "descripcioncargo","descnivelmodalidad","turno"].map(k=>[k,doc[k]??null]);
}
const orderedMap=(docs)=>{
 const pairs=docs.map(x=>[actual.key(x),projected(x)]);
 assert.ok(pairs.every(([k])=>k),"ABC public document missing offer key");
 return new Map(pairs.sort((a,b)=>a[0].localeCompare(b[0])));
};
for(const district of districts){
 const candidate=await actual.reader(district);
 assert.ok(candidate.query&&candidate.query.includes(district));
 // This second, independently formatted Solr query follows the established
 // email-reader expression; unlike the candidate, it does not use fq.
 const params=new URLSearchParams({
  q:candidate.query+' AND estado:"Publicada"',rows:"200",start:"0",
  wt:"json",sort:"ult_movimiento desc"
 });
 const response=await fetch(url+"?"+params.toString(),{
  method:"GET",redirect:"error",signal:AbortSignal.timeout(20000),
  headers:{"accept":"application/json, text/javascript, */*; q=0.01",
   "user-agent":"Mozilla/5.0","referer":"http://servicios2.abc.gob.ar/",
   "origin":"http://servicios2.abc.gob.ar"}
 });
 assert.equal(response.status,200,"Reference ABC query failed: "+district);
 const bytes=await response.arrayBuffer();
 assert.ok(bytes.byteLength>0&&bytes.byteLength<4*1024*1024);
 const data=JSON.parse(new TextDecoder("iso-8859-1").decode(bytes));
 assert.ok(Array.isArray(data?.response?.docs));
 const numFound=Number(data.response.numFound??-1);
 assert.ok(numFound>=0&&numFound<=200,
  "Reference ABC result exceeds one-page proof cap; increase scope before concluding parity");
 const reference=data.response.docs;
 assert.equal(reference.length,numFound,"Unexpected reference pagination");
 const candidateMap=orderedMap(candidate.docs),referenceMap=orderedMap(reference);
 assert.ok(candidate.docs.every(x=>String(x.estado||"").toUpperCase()==="PUBLICADA"),
  "Candidate received non-published offers");
 assert.ok(reference.every(x=>String(x.estado||"").toUpperCase()==="PUBLICADA"),
  "Reference received non-published offers");
 assert.deepEqual(candidateMap,referenceMap,"Published offer ID/field mismatch on live ABC: "+district);
 console.log("APD_LIVE_GENERATED_READER_PARITY "+JSON.stringify({
  district,reference_count:reference.length,candidate_count:candidate.docs.length,
  stable_fields_and_ids_match:true,source_state:"Publicada",
  actual_generated_worker_reader:true,public_source_only:true,
  no_credentials_or_account_data:true,production_unchanged:true
 }));
}
