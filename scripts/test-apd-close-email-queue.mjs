/* Proof that an already expired or unverifiable offer cannot enter email queue
 * through the actual generated sendEmailAlertForUser function.
 * All calls are local mocks; no database, email provider or user credentials.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {apdOfferDeadlineStatus} from "./lib/apd-offer-close-guard.mjs";
const code=readFileSync("tmp/apd-close-safe-research/worker_hotfix.js","utf8");
const name="sendEmailAlertForUser";
const start=code.indexOf("async function "+name+"(");
const end=code.indexOf("\n__name("+name+",",start);
assert.ok(start>=0&&end>start);
const fn=code.slice(start,end);
const inserts=[];
const send=new Function(
 "buildEmailAlertKey","normalizeOfferPayload","apdOfferDeadlineStatus","supabaseInsert",
 fn+"\nreturn "+name+";"
)(
 ()=>"SYNTHETIC_ALERT_KEY",
 x=>x,
 apdOfferDeadlineStatus,
 async(env,table,payload)=>{inserts.push({table,payload});return {id:"MOCK_ID"};}
);
const env={},user={id:"TEST_USER",email:"synthetic@example.invalid"};
test("published offer already closed at exact millisecond is NOT queued",async()=>{
 inserts.length=0;
 const item={estado:"Publicada",finoferta:"2020-01-01T12:00:00Z",source_offer_key:"D_1"};
 const result=await send(env,user,item);
 assert.equal(result.skipped,true);
 assert.equal(result.reason,"deadline_not_verified_or_expired");
 assert.deepEqual(inserts,[],"No writes, email or logs for invalid alert");
});
test("unknown closing hour is NOT queued",async()=>{
 inserts.length=0;
 const item={estado:"Publicada",finoferta:"2099-12-31",source_offer_key:"D_1"};
 const result=await send(env,user,item);
 assert.equal(result.skipped,true);
 assert.equal(inserts.length,0);
});
test("closed official status is NOT queued even when closing time is future",async()=>{
 inserts.length=0;
 const item={estado:"Cerrada",finoferta:"2099-12-31T23:00:00Z",source_offer_key:"D_1"};
 const result=await send(env,user,item);
 assert.equal(result.skipped,true);
 assert.equal(inserts.length,0);
});
test("verified open offer is queued through same function with synthetic DB",async()=>{
 inserts.length=0;
 const item={estado:"Publicada",finoferta:"2099-12-31T23:00:00Z",source_offer_key:"D_9"};
 const result=await send(env,user,item);
 assert.equal(result.ok,true);
 assert.equal(result.queued,true);
 assert.deepEqual(inserts.map(x=>x.table),["pending_notifications","notification_delivery_logs"]);
});
test("email cron and initial digest include precise closure gate",()=>{
 function body(n){
  const s=code.indexOf("async function "+n+"(");
  const e=code.indexOf("\n__name("+n+",",s);
  assert.ok(s>0&&e>s,"Missing required function "+n);
  return code.slice(s,e);
 }
 assert.match(body("runEmailAlertsSweep"),/storedAlerts\.filter\(item => apdOfferDeadlineStatus/);
 assert.match(body("runEmailAlertsSweep"),/\.filter\(item => apdOfferDeadlineStatus\(item\?\.offer_payload \|\| item\)\.eligible\)/);
 assert.match(body("sendInitialAlertsDigestIfNeeded"),/candidates\.filter\(item => apdOfferDeadlineStatus\(item\)\.eligible\)/);
 assert.match(body("refreshEmailUserOfferStateFromAbc"),/fetchPublishedOffersForEmailDistrict/);
 assert.match(code.slice(code.indexOf("function ofertaVigente("),code.indexOf("\n__name(ofertaVigente")),/apdOfferDeadlineStatus\(oferta\)/);
});
