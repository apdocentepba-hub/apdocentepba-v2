/* Behavioral differential: original sequential Supabase upserts vs bulk candidate.
 * All Supabase responses and offers are synthetic. No network or credentials.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
const original=readFileSync("tmp/apd-published-pid-research/worker_hotfix.js","utf8");
const candidate=readFileSync("tmp/apd-bulk-sync-research/worker_hotfix.js","utf8");
const fnName="syncUserOfferState";
function extract(text){
 const start=text.indexOf("async function "+fnName+"(");
 const end=text.indexOf("\n__name("+fnName+",",start);
 assert.ok(start>0&&end>start,"Worker function missing");
 return text.slice(start,end);
}
const oldFn=extract(original),newFn=extract(candidate);
assert.equal(candidate.replace(newFn,oldFn),original,"Only syncUserOfferState may change");
const normalize=o=>({offer_id:o.offer_id,detail:o.iddetalle,cargo:o.cargo,source_offer_key:o.source_offer_key});
const getId=o=>String(o.source_offer_key||"D_"+o.iddetalle);
function fixture({existing=[],failPost=false,delayMs=0}={}){
 const rows=new Map(existing.map(x=>[String(x.offer_id),{...x,is_active:true}]));
 const stats={get:0,post:0,patch:0,requests:[],batchSizes:[],offered:[]};
 const env={SUPABASE_URL:"https://supabase.test.invalid",SUPABASE_SERVICE_ROLE_KEY:"ONLY_A_TEST_TOKEN"};
 const fetchStub=async(url,init={})=>{
  const u=new URL(String(url));const method=(init.method||"GET").toUpperCase();
  assert.equal(u.origin,env.SUPABASE_URL,"Attempt to access non-fixture host");
  assert.equal(u.pathname,"/rest/v1/user_offer_state");
  if(delayMs)await new Promise(done=>setTimeout(done,delayMs));
  stats.requests.push({method,query:u.searchParams.toString()});
  if(method==="GET"){
   stats.get++;
   assert.equal(u.searchParams.get("user_id"),"eq.TEST_ACCOUNT");
   return Response.json(existing);
  }
  if(method==="POST"){
   stats.post++;
   assert.equal(u.searchParams.get("on_conflict"),"user_id,offer_id");
   assert.equal(init.headers.Prefer,"resolution=merge-duplicates");
   if(failPost)return new Response("synthetic-error",{status:503});
   const data=JSON.parse(init.body);
   const arr=Array.isArray(data)?data:[data];
   stats.batchSizes.push(arr.length);
   assert.ok(arr.length>0);
   // Simulate PostgreSQL restriction: one ON CONFLICT key only once per batch.
   const unique=new Set();
   for(const item of arr){
    assert.equal(item.user_id,"TEST_ACCOUNT");
    assert.ok(!unique.has(item.offer_id),"Duplicate key in one batch");
    unique.add(item.offer_id);
    const prior=rows.get(item.offer_id);
    rows.set(item.offer_id,{...prior,...item});
    stats.offered.push(item.offer_id);
   }
   return new Response(null,{status:204});
  }
  if(method==="PATCH"){
   stats.patch++;
   const ids=u.searchParams.get("id");
   assert.ok(ids?.startsWith("in.(")&&ids.endsWith(")"));
   const payload=JSON.parse(init.body);
   assert.equal(payload.is_active,false);
   for(const id of ids.slice(4,-1).split(",")){
    const row=[...rows.values()].find(x=>x.id===id);
    assert.ok(row,"Unknown stored row ID "+id);
    row.is_active=false;
   }
   return new Response(null,{status:204});
  }
  throw Error("Forbidden method "+method);
 };
 const start=(code)=>new Function("fetch","getOfferId","normalizeOfferPayload",
  code+"\nreturn "+fnName+";")(fetchStub,getId,normalize);
 return {old:start(oldFn),updated:start(newFn),stats,rows,env};
}
function stripDynamic(row){
 const copy={...row};
 delete copy.first_seen_at;delete copy.last_seen_at;
 return copy;
}
async function compare(offers,existing){
 const a=fixture({existing}),b=fixture({existing});
 const prior=await a.old(a.env,"TEST_ACCOUNT",offers);
 const next=await b.updated(b.env,"TEST_ACCOUNT",offers);
 assert.deepEqual(next,prior,"Summary totals changed");
 const norm=x=>[...x.rows.values()].map(stripDynamic).sort((i,j)=>
  String(i.offer_id).localeCompare(String(j.offer_id)));
 assert.deepEqual(norm(a),norm(b),"Persisted offer state drifted");
 assert.equal(a.stats.get,1);assert.equal(b.stats.get,1);
 assert.equal(a.stats.patch,b.stats.patch);
 assert.deepEqual(new Set(b.stats.offered),new Set(a.stats.offered));
 return {a,b,prior,next};
}
test("105 offers: 105 single upserts become 2 batches with same final state",async()=>{
 const offers=Array.from({length:105},(_,i)=>({
  iddetalle:i+1,source_offer_key:"D_"+(i+1),cargo:"CARGO_"+i
 }));
 const {a,b,next}=await compare(offers,[{id:"row-old",offer_id:"D_999",is_active:true}]);
 assert.equal(a.stats.post,105);
 assert.equal(b.stats.post,2);
 assert.deepEqual(b.stats.batchSizes,[100,5]);
 assert.equal(next.total_active,105);
 assert.equal(next.total_disabled,1);
 console.log("APD_BULK_SYNC_105_OFFERS "+JSON.stringify({
  before_post_requests:a.stats.post,after_post_requests:b.stats.post,
  after_batch_sizes:b.stats.batchSizes,
  reduced_requests:a.stats.post-b.stats.post,
  no_real_db:true,production_unchanged:true
 }));
});
test("empty list still disables previously tracked offers without POST",async()=>{
 const {a,b,next}=await compare([],[{id:"old-1",offer_id:"D_1"},{id:"old-2",offer_id:"D_2"}]);
 assert.equal(a.stats.post,0);assert.equal(b.stats.post,0);
 assert.equal(next.total_disabled,2);
});
test("duplicate offer IDs use last payload and are not repeated in bulk POST",async()=>{
 const offers=[
  {iddetalle:1,source_offer_key:"D_1",cargo:"old"},
  {iddetalle:2,source_offer_key:"D_2",cargo:"second"},
  {iddetalle:1,source_offer_key:"D_1",cargo:"new"}
 ];
 const {a,b,next}=await compare(offers,[]);
 assert.equal(a.stats.post,3);assert.equal(b.stats.post,1);
 assert.deepEqual(b.stats.batchSizes,[2]);
 assert.equal(b.rows.get("D_1").offer_payload.cargo,"new");
 assert.equal(next.total_active,2);
});
test("bounded batch upserts remain sequential and never exceed 100 offers",async()=>{
 const count=251,offers=Array.from({length:count},(_,i)=>({iddetalle:i+1,source_offer_key:"D_"+(i+1)}));
 const {b,next}=await compare(offers,[]);
 assert.deepEqual(b.stats.batchSizes,[100,100,51]);
 assert.equal(next.total_active,count);
});
test("invalid user ID is rejected before any DB call",async()=>{
 const f=fixture();
 await assert.rejects(f.updated(f.env,"",[]),/falta userId/);
 assert.equal(f.stats.requests.length,0);
});
test("failed PostgREST bulk upsert stops and reports an error",async()=>{
 const f=fixture({failPost:true});
 await assert.rejects(f.updated(f.env,"TEST_ACCOUNT",[{iddetalle:1,source_offer_key:"D_1"}]),
  /No se pudo upsert user_offer_state/);
 assert.equal(f.stats.post,1);assert.equal(f.stats.patch,0);
});
