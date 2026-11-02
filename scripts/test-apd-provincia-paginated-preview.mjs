import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {handleProvinciaResumenPaginadoPreview as handler} from "../worker-live/apd_provincia_summary_pagination_hook.mjs";
import {buildPaginatedProvinciaPreview} from "./build-apd-provincia-paginated-preview.mjs";

const time=Date.now(), started=new Date(time-120000).toISOString(),
  finished=new Date(time-60000).toISOString();
const before={scope:"PROVINCIA_FULL",status:"finished",mode:"current_published",
  total_districts:137,districts_completed:137,offers_processed:2609,
  started_at:started,finished_at:finished};
const base={APD_PROVINCIA_PAGINATION_ENABLED:"true"};
const url=new URL("https://worker.test.invalid/api/provincia/resumen?days=30");
function json(body,status=200){return new Response(JSON.stringify(body),{status});}
function fixture(count=2609){
  return Array.from({length:count},(_,i)=>({
    source_offer_key:"key-"+String(i).padStart(7,"0"),
    last_seen_at:new Date(time-90000).toISOString(),
    estado:"PUBLICADA",distrito:"AVELLANEDA",cargo:"INFORMATICA"
  }));
}
function fakeDependencies(rows,override={}){
  const queries=[], states=[];
  const deps={
    json, queries,states,
    getScanState:async()=>{states.push("get");return before;},
    supabaseSelect:async(_env,query)=>{
      queries.push(query);
      const off=Number(new URLSearchParams(query.split("?")[1]).get("offset"));
      const lim=Number(new URLSearchParams(query.split("?")[1]).get("limit"));
      return rows.slice(off,off+lim);
    },
    buildSummary: (list,days)=>({ok:true,total_ofertas:list.length,
      ventana_dias:days,records:[],banner_items:[],scan_state:{status:"finished"}})
  };
  return Object.assign(deps,override);
}
test("feature flag disabled: 404 and zero SQL reads",async()=>{
 const deps=fakeDependencies(fixture());
 const res=await handler(url,{},deps);
 assert.equal(res.status,404);
 assert.equal(deps.queries.length,0);
 assert.equal(deps.states.length,0);
});
test("full 2609-row pagination returns truthful count, no 1000 row cap",async()=>{
 const deps=fakeDependencies(fixture());
 const res=await handler(url,base,deps);
 assert.equal(res.status,200,await res.clone().text());
 const value=await res.json();
 assert.equal(value.total_ofertas,2609);
 assert.equal(value.verified_complete_scan,true);
 assert.equal(value.source,"full_paginated_current_scan");
 assert.equal(value.ventana_dias,30);
 assert.equal(deps.queries.length,6);
 assert.deepEqual(deps.queries.map(q=>Number(new URLSearchParams(q.split("?")[1]).get("offset"))),
   [0,500,1000,1500,2000,2500]);
 assert.ok(deps.queries.every(q=>q.includes("limit=500")&&
   q.includes("order=last_seen_at.desc,source_offer_key.asc")));
 assert.equal(deps.states.length,2);
 assert.equal(res.headers.get("Cache-Control"),"no-store");
});
test("insufficient/duplicate rows fail closed with 503, never a fake count",async()=>{
 for(const rows of [fixture(1000),[...fixture(1000),fixture(1)[0]]]){
   const deps=fakeDependencies(rows);
   const res=await handler(url,base,deps);
   assert.equal(res.status,503);
   assert.deepEqual(await res.json(),{ok:false,error:"Resumen provincial no verificable"});
 }
});
test("active scan or changed scan aborts and never claims completeness",async()=>{
 const first=fakeDependencies(fixture(),{
   getScanState:async()=>({...before,status:"running"})
 });
 const r1=await handler(url,base,first);
 assert.equal(r1.status,503);
 assert.equal(first.queries.length,0);
 let n=0;
 const second=fakeDependencies(fixture(),{
   getScanState:async()=>{n++;return {...before,offers_processed:n===1?2609:2610};}
 });
 const r2=await handler(url,base,second);
 assert.equal(r2.status,503);
});
test("database API exceptions are hidden, not transformed into zero offers",async()=>{
 const deps=fakeDependencies(fixture(),{
   supabaseSelect:async()=>{throw Error("private DB token xyz");}
 });
 const r=await handler(url,base,deps);
 assert.equal(r.status,503);
 assert.equal((await r.text()).includes("private DB token"),false);
});
test("wrong scan timestamps and old rows cannot be treated as fresh",async()=>{
 const deps=fakeDependencies(fixture(2609).map((r,i)=>i===0
   ? {...r,last_seen_at:new Date(time-500000).toISOString()} : r));
 const r=await handler(url,base,deps);
 assert.equal(r.status,503);
});
test("preview generator incorporates opt-in route exactly once and parses as JS",()=>{
 const live=readFileSync("worker-live/worker_hotfix.js","utf8");
 const hook=readFileSync("worker-live/apd_provincia_summary_pagination_hook.mjs","utf8");
 const preview=buildPaginatedProvinciaPreview(live,hook);
 assert.equal((preview.match(/async function handleProvinciaResumenPaginadoPreview\(/g)||[]).length,1);
 assert.equal((preview.match(/return await handleProvinciaResumenPaginadoPreview\(/g)||[]).length,1);
 assert.equal((preview.match(/APD_PROVINCIA_PAGINATION_ENABLED/g)||[]).length,2);
 assert.ok(!live.includes("APD_PROVINCIA_PAGINATION_ENABLED"));
 assert.throws(()=>buildPaginatedProvinciaPreview(preview,hook),/Already integrated/);
 assert.match(preview,/snapshot_writes: false/);
 const check=spawnSync(process.execPath,["--input-type=module","--check"],{
  input:preview,encoding:"utf8",maxBuffer:3*1024*1024
 });
 assert.equal(check.status,0,check.stderr);
});
