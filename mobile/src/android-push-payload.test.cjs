const test=require("node:test");
const assert=require("node:assert/strict");
const {createHmac,webcrypto}=require("node:crypto");
const now=Date.parse("2026-11-26T23:00:00Z");
const iso=t=>new Date(t).toISOString();
const user="11111111-1111-4111-8111-111111111111",device="22222222-2222-4222-8222-222222222222",offer="APD:FIXTURE:1";
const secret="fixture_only_no_real_secrets_123456789";
function fixture(){
 return {claim:{event_key:createHmac("sha256",secret).update(JSON.stringify([user,device,offer])).digest("hex"),user_id:user,device_id:device,source_offer_key:offer,lease_id:"33333333-3333-4333-8333-333333333333",transport:"expo"},
 context:{user_id:user,device:{id:device,user_id:user,platform:"android",transport:"expo",enabled:true,opted_in:true,token_available:true,token_revoked:false},plan:{user_id:user,access_active:true,verified_at:iso(now)},offer:{source_offer_key:offer,matched_user_id:user,compatible:true,published:true,currently_available:true,source_current:true,verified_at:iso(now),expires_at:iso(now+300000),estado:"PUBLICADA"}},
 recipient:{userId:user,deviceId:device,token:"ExpoPushToken[synthetic_fixture_123]"},hmacSecret:secret,clock:()=>now,cryptoApi:webcrypto};
}
async function run(f){const {buildAndroidExpoPayload}=await import("../../scripts/mobile-push-android-payload-lab.mjs");return buildAndroidExpoPayload(f);}
test("physical pilot payload parameters and minimal data",async()=>{
 const r=await run(fixture());assert.equal(r.action,"ready");assert.equal(r.payload.priority,"high");assert.equal(r.payload.channelId,"apd-alertas");assert.equal(r.payload.sound,"default");assert.equal(r.payload.ttl,120);assert.deepEqual(r.payload.data,{type:"apd_refresh"});assert.ok(!JSON.stringify(r.payload).includes(offer));assert.ok(!JSON.stringify(r.payload.data).includes(user));
});
test("TTL clipped before closing and near-expiry blocked",async()=>{
 const f=fixture();f.context.offer.expires_at=iso(now+30000);assert.equal((await run(f)).payload.ttl,25);
 f.context.offer.expires_at=iso(now+5000);assert.equal((await run(f)).action,"cancel");
 f.context.offer.expires_at=iso(now-1000);assert.equal((await run(f)).action,"cancel");
});
test("no payload for revoked device, inactive plan, unverified source, tampered identity, or foreign recipient",async()=>{
 for(const mutate of [f=>f.context.device.opted_in=false,f=>f.context.plan.access_active=false,f=>f.context.offer.source_current=false,f=>f.claim.event_key="0".repeat(64),f=>f.recipient.userId=device,f=>f.recipient.token="not-a-token",f=>f.context.device.platform="ios"]){
 const f=fixture();mutate(f);const r=await run(f);assert.notEqual(r.action,"ready");assert.equal(r.payload,undefined);
 }
});
test("clock delay after checks blocks stale dispatch",async()=>{const f=fixture();let i=0;f.clock=()=>now+(i++?6000:0);assert.equal((await run(f)).action,"retry");});

test("recipient cryptographically bound to stored digest and ownership",async()=>{
 const {protectMobilePushToken,openBoundMobilePushRecipient}=await import("../../scripts/mobile-push-token-crypto-lab.mjs");
 const encryptionKey=Buffer.alloc(32,1).toString("base64url"),hmacKey=Buffer.alloc(32,2).toString("base64url");
 const token="ExpoPushToken[synthetic_fixture_123]";
 const protectedToken=await protectMobilePushToken({token,encryptionKey,hmacKey});
 const row={id:device,user_id:user,platform:"android",transport:"expo",enabled:true,opted_in:true,revoked_at:null,...protectedToken};
 const args={row,userId:user,deviceId:device,encryptionKey,hmacKey};
 assert.deepEqual(await openBoundMobilePushRecipient(args),{userId:user,deviceId:device,token,tokenHash:protectedToken.token_hash});
 for(const changed of [{token_hash:"0".repeat(64)},{user_id:device},{revoked_at:iso(now)},{enabled:false},{token_ciphertext:"X".repeat(80)}]){
  await assert.rejects(openBoundMobilePushRecipient({...args,row:{...row,...changed}}),/recipient_unverified/);
 }
});
