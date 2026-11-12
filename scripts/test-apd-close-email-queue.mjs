/* Proof that an already expired or unverifiable offer cannot enter email queue
 * through the actual generated sendEmailAlertForUser function.
 * All calls are local mocks; no database, email provider or user credentials.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {apdOfferDeadlineStatus} from "./lib/apd-offer-close-guard.mjs";
const code=readFileSync(process.env.APD_TEST_MORNING_WORKER==="1"?"tmp/apd-morning-worker/worker_hotfix.js":process.env.APD_TEST_FINAL_WORKER==="1"?"tmp/apd-ready-worker/worker_hotfix.js":"tmp/apd-close-safe-research/worker_hotfix.js","utf8");
const name="sendEmailAlertForUser";
const start=code.indexOf("async function "+name+"(");
const end=code.indexOf("\n__name("+name+",",start);
assert.ok(start>=0&&end>start);
const fn=code.slice(start,end);
const normalizeStart=code.indexOf("function normalizeOfferPayload(");
const normalizeEnd=code.indexOf("\n__name(normalizeOfferPayload,",normalizeStart);
assert.ok(normalizeStart>=0&&normalizeEnd>normalizeStart);
const normalizeOfferPayload=new Function("canonicalOfferIdentity",
 code.slice(normalizeStart,normalizeEnd)+"\nreturn normalizeOfferPayload;")(
  p=>String(p?.source_offer_key||p?.raw?.source_offer_key||p?.iddetalle||"TEST_ID")
);
const inserts=[];
const send=new Function(
 "buildEmailAlertKey","normalizeOfferPayload","apdOfferDeadlineStatus","supabaseInsert",
 fn+"\nreturn "+name+";"
)(
 ()=>"SYNTHETIC_ALERT_KEY",
 normalizeOfferPayload,
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
test("real normalization of nested stored ABC offer still queues while open",async()=>{
 inserts.length=0;
 const official={estado:"Publicada",finoferta:"2099-12-31T07:30:00Z"};
 const stored={estado:"",fecha_cierre:"31/12/2099",raw:{estado:"",raw:official}};
 const result=await send(env,user,{offer_payload:stored});
 assert.equal(result.ok,true);
 assert.equal(result.queued,true);
 assert.deepEqual(inserts.map(x=>x.table),["pending_notifications","notification_delivery_logs"]);
});
test("real normalization of nested stored ABC offer never queues after closure",async()=>{
 inserts.length=0;
 const official={estado:"Publicada",finoferta:"2020-01-01T07:30:00Z"};
 const stored={estado:"",fecha_cierre:"01/01/2020",raw:{estado:"",raw:official}};
 const result=await send(env,user,{offer_payload:stored});
 assert.equal(result.skipped,true);
 assert.equal(result.reason,"deadline_not_verified_or_expired");
 assert.deepEqual(inserts,[]);
});
test("email reader keeps ABC 07:30 closing offer open at 05:00 Argentina",()=>{
 const begin=code.indexOf("function ofertaVigente(");
 const end=code.indexOf("\n__name(ofertaVigente,",begin);
 assert.ok(begin>=0&&end>begin);
 const body=code.slice(begin,end);
 assert.doesNotMatch(body,/parseFechaFlexible2/,"Legacy UTC clock must not override source-specific deadline");
 const frozen=Date.parse("2026-11-05T08:00:00Z"); // 05:00 BA
 const active=new Function("apdOfferDeadlineStatus",body+"\nreturn ofertaVigente;")(
  x=>apdOfferDeadlineStatus(x,frozen)
 );
 assert.equal(active({estado:"Publicada",finoferta:"2026-11-05T07:30:00Z"}),true);
 assert.equal(active({estado:"Cerrada",finoferta:"2026-11-05T07:30:00Z"}),false);
 assert.equal(active({estado:"Publicada",finoferta:"2026-11-05T04:30:00Z"}),false);
});
test("email cron and initial digest include precise closure gate",()=>{
 function body(n){
  const s=code.indexOf("async function "+n+"(");
  const e=code.indexOf("\n__name("+n+",",s);
  assert.ok(s>0&&e>s,"Missing required function "+n);
  return code.slice(s,e);
 }
 const sweep=body("runEmailAlertsSweep");
 if(process.env.APD_TEST_MORNING_WORKER==="1"){
  assert.match(sweep,/storedAlerts\.filter\(item => \{/);
  assert.match(sweep,/const closing = apdOfferDeadlineStatus/);
  assert.match(sweep,/return closing\.eligible &&/);
 }else{
  assert.match(sweep,/storedAlerts\.filter\(item => apdOfferDeadlineStatus/);
 }
 assert.match(body("runEmailAlertsSweep"),/\.filter\(item => apdOfferDeadlineStatus\(item\?\.offer_payload \|\| item\)\.eligible\)/);
 assert.match(body("sendInitialAlertsDigestIfNeeded"),/candidates\.filter\(item => apdOfferDeadlineStatus\(item\)\.eligible\)/);
 assert.match(body("refreshEmailUserOfferStateFromAbc"),/fetchPublishedOffersForEmailDistrict/);
 const visibleFn=code.slice(code.indexOf("function ofertaVigente("),code.indexOf("\n__name(ofertaVigente"));
 assert.match(visibleFn,/apdOfferDeadlineStatus\(oferta\)/);
});
