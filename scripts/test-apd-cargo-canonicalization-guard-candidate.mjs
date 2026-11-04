import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const original=readFileSync("app_v2_cargo_delegate_fix.js","utf8");
const candidate=readFileSync(
 "tmp/apd-alerts-performance/app_v2_cargo_delegate_guard_candidate.js","utf8");
assert.notEqual(candidate,original,"Guarded candidate must differ from source");
assert.match(candidate,/document\.getElementById\(id\) !== input/);
assert.match(candidate,/guard\.revision !== revision/);
assert.match(candidate,/String\(input\.value \|\| ''\)\.trim\(\) !== current/);
assert.doesNotMatch(original,/__APD_LAB_PREF_GUARD/);

async function flush(){
 for(let i=0;i<24;i++)await Promise.resolve();
}
function fixture({value="PROFESOR",guard={owner:"SESSION_DEMO_1",revision:0,dirty:false,state:"ready"}}={}){
 const requests=[],timers=[],errors=[];
 const input={value};
 const window={
  CARGO_INPUT_IDS:["pref-cargo-1"],
  __APD_LAB_PREF_GUARD:guard,
  cargarPrefsEnFormulario:()=>{},
  buscarSugerenciasCargosSupabase:query=>new Promise(resolve=>{
   requests.push({query,resolve});
  })
 };
 const document={
  getElementById:id=>id==="pref-cargo-1"?input:null
 };
 const context={window,document,
  setTimeout:fn=>{timers.push(fn);return 1;},
  console:{error:(...e)=>errors.push(e)}
 };
 vm.runInNewContext(candidate,context,{timeout:300});
 const trigger=async()=>{
  window.cargarPrefsEnFormulario({preferencias:{cargos:["PROFESOR"]}});
  for(const fn of timers.splice(0))fn();
  await flush();
 };
 const resolve=async(label="(PF) PROFESOR",index=0)=>{
  const entry=requests[index];
  assert.ok(entry,"Expected request "+index);
  entry.resolve([{label}]);
  await flush();
 };
 return {input,guard,window,document,requests,timers,errors,trigger,resolve};
}
test("ready, unchanged preferences canonicalize exactly once",async()=>{
 const f=fixture();
 await f.trigger();
 assert.equal(f.requests.length,1);
 assert.equal(f.requests[0].query,"PROFESOR");
 await f.resolve("(PF) PROFESOR");
 assert.equal(f.input.value,"(PF) PROFESOR");
 assert.equal(f.errors.length,0);
});
test("input changes while catalog request pending are never overwritten",async()=>{
 const f=fixture();
 await f.trigger();
 f.input.value="DOCENTE EDITANDO";
 f.guard.dirty=true;
 f.guard.revision++;
 await f.resolve("(PF) PROFESOR");
 assert.equal(f.input.value,"DOCENTE EDITANDO");
});
test("a programmatic autocomplete value change without input event is still protected",async()=>{
 const f=fixture();
 await f.trigger();
 // Real legacy selector sets input.value without dispatching input/change.
 f.input.value="(PR) PRECEPTOR";
 await f.resolve("(PF) PROFESOR");
 assert.equal(f.input.value,"(PR) PRECEPTOR");
});
test("a new session guard makes old catalog response obsolete",async()=>{
 const f=fixture();
 await f.trigger();
 f.window.__APD_LAB_PREF_GUARD={owner:"SESSION_DEMO_2",revision:0,dirty:false,state:"ready"};
 await f.resolve("(PF) PROFESOR");
 assert.equal(f.input.value,"PROFESOR");
});
test("a new DOM node with same input ID cannot be replaced by an old response",async()=>{
 const f=fixture();
 await f.trigger();
 const newInput={value:"NUEVO CARGO"};
 f.document.getElementById=id=>id==="pref-cargo-1"?newInput:null;
 await f.resolve("(PF) PROFESOR");
 assert.equal(f.input.value,"PROFESOR");
 assert.equal(newInput.value,"NUEVO CARGO");
});
test("unverified, loading, dirty and absent guards never start catalog canonicalization",async()=>{
 for(const guard of [null,{state:"loading",dirty:false,owner:"TEST",revision:0},
  {state:"conflict",dirty:true,owner:"TEST",revision:1},
  {state:"ready",dirty:true,owner:"TEST",revision:2}]){
  const f=fixture({guard});
  await f.trigger();
  assert.equal(f.requests.length,0);
  assert.equal(f.input.value,"PROFESOR");
 }
});
test("a new canonicalization pass supersedes a stale pending lookup",async()=>{
 const f=fixture();
 await f.trigger();
 await f.trigger();
 assert.equal(f.requests.length,2);
 await f.resolve("(OLD) PROFESOR",0);
 assert.equal(f.input.value,"PROFESOR");
 await f.resolve("(NEW) PROFESOR",1);
 assert.equal(f.input.value,"(NEW) PROFESOR");
});
test("a previous guard revision cannot override a later same-session edit",async()=>{
 const f=fixture();
 await f.trigger();
 f.guard.revision=10;
 f.guard.dirty=false;
 await f.resolve("(OLD) PROFESOR");
 assert.equal(f.input.value,"PROFESOR");
});
