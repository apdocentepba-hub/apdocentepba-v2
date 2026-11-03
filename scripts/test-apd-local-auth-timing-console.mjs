import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const snippet=readFileSync("scripts/apd-local-auth-timing-console.js","utf8");
const base="https://ancient-wildflower-cd37.apdocentepba.workers.dev";
function resource(path,duration=45,{startTime=10,responseStart=20,responseEnd=55}={}){
 return {entryType:"resource",name:base+path,duration,
  startTime,responseStart,responseEnd};
}
function run(entries,{origin="https://alertasapd.com.ar"}={}){
 const emitted=[];
 const forbidden=()=>{throw Error("Forbidden browser data/network access");};
 const context={
  URL,
  location:{origin},
  performance:{getEntriesByType(type){
   assert.equal(type,"resource");
   return entries;
  }},
  console:{log(...args){emitted.push(args);}},
  fetch:forbidden,document:{get cookie(){return forbidden();}},
  localStorage:{getItem:forbidden},sessionStorage:{getItem:forbidden},
  navigator:{sendBeacon:forbidden},
  XMLHttpRequest:forbidden
 };
 const report=vm.runInNewContext(snippet,context,{timeout:2000});
 return {report:JSON.parse(JSON.stringify(report)),emitted};
}
test("reads only browser timings and removes query identifiers from local report",()=>{
 const secret="USER_PRIVATE_123TOKEN";
 const {report,emitted}=run([
  resource("/api/mis-alertas?user_id="+secret,45),
  resource("/api/mi-plan?user_id="+secret,15),
  resource("/api/account/profile",30),
  resource("/api/account/preferences",80),
  resource("/api/sync-offers?user_id="+secret,100),
  {entryType:"resource",name:"https://other.example/api/mis-alertas?user_id="+secret,
   duration:100,startTime:1}
 ]);
 assert.equal(report.matched_route_entries,4);
 assert.equal(report.routes.alerts.observed_requests,1);
 assert.equal(report.routes.alerts.network_duration.min_ms,45);
 assert.equal(report.routes.alerts.ttfb.min_ms,10);
 assert.equal(report.routes.alerts.network_duration.p50_ms,null);
 assert.equal(report.routes.alerts.network_duration.p95_ms,null);
 assert.equal(report.additional_network_requests,0);
 assert.equal(report.first_alert_paint_measured,false);
 assert.equal(report.authenticated_worker_execution_proven,false);
 assert.deepEqual(Object.keys(report.routes).sort(),["alerts","plan","preferences","profile"]);
 const output=JSON.stringify({report,emitted});
 assert.equal(output.includes(secret),false);
 assert.equal(output.includes(base),false);
 assert.doesNotMatch(output,/\?(?:user_id|token|session)=/i);
 assert.equal(output.includes("/api/"),false);
 assert.equal(emitted.length,1);
});
test("cross-origin opaque timings are unknown, never reported as zero success",()=>{
 const {report}=run([resource("/api/mis-alertas?user_id=PRIVATE",0,{
  startTime:10,responseStart:0,responseEnd:0
 })]);
 assert.equal(report.routes.alerts.observed_requests,1);
 assert.equal(report.routes.alerts.timing_unavailable_requests,1);
 assert.equal(report.routes.alerts.network_duration.min_ms,null);
 assert.equal(report.routes.alerts.network_duration.max_ms,null);
 assert.equal(report.routes.alerts.network_duration.p50_ms,null);
 assert.equal(report.routes.alerts.ttfb.timing_available_samples,0);
});
test("percentiles are suppressed until enough actual network samples",()=>{
 const data=Array.from({length:20},(_,i)=>resource(
  "/api/mis-alertas?user_id=SECRET_"+i,i+1,
  {startTime:5,responseStart:0,responseEnd:0}
 ));
 const {report}=run(data);
 assert.equal(report.routes.alerts.observed_requests,20);
 assert.equal(report.routes.alerts.network_duration.p50_ms,10);
 assert.equal(report.routes.alerts.network_duration.p95_ms,19);
 assert.equal(report.routes.alerts.ttfb.p50_ms,null);
 assert.equal(report.routes.alerts.ttfb.p95_ms,null);
});
test("only canonical HTTPS page origin permitted and stale resources are bounded",()=>{
 assert.throws(()=>run([], {origin:"http://alertasapd.com.ar"}),/canonical HTTPS site/);
 assert.throws(()=>run([], {origin:"https://evil.example"}),/canonical HTTPS site/);
 const many=Array.from({length:550},(_,i)=>resource("/api/mis-alertas?user_id=PRIVATE_"+i,10));
 const {report}=run(many);
 assert.equal(report.inspected_recent_entries,500);
 assert.equal(report.routes.alerts.observed_requests,500);
});
test("malformed, foreign-origin and nonallowlisted URLs do not enter metrics",()=>{
 const {report}=run([
  {entryType:"resource",name:"not a URL",duration:20,startTime:1},
  {entryType:"navigation",name:base+"/api/mis-alertas",duration:10,startTime:1},
  {entryType:"resource",name:"https://other.example/api/mis-alertas",duration:1,startTime:1},
  {entryType:"resource",name:base+"/api/admin/me?user_id=PRIVATE",duration:1,startTime:1},
  resource("/api/mis-alertas?user_id=PRIVATE",12)
 ]);
 assert.equal(report.matched_route_entries,1);
 assert.equal(report.routes.alerts.observed_requests,1);
 assert.equal(report.routes.plan.observed_requests,0);
 assert.equal(report.routes.profile.network_duration.min_ms,null);
});
test("source does not access credentials, responses, DOM, storage or network",()=>{
 assert.doesNotMatch(snippet,/\b(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/);
 assert.doesNotMatch(snippet,/localStorage\.|sessionStorage\.|document\.cookie|response\.json|Authorization\s*:/);
 assert.match(snippet,/getEntriesByType\("resource"\)/);
 assert.match(snippet,/contains_user_ids:false/);
});
