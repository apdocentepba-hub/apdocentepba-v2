import test from "node:test";
import assert from "node:assert/strict";
import {protectMobilePushToken,openMobilePushToken} from "./mobile-push-token-crypto-lab.mjs";
const fake="ExpoPushToken[FAKE_LAB_TOKEN_ABCDEF123456789]";
const encryptionKey=Buffer.alloc(32,13).toString("base64url");
const hmacKey=Buffer.alloc(32,93).toString("base64url");
const inputs={encryptionKey,hmacKey};
test("encrypt and decrypt a fake token without network",async()=>{
 const protectedToken=await protectMobilePushToken({token:fake,...inputs});
 assert.equal(await openMobilePushToken({...protectedToken,...inputs}),fake);
 assert.match(protectedToken.token_hash,/^[0-9a-f]{64}$/);
 assert.match(protectedToken.token_ciphertext,/^[A-Za-z0-9_-]+$/);
});
test("database payload excludes raw token and secret keys",async()=>{
 const payload=await protectMobilePushToken({token:fake,...inputs});
 for(const secret of [fake,encryptionKey,hmacKey,"ExpoPushToken","user_id"])
  assert.ok(!JSON.stringify(payload).includes(secret),"Leaked "+secret);
});
test("same token has same HMAC but random ciphertext for each registration",async()=>{
 const a=await protectMobilePushToken({token:fake,...inputs});
 const b=await protectMobilePushToken({token:fake,...inputs});
 assert.equal(a.token_hash,b.token_hash);
 assert.notEqual(a.token_ciphertext,b.token_ciphertext);
});
test("different server HMAC secret changes token fingerprint",async()=>{
 const a=await protectMobilePushToken({token:fake,...inputs});
 const b=await protectMobilePushToken({token:fake,encryptionKey,
  hmacKey:Buffer.alloc(32,67).toString("base64url")});
 assert.notEqual(a.token_hash,b.token_hash);
});
test("wrong encryption secret cannot read ciphertext",async()=>{
 const a=await protectMobilePushToken({token:fake,...inputs});
 await assert.rejects(
  openMobilePushToken({...a,...inputs,
   encryptionKey:Buffer.alloc(32,55).toString("base64url")})
 );
});
test("tampered authenticated ciphertext is rejected",async()=>{
 const a=await protectMobilePushToken({token:fake,...inputs});
 const modified=a.token_ciphertext.slice(0,-2)+
  (a.token_ciphertext.slice(-2,-1)==="a"?"b":"a")+
  a.token_ciphertext.slice(-1);
 await assert.rejects(openMobilePushToken({
  token_ciphertext:modified,...inputs
 }));
});
test("malformed keys, tokens and unencrypted payloads fail closed",async()=>{
 for(const mutation of [
  {token:"short"},{token:"hello\nfake\r\n"},
  {encryptionKey:"abc"},{hmacKey:"abc"},
  {token:123},{encryptionKey:null},{hmacKey:null}
 ]){
  await assert.rejects(protectMobilePushToken({
   token:fake,...inputs,...mutation
  }));
 }
 await assert.rejects(openMobilePushToken({
  token_ciphertext:fake,...inputs
 }));
});
test("ciphertext output fits strict SQL field bounds",async()=>{
 const a=await protectMobilePushToken({token:fake,...inputs});
 assert.ok(a.token_ciphertext.length>=48);
 assert.ok(a.token_ciphertext.length<=4096);
});
