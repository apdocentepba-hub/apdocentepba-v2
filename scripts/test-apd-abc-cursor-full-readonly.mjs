import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readPublishedIdsByCursor,readTwoPublishedCursorPasses} from "./apd-abc-cursor-full-readonly.mjs";

function source({perPass,duplicate=false,totalDrift=false,partial=false}){
 let pass=-1;const calls=[];
 const fetchImpl=async url=>{
  const mark=url.searchParams.get("cursorMark");
  if(mark==="*")pass++;
  assert.equal(url.hostname,"servicios3.abc.gob.ar");
  assert.equal(url.searchParams.get("sort"),"id asc");
  assert.equal(url.searchParams.get("fl"),"id");
  assert.equal(url.searchParams.has("start"),false);
  assert.equal(url.searchParams.get("rows"),"60");
  const data=perPass[Math.min(pass,perPass.length-1)];
  const offset=mark==="*"?0:Number(mark.slice(1));
  const rows=60;
  const docs=data.slice(offset,offset+rows).map(id=>({id}));
  if(duplicate&&offset===60&&docs.length>0)docs[0]={id:data[0]};
  const next=docs.length>0?"C"+(offset+docs.length):mark;
  calls.push({mark,offset,pass});
  const response={
    responseHeader:partial&&offset===60?{partialResults:true}:{},
    response:{numFound:totalDrift&&offset===60?data.length+1:data.length,docs},
    nextCursorMark:next
  };
  return {ok:true,status:200,arrayBuffer:async()=>
    new TextEncoder().encode(JSON.stringify(response)).buffer};
 };
 return {fetchImpl,calls};
}
const keys=n=>Array.from({length:n},(_,i)=>"OFF_"+String(i).padStart(4,"0"));
test("full Solr cursor reads 161 IDs in 4 pages, two passes same set",async()=>{
 const sourceApi=source({perPass:[keys(161)]});
 const result=await readTwoPublishedCursorPasses({fetchImpl:sourceApi.fetchImpl});
 assert.equal(result.first.total,161);
 assert.equal(result.first.ids.size,161);
 assert.equal(result.first.pages,4);
 assert.equal(result.second.pages,4);
 assert.equal(result.identicalIdSets,true);
 assert.equal(sourceApi.calls.length,8);
});
test("same numFound but replaced ID between two passes is detected",async()=>{
 const a=keys(161),b=[...a];
 b[80]="OFF_CHANGED";
 b.sort();
 const result=await readTwoPublishedCursorPasses({
   fetchImpl:source({perPass:[a,b]}).fetchImpl
 });
 assert.equal(result.first.total,result.second.total);
 assert.equal(result.identicalIdSets,false);
});
test("duplicate across cursor pages is rejected",async()=>{
 await assert.rejects(
  ()=>readPublishedIdsByCursor({
   fetchImpl:source({perPass:[keys(161)],duplicate:true}).fetchImpl
  }),/duplicated/);
});
test("source count drifting across pages fails closed",async()=>{
 await assert.rejects(
  ()=>readPublishedIdsByCursor({
   fetchImpl:source({perPass:[keys(161)],totalDrift:true}).fetchImpl
  }),/total changed/);
});
test("partialResults and page cap prevent false complete claims",async()=>{
 await assert.rejects(
  ()=>readPublishedIdsByCursor({
   fetchImpl:source({perPass:[keys(161)],partial:true}).fetchImpl
  }),/partial results/);
 await assert.rejects(
  ()=>readPublishedIdsByCursor({
   fetchImpl:source({perPass:[keys(161)]}).fetchImpl,maxPages:2
  }),/page cap/);
});
test("reader is limited to one public index, GET and ID-only projection",()=>{
 const code=readFileSync("scripts/apd-abc-cursor-full-readonly.mjs","utf8");
 assert.match(code,/fl:"id"/);
 assert.match(code,/sort:"id asc"/);
 assert.match(code,/credentials:"omit"/);
 assert.match(code,/method:"GET"/);
 assert.doesNotMatch(code,/Authorization|service_role|SUPABASE_SERVICE_ROLE|DNI|CUIL|raw:doc|method:"POST"/);
});
