import test from "node:test";
import assert from "node:assert/strict";
import {createAtomicStagePilotClient} from "./apd-atomic-stage-rest-adapter.mjs";

const ID="00000000-0000-0000-0000-000000000701";
const captureStartedAt="2026-11-02T15:00:00Z";
const capturedAt="2026-11-02T15:15:00Z";
function stub({failPath=null,ambiguousFinalize=false}={}){
 const requests=[],pages=[];
 let stageCount=0,sealed=false,finalized=false;
 const fetchImpl=async(url,init)=>{
  const u=new URL(url);
  const body=JSON.parse(init.body);
  requests.push({path:u.pathname,body,init});
  assert.equal(u.origin,"https://apd-pilot.invalid");
  assert.equal(init.method,"POST");
  assert.equal(init.credentials,"omit");
  assert.equal(init.headers["Content-Profile"],"apd_scanner_pilot");
  assert.equal(init.headers["Prefer"],"return=representation");
  if(u.pathname===failPath) return {ok:false,status:503,json:async()=>({error:"DO_NOT_EXPOSE_SECRET"})};
  const json=data=>({ok:true,json:async()=>data});
  if(u.pathname==="/runs"){
   assert.equal(body.allow_prune,false);
   return json([body]);
  }
  if(u.pathname==="/rpc/stage_page"){
   const index=body.p_page_index;
   assert.equal(index,stageCount);
   pages.push(body.p_rows);
   stageCount++;
   return json(stageCount);
  }
  if(u.pathname==="/rpc/seal_capture"){
   assert.equal(stageCount,5);
   sealed=true;
   return json(pages.reduce((n,x)=>n+x.length,0));
  }
  if(u.pathname==="/rpc/finalize_district"){
   assert.equal(sealed,true);
   assert.equal(body.p_prune,false);
   assert.equal(body.p_inject_error_for_test,false);
   finalized=true;
   if(ambiguousFinalize)throw Error("network lost after COMMIT");
   return json([{upserted:650,pruned:0}]);
  }
  throw Error("Unexpected API path "+u.pathname);
 };
 return {requests,pages,fetchImpl,finalized:()=>finalized};
}
test("pilot refuses live Supabase and public Worker hosts by construction",()=>{
 for(const url of [
  "https://apd-prod.supabase.co/",
  "https://apdocentepba.workers.dev/",
  "https://example.com/",
  "https://apd-pilot.invalid/unsafe/",
  "http://user:password@localhost/",
 ]){
  assert.throws(()=>createAtomicStagePilotClient({
   baseUrl:url,enabled:true,fetchImpl:async()=>{}
  }),/refuses/);
 }
 assert.throws(()=>createAtomicStagePilotClient({
  baseUrl:"https://apd-pilot.invalid/",enabled:false,fetchImpl:async()=>{}
 }),/disabled/);
});
test("stages 650 synthetic offers in five bounded pages; seals and finalizes with prune false",async()=>{
 const fake=stub();
 const client=createAtomicStagePilotClient({
   baseUrl:"https://apd-pilot.invalid/",enabled:true,fetchImpl:fake.fetchImpl
 });
 await client.createRun({runId:ID,district:"MATANZA",expectedPages:5,captureStartedAt,capturedAt});
 for(let index=0;index<5;index++){
  const rows=Array.from({length:Math.min(150,650-index*150)},(_,offset)=>({
   source_offer_key:"D_"+(index*150+offset+1),distrito:"MATANZA",estado:"Publicada",
   raw:{private:"NEVER_SEND"},user_email:"NEVER_SEND"
  }));
  assert.equal(await client.stagePage({runId:ID,pageIndex:index,sourceTotal:650,rows}),index+1);
 }
 assert.equal(await client.seal(ID),650);
 const outcome=await client.finalizeWithoutPruning(ID);
 assert.deepEqual(outcome,{upserted:650,pruned:0});
 assert.equal(fake.pages.length,5);
 assert.deepEqual(fake.pages.map(p=>p.length),[150,150,150,150,50]);
 assert.equal(fake.requests.length,8);
 assert.equal(fake.finalized(),true);
 for(const page of fake.pages){
  for(const row of page){
   assert.deepEqual(Object.keys(row).sort(),["distrito","estado","source_offer_key"].sort());
   assert.ok(!JSON.stringify(row).includes("NEVER_SEND"));
  }
 }
 assert.equal(fake.requests.filter(x=>x.path==="/rpc/finalize_district").length,1);
});
test("invalid rows fail locally before any PostgREST request",async()=>{
 const fake=stub();
 const client=createAtomicStagePilotClient({baseUrl:"https://apd-pilot.invalid/",enabled:true,fetchImpl:fake.fetchImpl});
 const badCases=[
  [{source_offer_key:"X",distrito:"MATANZA",estado:"Anulada"}],
  [{source_offer_key:"",distrito:"MATANZA",estado:"Publicada"}],
  [{source_offer_key:"X",distrito:"INVALID\nDISTRICT",estado:"Publicada"}],
  [{source_offer_key:"X",distrito:"MATANZA",estado:"Publicada"},
   {source_offer_key:"X",distrito:"MATANZA",estado:"Publicada"}],
  Array.from({length:151},(_,i)=>({source_offer_key:"X"+i,distrito:"MATANZA",estado:"Publicada"}))
 ];
 for(const rows of badCases)
  await assert.rejects(()=>client.stagePage({runId:ID,pageIndex:0,sourceTotal:650,rows}));
 assert.equal(fake.requests.length,0);
});
test("HTTP errors hide response bodies and never start automatic retries",async()=>{
 const fake=stub({failPath:"/rpc/stage_page"});
 const client=createAtomicStagePilotClient({baseUrl:"https://apd-pilot.invalid/",enabled:true,fetchImpl:fake.fetchImpl});
 await assert.rejects(()=>client.stagePage({runId:ID,pageIndex:0,sourceTotal:650,
    rows:[{source_offer_key:"D_1",distrito:"MATANZA",estado:"Publicada"}]}),
  e=>e.message.includes("HTTP 503")&&!e.message.includes("DO_NOT_EXPOSE_SECRET"));
 assert.equal(fake.requests.length,1);
});
test("ambiguous finalize after commit is never retried automatically",async()=>{
 const fake=stub({ambiguousFinalize:true});
 const client=createAtomicStagePilotClient({baseUrl:"https://apd-pilot.invalid/",enabled:true,fetchImpl:fake.fetchImpl});
 await client.createRun({runId:ID,district:"MATANZA",expectedPages:5,captureStartedAt,capturedAt});
 for(let i=0;i<5;i++)await client.stagePage({runId:ID,pageIndex:i,sourceTotal:650,
   rows:[]});
 await client.seal(ID);
 await assert.rejects(()=>client.finalizeWithoutPruning(ID),/network lost after COMMIT/);
 assert.equal(fake.requests.filter(x=>x.path==="/rpc/finalize_district").length,1);
 assert.equal(fake.finalized(),true);
});
