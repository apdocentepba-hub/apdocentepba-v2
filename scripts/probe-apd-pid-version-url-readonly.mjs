/* Public 0%-traffic version URL smoke; GET and OPTIONS only. No cookies,
 * auth headers, account data, write methods or Cloudflare configuration calls.
 */
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
const origin="https://90e76973-ancient-wildflower-cd37.apdocentepba.workers.dev";
const cases=[
 {path:"/api/version",method:"GET",expected:200},
 {path:"/api/planes",method:"GET",expected:200},
 {path:"/api/mi-plan?user_id=FAKE_TEST_ID",method:"GET",expected:401},
 {path:"/api/mis-alertas?user_id=FAKE_TEST_ID",method:"GET",expected:401},
 {path:"/api/mis-alertas",method:"OPTIONS",expected:200}
];
let checked=[];
for(const c of cases){
 const url=new URL(c.path,origin);
 assert.equal(url.origin,origin);
 assert.ok(["GET","OPTIONS"].includes(c.method));
 const start=performance.now();
 const res=await fetch(url.toString(),{
  method:c.method,redirect:"error",credentials:"omit",
  headers:{"Accept":"application/json","Cache-Control":"no-store"},
  signal:AbortSignal.timeout(20000)
 });
 const duration_ms=Math.round(performance.now()-start);
 assert.equal(res.status,c.expected,"Version URL "+c.path+" returned HTTP "+res.status+"; expected "+c.expected);
 if(c.method==="GET"){
  const body=await res.json();
  if(c.expected===200)assert.equal(body.ok,true);
  if(c.expected===401)assert.equal(body.ok,false);
 }
 checked.push({method:c.method,path:url.pathname,status:res.status,elapsed_ms:duration_ms});
}
console.log("APD_PID_PREVIEW_READONLY_SMOKE_OK "+JSON.stringify({
 version_id:"90e76973-5509-4d1b-82e1-91b4c2811295",
 preview_url:origin,checks:checked,no_credentials:true,no_post_or_mutation:true,
 production_traffic_changed:false
}));
