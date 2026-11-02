/* Real local PostgREST authz test. Synthetic keys only; no real user data. */
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {createAtomicStagePilotClient} from "./apd-atomic-stage-rest-adapter.mjs";

const BASE="http://127.0.0.1:3300/";
const secret=process.env.APD_CI_FAKE_JWT_SECRET;
assert.ok(secret&&secret.length>=32,"Missing local CI-only JWT key");
const base64url=x=>Buffer.from(x).toString("base64url");
const signedJwt=role=>{
 const head=base64url(JSON.stringify({alg:"HS256",typ:"JWT"}));
 const payload=base64url(JSON.stringify({role,iat:Math.floor(Date.now()/1000),
  exp:Math.floor(Date.now()/1000)+600}));
 const body=head+"."+payload;
 const sig=createHmac("sha256",secret).update(body).digest("base64url");
 return body+"."+sig;
};
const scannerToken=signedJwt("apd_pilot_scanner");
const userToken=signedJwt("apd_pilot_authenticated");
async function getResponse(path,method,auth){
 return fetch(new URL(path,BASE),{
  method,redirect:"error",
  credentials:"omit",
  headers:{"Accept-Profile":"apd_scanner_pilot",
   "Content-Profile":"apd_scanner_pilot",
   "Content-Type":"application/json",
   ...(auth?{"Authorization":"Bearer "+auth}:{})},
  ...(method==="POST"?{body:JSON.stringify({p_run_id:"00000000-0000-0000-0000-000000000920"})}:{})
 });
}
for(const [identity,token] of [["anonymous",null],["authenticated",userToken]]){
 for(const [method,path] of [
  ["GET","current_offers_full?select=source_offer_key&limit=1"],
  ["POST","rpc/finalize_full_district"],
  ["POST","rpc/seal_capture"]
 ]){
  const response=await getResponse(path,method,token);
  assert.ok(!response.ok,identity+" unexpectedly permitted "+method+" "+path+" ("+response.status+")");
  console.log("DENIED:",identity,method,path,"HTTP",response.status);
 }
}
const deniedDelete=await getResponse("current_offers_full?source_offer_key=eq.TEST", "DELETE", scannerToken);
assert.ok(!deniedDelete.ok,"Scanner must not be able to directly DELETE offers");
console.log("DENIED: scanner DELETE (HTTP "+deniedDelete.status+")");
const client=createAtomicStagePilotClient({
 baseUrl:BASE,enabled:true,
 fetchImpl:(url,options)=>fetch(url,{...options,
  headers:{...options.headers,Authorization:"Bearer "+scannerToken}})
});
const RUN="00000000-0000-0000-0000-000000000920";
const start="2026-11-02T16:00:00Z";
const stop="2026-11-02T16:03:00Z";
const run=await client.createRun({
 runId:RUN,district:"MATANZA",expectedPages:2,
 captureStartedAt:start,capturedAt:stop
});
assert.ok(Array.isArray(run)&&run.length===1,"Scanner cannot create capture run");
const makeRows=(ids)=>ids.map(n=>({
 source_offer_key:"AUTH_TEST_"+n,distrito:"MATANZA",estado:"Publicada"
}));
assert.equal(await client.stagePage({
 runId:RUN,pageIndex:0,sourceTotal:3,rows:makeRows([1,2])}),1);
assert.equal(await client.stagePage({
 runId:RUN,pageIndex:1,sourceTotal:3,rows:makeRows([3])}),2);
assert.equal(await client.seal(RUN),3);
assert.deepEqual(await client.finalizeWithoutPruning(RUN),{upserted:3,pruned:0});
const confirm=await getResponse("current_offers_full?select=source_offer_key,estado,distrito&order=source_offer_key", "GET", scannerToken);
assert.equal(confirm.status,200,"Scanner cannot read its own staged results");
const docs=await confirm.json();
assert.equal(docs.length,0,"Full payload must not be filled by the minimal staging adapter; test role separation");
const minimal=await getResponse("current_offers?select=source_offer_key,distrito&order=source_offer_key", "GET", scannerToken);
assert.equal(minimal.status,200);
assert.equal((await minimal.json()).length,3);
console.log("PASS: scanner authenticated JWT can stage+seal+commit 3 synthetic offers; anon and authenticated rejected; DELETE prohibited.");
