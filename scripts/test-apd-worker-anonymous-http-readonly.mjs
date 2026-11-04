import test from "node:test";
import assert from "node:assert/strict";
import {checkAnonymous} from "./check-apd-worker-anonymous-http-readonly.mjs";
test("six safe requests, three 401 and three 200, without credentials or bodies",async()=>{
 const calls=[];
 const r=await checkAnonymous({request:async(url,args)=>{
  const u=new URL(url);calls.push({path:u.pathname,method:args.method,credentials:args.credentials,headers:args.headers});
  return {status:u.pathname==="/api/version"||u.pathname==="/api/planes"||args.method==="OPTIONS"?200:401};
 }});
 assert.equal(r.anonymous_http_contracts_verified,6);
 assert.equal(r.denied_unauthorized_requests,3);
 assert.equal(r.public_readonly_routes,3);
 assert.equal(r.write_request_count,0);
 assert.ok(calls.every(c=>c.credentials==="omit"&&!Object.hasOwn(c.headers,"Authorization")));
 assert.ok(calls.every(c=>c.method==="GET"||c.method==="OPTIONS"));
});
test("reject unexpected unauthenticated access instead of claiming smoke success",async()=>{
 await assert.rejects(checkAnonymous({request:async()=>({status:200})}),/Unexpected anonymous HTTP status/);
});
test("reject method mutation or non-API paths before any external request",async()=>{
 let calls=0;
 const request=async(url,args)=>{calls++;return {status:new URL(url).pathname==="/api/version"||new URL(url).pathname==="/api/planes"||args.method==="OPTIONS"?200:401};};
 await assert.rejects(checkAnonymous({request,addCases:[{method:"POST",path:"/api/test",expect:401}]}),/Read-only methods only/);
 assert.equal(calls,6);
});
test("no arbitrary host override to bypass pinned Worker URL",async()=>{
 await assert.rejects(checkAnonymous({origin:"https://some-other-host.example/",request:async()=>({status:200})}),/Expected values to be strictly equal/);
});
