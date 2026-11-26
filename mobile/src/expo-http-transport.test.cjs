const test=require("node:test"),assert=require("node:assert/strict");
const token="fixture_access_token_only_123456789";
const message={to:"ExpoPushToken[synthetic_fixture_123]",title:"AlertasAPD",body:"Hay una nueva oportunidad docente. Consultá las ofertas vigentes.",priority:"high",channelId:"apd-alertas",sound:"default",ttl:120,data:{type:"apd_refresh"}};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
async function factory(fetchImpl,extra={}){const {createExpoHttpTransport}=await import("../../scripts/mobile-push-expo-http-transport.mjs");return createExpoHttpTransport({fetchImpl,accessToken:token,enabled:true,...extra});}
test("fixed endpoint, access token, no redirects, ticket only and bounded receipts",async()=>{
 const calls=[];const t=await factory(async(url,opt)=>{calls.push({url,opt});assert.equal(opt.redirect,"error");assert.equal(opt.headers.Authorization,"Bearer "+token);return json({data:{status:"ok",id:"fixture-ticket-123"}});});
 assert.equal((await t.submit(message)).body.data.status,"ok");
 await t.getReceipts(["fixture-ticket-123"]);
 assert.deepEqual(calls.map(c=>c.url),["https://exp.host/--/api/v2/push/send","https://exp.host/--/api/v2/push/getReceipts"]);
 assert.deepEqual(JSON.parse(calls[0].opt.body),message);assert.deepEqual(JSON.parse(calls[1].opt.body),{ids:["fixture-ticket-123"]});
});
test("transport disabled by default, refuses malformed or private payloads before network",async()=>{
 const {createExpoHttpTransport}=await import("../../scripts/mobile-push-expo-http-transport.mjs");let calls=0;const f=async()=>{calls++;return json({});};
 assert.throws(()=>createExpoHttpTransport({fetchImpl:f,accessToken:token}),/disabled/);
 assert.throws(()=>createExpoHttpTransport({fetchImpl:f,enabled:true}),/disabled/);
 const t=await factory(f);
 for(const changed of [{to:[message.to]},{ttl:121},{data:{type:"apd_refresh",url:"https://evil.invalid"}},{title:"Other"},{extra:"private"}])await assert.rejects(t.submit({...message,...changed}),/invalid_expo_message/);
 await assert.rejects(t.getReceipts(["duplicate-123","duplicate-123"]),/invalid_receipt_ids/);assert.equal(calls,0);
});
test("HTTP errors and oversized/malformed replies never trigger automatic retries",async()=>{
 for(const response of [()=>json({},429),()=>json({},503),()=>new Response("x".repeat(17000),{headers:{"content-type":"application/json"}}),()=>new Response("html"),()=>{throw Error("secret details")} ]){
 let calls=0;const t=await factory(async()=>{calls++;return response();});
 try{const r=await t.submit(message);assert.ok([429,503].includes(r.httpStatus));}catch(e){assert.equal(e.message,"expo_transport_outcome_unknown");}
 assert.equal(calls,1);
 }
});
