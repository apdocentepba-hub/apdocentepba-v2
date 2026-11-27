const test=require("node:test");
const assert=require("node:assert/strict");
const {createNativeWorkerTransport,ORIGIN}=require("./native-worker-transport.js");
test("transport cannot be activated accidentally and rejects unapproved endpoints",async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error("unexpected");};
 assert.throws(()=>createNativeWorkerTransport({fetchImpl}),/pilot_not_enabled/);
 const r=createNativeWorkerTransport({fetchImpl,enabled:true});
 for(const path of ["https://foreign.invalid/","/api/mis-alertas?user_id=other","/api/mercadopago/create-checkout-link"])await assert.rejects(r({method:"GET",path,bearer:"a".repeat(64)}),/route_not_allowed/);
 assert.equal(calls,0);
});
test("fixed HTTPS path, bearer only for authenticated routes, redirects rejected",async()=>{
 let redirect=false;const calls=[];
 const r=createNativeWorkerTransport({enabled:true,fetchImpl:async(url,opts)=>{
  calls.push({url,opts});return {url:redirect?"https://foreign.invalid/":url,redirected:redirect,ok:true,status:200,headers:new Headers({"Content-Type":"application/json"}),text:async()=>JSON.stringify({ok:true})};
 }});
 await r({method:"POST",path:"/api/login",body:{email:"a@b.invalid",password:"fixture"}});
 assert.equal(calls[0].opts.headers.Authorization,undefined);
 await r({method:"GET",path:"/api/mis-alertas",bearer:"a".repeat(64)});
 assert.equal(calls[1].url,ORIGIN+"/api/mis-alertas");assert.equal(calls[1].opts.redirect,"error");assert.equal(calls[1].opts.credentials,"omit");
 redirect=true;await assert.rejects(r({path:"/api/account/profile",bearer:"a".repeat(64)}),/unexpected_response_origin/);
});
