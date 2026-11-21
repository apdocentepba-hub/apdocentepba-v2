import test from "node:test";
import assert from "node:assert/strict";
import {verifyStrictMobileSession} from "./mobile-push-strict-session-lab.mjs";

const USER="11111111-1111-4111-8111-111111111111";
const OTHER="22222222-2222-4222-8222-222222222222";
const BEARER="lab-session-not-production-123456789012345";
const UUID_SESSION="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW=Date.parse("2026-11-03T12:00:00Z");
const row={token:BEARER,user_id:USER,activo:true,expires_at:"2026-11-04T12:00:00Z"};
const user={id:USER,activo:true,nombre:"No devolver"};
function h(overrides={}){
 const session=Object.hasOwn(overrides,"session")?overrides.session:row;
 const resolvedUser=Object.hasOwn(overrides,"user")?overrides.user:user;
 const log=[];
 return {
  args:{
   authorization:"Bearer "+BEARER,
   now:NOW,
   loadSessionByToken:async token=>{log.push("session:"+token);return session;},
   loadUserById:async id=>{log.push("user:"+id);return resolvedUser;},
   ...Object.fromEntries(Object.entries(overrides)
      .filter(([k])=>!["session","user"].includes(k)))
  },log
 };
}
test("verified session and linked active user return only minimal actor",async()=>{
 const x=h();
 const actor=await verifyStrictMobileSession(x.args);
 assert.deepEqual(actor,{userId:USER,sessionVerified:true});
 assert.deepEqual(x.log,["session:"+BEARER,"user:"+USER]);
 assert.doesNotMatch(JSON.stringify(actor),/No devolver|Bearer|token|expires/);
});
test("user id as bearer must fail without a corresponding session row",async()=>{
 const x=h({authorization:"Bearer "+USER,session:null});
 assert.equal(await verifyStrictMobileSession(x.args),null);
 assert.deepEqual(x.log,["session:"+USER]);
});
test("valid UUID-shaped session token is supported only by explicit lookup",async()=>{
 const x=h({authorization:"Bearer "+UUID_SESSION,
  session:{...row,token:UUID_SESSION}});
 assert.deepEqual(await verifyStrictMobileSession(x.args),
  {userId:USER,sessionVerified:true});
});
test("bearer with a different session token is rejected",async()=>{
 const x=h({session:{...row,token:"some-other-token-123456789012345"}});
 assert.equal(await verifyStrictMobileSession(x.args),null);
 assert.deepEqual(x.log,["session:"+BEARER]);
});
test("inactive and missing sessions fail closed",async()=>{
 for(const session of [null,{}, {...row,activo:false},{...row,activo:null}]){
  assert.equal(await verifyStrictMobileSession(h({session}).args),null);
 }
});
test("expired or unbounded sessions fail closed",async()=>{
 for(const expires_at of [null,undefined,"", "invalid",
  "2026-11-03T12:00:00Z","2026-11-02T12:00:00Z"]){
  assert.equal(await verifyStrictMobileSession(h({session:{...row,expires_at}}).args),null);
 }
});
test("session owner and returned user ID must agree exactly",async()=>{
 for(const changed of [
  {session:{...row,user_id:OTHER}},
  {user:{...user,id:OTHER}},
  {user:{...user,activo:false}},
  {user:null},
 ]){
  assert.equal(await verifyStrictMobileSession(h(changed).args),null);
 }
});
test("malformed Authorization and tokens never reach a database lookup",async()=>{
 for(const authorization of ["",null,"Basic "+BEARER,"Bearer ",
  "bearer "+BEARER,"Bearer abc", "Bearer "+("X".repeat(600)),
  "Bearer "+BEARER+"\nInjected"]){
  const x=h({authorization});
  assert.equal(await verifyStrictMobileSession(x.args),null);
  assert.deepEqual(x.log,[]);
 }
});
test("lookup outages do not authenticate anyone",async()=>{
 const x=h({loadSessionByToken:async()=>{throw Error("offline");}});
 assert.equal(await verifyStrictMobileSession(x.args),null);
 const y=h({loadUserById:async()=>{throw Error("offline");}});
 assert.equal(await verifyStrictMobileSession(y.args),null);
});
test("no missing resolver or invalid clock can authenticate",async()=>{
 for(const x of [
  {loadUserById:null},{loadSessionByToken:null},
  {now:NaN},{now:"bad"},{now:Infinity}
 ])assert.equal(await verifyStrictMobileSession(h(x).args),null);
});
test("session result must have real UUID user IDs",async()=>{
 const x=h({session:{...row,user_id:"not-a-uuid"}});
 assert.equal(await verifyStrictMobileSession(x.args),null);
});
