const test=require("node:test"),assert=require("node:assert/strict");
const {runNativeConnectionProbe}=require("./native-connection-probe.js");
test("four fixed credential-free GET requests, no response body read",async()=>{
 const calls=[];const result=await runNativeConnectionProbe({enabled:true,fetchImpl:async(url,opts)=>{
 calls.push({url,opts});return {url,redirected:false,status:url.endsWith("/version")?200:401,body:{cancel:async()=>{}},text:async()=>{throw Error("must not read body")}};
 }});
 assert.equal(result.ok,true);assert.equal(result.loginEnabled,false);assert.equal(result.redirectRejectionCertified,false);assert.equal(result.credentialsSent,false);assert.equal(calls.length,4);
 for(const c of calls){assert.equal(c.opts.method,"GET");assert.equal(c.opts.credentials,"omit");assert.equal(c.opts.redirect,"error");assert.deepEqual(c.opts.headers,{Accept:"application/json"});assert.equal(c.opts.body,undefined);}
});
test("wrong origin, redirect, public protected endpoint or outage fail closed",async()=>{
 for(const variant of ["origin","redirect","public","offline"]){
 const result=await runNativeConnectionProbe({enabled:true,fetchImpl:async(url)=>{if(variant==="offline")throw Error("private error");return {url:variant==="origin"?"https://foreign.invalid":url,redirected:variant==="redirect",status:variant==="public"?200:url.endsWith("/version")?200:401};}});
 assert.equal(result.ok,false);assert.equal(result.loginEnabled,false);assert.ok(!JSON.stringify(result).includes("private error"));
 }
});
test("disabled by default",async()=>{await assert.rejects(runNativeConnectionProbe({fetchImpl:async()=>{throw Error("unexpected")}}),/probe_disabled/);});
