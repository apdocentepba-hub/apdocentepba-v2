/* Differential suite for the actual generated PID fallback routine.
 * No connections to Google Apps Script, Cloudflare, users or databases.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
const baseline=readFileSync("tmp/apd-published-query-research/worker_hotfix.js","utf8");
const candidate=readFileSync("tmp/apd-published-pid-research/worker_hotfix.js","utf8");
const fnName="obtenerUltimaPidGuardada";
const fname=src=>{
 const from=src.indexOf("async function "+fnName+"(");
 const until=src.indexOf("\n__name("+fnName+",",from);
 assert.ok(from>=0&&until>from);
 return src.slice(from,until);
};
const old=fname(baseline),updated=fname(candidate);
assert.equal(candidate.replace(updated,old),baseline,"Only PID function may change");
const actions=["obtener_ultima_pid_consulta","leer_pid_consulta",
 "leer_pid_guardado","pid_guardado","get_pid_guardado","buscar_pid_consulta","buscar_pid"];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const passthrough=x=>x;
function runner(code,stub){
 return new Function("postPidStorageFromMainWorker","__name","__name2",
 "__name22","__name222","__name2222",code+"\nreturn "+fnName+";")(
 stub,passthrough,passthrough,passthrough,passthrough,passthrough
 );
}
const result=(name)=>({ok:true,found:true,
 result:{oblea:name,apellido_nombre:"DOCENTE DE PRUEBA",dni:"12345678",table_rows:[]}});
const responses=(map,waitMs=0)=>{
 let started=[],inflight=0,maxInflight=0;
 async function call({action,docente_id}){
  assert.equal(docente_id,"TEST_USER");
  assert.ok(actions.includes(action));
  started.push(action);
  inflight++;maxInflight=Math.max(maxInflight,inflight);
  try{
   if(waitMs)await sleep(waitMs);
   if(map[action] instanceof Error)throw map[action];
   return map[action]??{ok:true,found:false};
  }finally{inflight--;}
 }
 return {call,stats:()=>({started,maxInflight})};
};
test("no PID: all seven legacy actions retained; at most two concurrent",async()=>{
 const a=responses({},5),b=responses({},5);
 assert.equal(await runner(old,a.call)("TEST_USER"),null);
 assert.equal(await runner(updated,b.call)("TEST_USER"),null);
 assert.deepEqual(a.stats().started,actions);
 assert.deepEqual(b.stats().started,actions);
 assert.equal(a.stats().maxInflight,1);
 assert.equal(b.stats().maxInflight,2);
});
test("first action has the result: identical normalization and no later batches",async()=>{
 const data={[actions[0]]:result("FIRST")},a=responses(data),b=responses(data);
 assert.deepEqual(await runner(updated,b.call)("TEST_USER"),await runner(old,a.call)("TEST_USER"));
 assert.deepEqual(b.stats().started,actions.slice(0,2));
});
test("both first pair valid: priority determined by action order, not response speed",async()=>{
 async function call({action}){
  if(action===actions[0]){await sleep(9);return result("FIRST");}
  if(action===actions[1])return result("SECOND");
  throw Error("Unexpected extra PID action");
 }
 const r=await runner(updated,call)("TEST_USER");
 assert.equal(r.result.oblea,"FIRST");
});
test("success in the fourth fallback preserves returned fields and action priority",async()=>{
 const data={[actions[3]]:result("FOURTH"),[actions[5]]:result("SIXTH")};
 const a=responses(data),b=responses(data);
 const oldResult=await runner(old,a.call)("TEST_USER");
 const newResult=await runner(updated,b.call)("TEST_USER");
 assert.deepEqual(newResult,oldResult);
 assert.deepEqual(b.stats().started,actions.slice(0,4));
});
test("null, found:false and errors retain fallback behavior",async()=>{
 const data={[actions[0]]:new Error("temporary failure"),[actions[1]]:{ok:false},
 [actions[2]]:{ok:true,found:false},[actions[3]]:null,
 [actions[4]]:result("FIFTH")};
 const a=responses(data),b=responses(data);
 assert.deepEqual(await runner(updated,b.call)("TEST_USER"),await runner(old,a.call)("TEST_USER"));
 assert.deepEqual(b.stats().started,actions.slice(0,6));
});
test("empty user ID causes no outgoing calls",async()=>{
 const a=responses({});
 assert.equal(await runner(updated,a.call)(""),null);
 assert.deepEqual(a.stats().started,[]);
});
test("synthetic latency benchmark: sequential vs bounded, no real PID service",async()=>{
 const delay=20,a=responses({},delay),b=responses({},delay);
 const before=performance.now();
 await runner(old,a.call)("TEST_USER");
 const sequentialMs=Math.round(performance.now()-before);
 const middle=performance.now();
 await runner(updated,b.call)("TEST_USER");
 const boundedMs=Math.round(performance.now()-middle);
 assert.equal(a.stats().started.length,7);
 assert.equal(b.stats().started.length,7);
 assert.equal(b.stats().maxInflight,2);
 console.log("APD_PID_BOUNDED_SYNTHETIC "+JSON.stringify({
  sequential_ms:sequentialMs,bounded_ms:boundedMs,
  max_inflight:2,source:"mocked_each_lookup_20ms",real_pid_latency:false
 }));
});
