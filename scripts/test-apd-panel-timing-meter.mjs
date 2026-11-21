import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createApdPanelTimingMeter} from "./apd-panel-timing-meter.mjs";

function fixture(){
 let ms=0;
 const paint=[];
 const meter=createApdPanelTimingMeter({
  now:()=>ms,
  nextPaint:cb=>paint.push(cb),
  cap:3
 });
 return {meter,advance:n=>ms+=n,paint:()=>{while(paint.length)paint.shift()();}};
}
test("measures protected profile, API and rendered alert without retaining any source data",()=>{
 const f=fixture();
 const sample=f.meter.begin();
 f.advance(20); f.meter.markApi(sample,"success");
 f.advance(10); f.meter.markProfile(sample);
 f.advance(8); f.meter.finish(sample,"rendered");
 f.advance(12);f.paint();
 assert.deepEqual(f.meter.snapshot(),[{
  outcome:"rendered",api_ms:20,profile_ms:30,rendered_ms:50
 }]);
 assert.deepEqual(f.meter.summary(),{
  sample_count:1,outcomes:{rendered:1},
  metrics:{
   api_ms:{n:1,p50:20,p95:20},
   profile_ms:{n:1,p50:30,p95:30},
   rendered_ms:{n:1,p50:50,p95:50}
  }
 });
 assert.doesNotMatch(JSON.stringify(f.meter.snapshot()),
  /Bearer|TOKEN|user_id|source_offer_key|school|email|payload/);
});
test("records API error separately from genuine no_matches, never claims zero alerts for an error",()=>{
 const f=fixture();
 const a=f.meter.begin();
 f.advance(6);f.meter.markApi(a,"error");
 f.advance(7);f.meter.finish(a,"api_error");
 f.paint();
 const b=f.meter.begin();
 f.advance(4);f.meter.markApi(b,"success");
 f.advance(3);f.meter.markProfile(b);
 f.advance(5);f.meter.finish(b,"no_matches");
 f.paint();
 assert.deepEqual(f.meter.snapshot().map(x=>x.outcome),["api_error","no_matches"]);
});
test("plan inactive and profile failure are distinct, without reading session details",()=>{
 const f=fixture();
 const a=f.meter.begin();
 f.advance(1);f.meter.finish(a,"plan_inactive");f.paint();
 const b=f.meter.begin();
 f.advance(1);f.meter.finish(b,"profile_error");f.paint();
 assert.deepEqual(f.meter.summary().outcomes,{plan_inactive:1,profile_error:1});
});
test("obsolete session can be discarded and cannot pollute recorded sample statistics",()=>{
 const f=fixture();
 const old=f.meter.begin();
 f.advance(3);f.meter.discard(old);
 f.meter.markApi(old,"success");
 f.meter.finish(old,"rendered");f.paint();
 assert.deepEqual(f.meter.snapshot(),[]);
});
test("timing outcomes are closed-set to prevent accidental logging of free-text errors or private IDs",()=>{
 const f=fixture();const sample=f.meter.begin();
 assert.throws(()=>f.meter.finish(sample,"user@example.com"),/Invalid timing outcome/);
 assert.equal(f.meter.snapshot().length,0);
});
test("bounded sample count and bounded active requests",()=>{
 const f=fixture();
 for(let i=0;i<6;i++){
  const run=f.meter.begin();f.advance(1);f.meter.finish(run,"rendered");f.paint();
 }
 assert.equal(f.meter.snapshot().length,3);
 assert.equal(f.meter.summary().metrics.rendered_ms.p95,1);
});
test("generated frontend candidate marks auth-gated lifecycle and contains no new network telemetry",()=>{
 const production=readFileSync("app_v2.js","utf8");
 const candidate=readFileSync("tmp/apd-alerts-performance/app_v2_telemetry_candidate.js","utf8");
 const helper=readFileSync("scripts/apd-panel-timing-meter.mjs","utf8");
 assert.ok(candidate.startsWith("'use strict';"));
 assert.ok(candidate.length>production.length);
 assert.match(candidate,/window\.__APD_LAB_PERF\.markApi\(apdLabRun, "success"\)/);
 assert.match(candidate,/window\.__APD_LAB_PERF\.markProfile\(apdLabRun\)/);
 assert.match(candidate,/window\.__APD_LAB_PERF\.finish\(apdLabRun, items\.length \? "rendered" : "no_matches"\)/);
 assert.match(candidate,/window\.__APD_LAB_PERF\.finish\(apdLabRun, "plan_inactive"\)/);
 assert.match(candidate,/window\.__APD_LAB_PERF\.finish\(apdLabRun, "api_error"\)/);
 assert.match(candidate,/window\.__APD_LAB_PERF\.discard\(apdLabRun\)/);
 assert.ok(!production.includes("__APD_LAB_PERF"));
 assert.doesNotMatch(helper,/navigator|fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|Authorization|console\.log/);
 assert.match(helper,/requestAnimationFrame\(\(\)=>requestAnimationFrame\(done\)\)/);
});
