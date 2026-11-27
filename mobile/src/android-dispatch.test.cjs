const test=require("node:test");
const assert=require("node:assert/strict");
const {createHmac}=require("node:crypto");
const user="11111111-1111-4111-8111-111111111111",device="22222222-2222-4222-8222-222222222222",lease="33333333-3333-4333-8333-333333333333",dispatch="44444444-4444-4444-8444-444444444444",offer="APD:FIXTURE:1";
const secret="fixture_only_no_real_secrets_123456789";
const now=Date.parse("2026-11-26T23:00:00Z"),iso=t=>new Date(t).toISOString();
async function fixture(options={}){
 const {createAndroidExpoDispatchLab}=await import("../../scripts/mobile-push-android-dispatch-lab.mjs");
 const {protectMobilePushToken}=await import("../../scripts/mobile-push-token-crypto-lab.mjs");
 const keys={encryptionKey:Buffer.alloc(32,1).toString("base64url"),hmacKey:Buffer.alloc(32,2).toString("base64url")};
 const token="ExpoPushToken[synthetic_fixture_123]";
 const encrypted=await protectMobilePushToken({token,...keys});
 const row={id:device,user_id:user,platform:"android",transport:"expo",enabled:true,opted_in:true,revoked_at:null,...encrypted};
 const claim={event_key:createHmac("sha256",secret).update(JSON.stringify([user,device,offer])).digest("hex"),user_id:user,device_id:device,source_offer_key:offer,lease_id:lease,transport:"expo"};
 const context={user_id:user,device:{id:device,user_id:user,platform:"android",transport:"expo",enabled:true,opted_in:true,token_available:true,token_revoked:false},plan:{user_id:user,access_active:true,verified_at:iso(now)},offer:{source_offer_key:offer,matched_user_id:user,compatible:true,published:true,currently_available:true,source_current:true,verified_at:iso(now),expires_at:iso(now+300000),estado:"PUBLICADA"}};
 if(options.closed)context.offer.expires_at=iso(now-1);
 const calls=[];let consumed=false,time=now;
 const repository={claimReserved:async()=>{calls.push("claim");return [claim]},loadVerifiedContext:async()=>context,cancelReserved:async()=>{calls.push("cancel");return true},retryReserved:async()=>true};
 const database={readOwnedExpoRecipient:async()=>row,prepareDispatch:async()=>{calls.push("prepare");return dispatch},consumeDispatch:async args=>{calls.push("consume");assert.equal(args.tokenHash,encrypted.token_hash);if(consumed||options.denyConsume)return false;consumed=true;if(options.expire)time=now+300000;return true},recordExpoTicket:async args=>{calls.push("ticket");assert.equal(args.ticketId,"synthetic-ticket-123");return true},resolveWithoutProvider:async args=>{calls.push(args.outcome);return true}};
 const submit=async payload=>{calls.push("submit");assert.equal(payload.to,token);assert.equal(payload.priority,"high");assert.deepEqual(payload.data,{type:"apd_refresh"});if(options.timeout)throw Error("private token");return {httpStatus:200,body:{data:{status:"ok",id:"synthetic-ticket-123"}}}};
 const run=createAndroidExpoDispatchLab({authorizeRun:async()=>!options.denied,repository,database,submit,keys,hmacSecret:secret,clock:()=>time});
 return {run,calls};
}
test("durable consume precedes one submission and ticket is not physical delivery",async()=>{
 const f=await fixture();assert.deepEqual(await f.run({}),{state:"awaiting_receipt",submission_attempts:1,delivery_to_device_confirmed:false});assert.deepEqual(f.calls,["claim","prepare","consume","submit","ticket"]);
 assert.equal((await f.run({})).state,"consumption_denied");assert.equal(f.calls.filter(x=>x==="submit").length,1);
});
test("denied scheduler and closed offer do not submit",async()=>{
 for(const options of [{denied:true},{closed:true},{denyConsume:true},{expire:true}]){
 const f=await fixture(options);const r=await f.run({});assert.equal(r.submission_attempts,0);assert.ok(!f.calls.includes("submit"));
 }
});
test("timeout is quarantined without retry or leaking provider error",async()=>{
 const f=await fixture({timeout:true});const r=await f.run({});assert.equal(r.state,"uncertain");assert.equal(r.submission_attempts,1);assert.ok(f.calls.includes("uncertain"));assert.ok(!JSON.stringify(r).includes("private"));await f.run({});assert.equal(f.calls.filter(x=>x==="submit").length,1);
});
