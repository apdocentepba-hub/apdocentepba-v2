import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {checkLive} from "./check-apd-worker-live-version-readonly.mjs";

const account="a".repeat(32);
const version="da0632dd-1b9e-4332-9c4a-75b5eade8d74";
const code=Buffer.from("export default {fetch(){ return new Response('fake'); }};\n");
const hash=createHash("sha256").update(code).digest("hex");
function fixtures(changes={}){
 const manifest={
  schema_version:2,worker_name:"ancient-wildflower-cd37",version_id:version,
  captured_at:"2026-11-04T00:00:00Z",main_module:"worker_hotfix.js",
  modules:[{name:"worker_hotfix.js",sha256:hash}],
  bindings:[{name:"EMAIL_SWEEP_STATE",type:"kv_namespace",namespace_id:"kv-only-test"},{name:"SUPABASE_URL",type:"plain_text"}]
 };
 const deployments={deployments:[{versions:[{version_id:version,percentage:100}]}]};
 const active={id:version,main_module:"worker_hotfix.js",
  modules:[{name:"worker_hotfix.js",content_base64:code.toString("base64")}],
  bindings:[{name:"EMAIL_SWEEP_STATE",type:"kv_namespace",namespace_id:"kv-only-test"},{name:"SUPABASE_URL",type:"plain_text",text:"NEVER_EXPOSED_IN_OUTPUT"}]
 };
 Object.assign(manifest,changes.manifest);
 Object.assign(deployments,changes.deployments);
 Object.assign(active,changes.active);
 const accounts=changes.accounts||[{id:account}];
 const request=async url=>{
  let result;
  if(url.includes("/accounts?"))result=accounts;
  else if(url.endsWith("/deployments"))result=deployments;
  else if(url.includes("/versions/"))result=active;
  else throw Error("Unexpected mock endpoint");
  return {status:200,json:async()=>({success:true,result})};
 };
 const env={CLOUDFLARE_API_TOKEN:"FAKE_TEST_TOKEN",CLOUDFLARE_ACCOUNT_ID:account};
 return {manifestOverride:manifest,request,env};
}
test("one active 100%-traffic version and exact code/bindings passes read-only",async()=>{
 const r=await checkLive(fixtures());
 assert.equal(r.live_verified,true);
 assert.equal(r.active_version_id,version);
 assert.equal(r.active_worker_source_sha256,hash);
 assert.equal(r.read_only,true);
 assert.equal(r.production_mutation,false);
 assert.ok(!JSON.stringify(r).includes("NEVER_EXPOSED_IN_OUTPUT"));
 assert.ok(!JSON.stringify(r).includes("FAKE_TEST_TOKEN"));
});
test("does not invent verification with missing API token",async()=>{
 const f=fixtures();delete f.env.CLOUDFLARE_API_TOKEN;
 await assert.rejects(checkLive(f),/Missing CLOUDFLARE_API_TOKEN/);
});
test("fails closed if Cloudflare has two traffic-serving versions",async()=>{
 const f=fixtures({deployments:{deployments:[{versions:[
  {version_id:version,percentage:90},{version_id:"e".repeat(8)+"-"+"e".repeat(4)+"-"+"e".repeat(4)+"-"+"e".repeat(4)+"-"+"e".repeat(12),percentage:10}
 ]}]}});
 await assert.rejects(checkLive(f),/Multiple traffic-serving versions/);
});
test("fails closed on active version drift from canonical snapshot",async()=>{
 const different="e".repeat(8)+"-"+"e".repeat(4)+"-"+"e".repeat(4)+"-"+"e".repeat(4)+"-"+"e".repeat(12);
 const f=fixtures({deployments:{deployments:[{versions:[{version_id:different,percentage:100}]}]}});
 await assert.rejects(checkLive(f),/live Worker version differs/);
});
test("fails closed on module bytes/hash mismatch",async()=>{
 const f=fixtures({active:{modules:[{name:"worker_hotfix.js",content_base64:Buffer.from("tampered").toString("base64")}]}});
 await assert.rejects(checkLive(f),/source SHA-256 mismatch/);
});
test("fails closed on missing or altered binding",async()=>{
 const f=fixtures({active:{bindings:[{name:"SUPABASE_URL",type:"plain_text"}]}});
 await assert.rejects(checkLive(f),/required Worker binding missing/);
 const wrong=fixtures({active:{bindings:[{name:"EMAIL_SWEEP_STATE",type:"kv_namespace",namespace_id:"different"},{name:"SUPABASE_URL",type:"plain_text"}]}});
 await assert.rejects(checkLive(wrong),/resource namespace changed/);
});
test("Cloudflare account must be explicit or unambiguous",async()=>{
 const f=fixtures({accounts:[{id:account},{id:"b".repeat(32)}]});
 f.env.CLOUDFLARE_ACCOUNT_ID="";
 await assert.rejects(checkLive(f),/Ambiguous Cloudflare accounts/);
});
test("GET requests only and credentials not logged to any returned object",async()=>{
 const f=fixtures();
 const calls=[];const request=f.request;
 f.request=async (url,options)=>{
  calls.push({method:options.method,url,redirect:options.redirect});
  return request(url,options);
 };
 const result=await checkLive(f);
 assert.equal(result.live_verified,true);
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.method==="GET"&&c.redirect==="error"&&c.url.startsWith("https://api.cloudflare.com/")));
});
