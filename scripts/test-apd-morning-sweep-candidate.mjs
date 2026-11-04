/* Offline behavioral checks against exact generated morning candidate.
 * No emails, DB, ABC, Cloudflare, sessions or external network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {apdOfferDeadlineStatus} from "./lib/apd-offer-close-guard.mjs";
const code=readFileSync("tmp/apd-morning-worker/worker_hotfix.js","utf8");
function extract(name){
 const st=code.indexOf("function "+name+"(");
 const en=code.indexOf("\n__name("+name+",",st);
 assert.ok(st>=0&&en>st,"Missing "+name);
 return code.slice(st,en);
}
const getArgentinaDigestSlotInfo=new Function(extract("getArgentinaDigestSlotInfo")+
 "\nreturn getArgentinaDigestSlotInfo;")();
const getMostRecentArgentinaDigestSlotInfo=new Function("getArgentinaDigestSlotInfo",
 extract("getMostRecentArgentinaDigestSlotInfo")+"\nreturn getMostRecentArgentinaDigestSlotInfo;")(getArgentinaDigestSlotInfo);
const st=code.indexOf("  async scheduled(event, env, ctx) {");
const en=code.indexOf("\n  }\n};",st);
assert.ok(st>0&&en>st);
const scheduledSource=code.slice(st,en+4).trim().replace(/^async scheduled\(/,"async function scheduled(");
function simulate(){
 const memory=new Map(),calls=[],pending=[],other=[];
 const kv={
  get:async k=>memory.get(k)||null,
  put:async(k,v)=>{memory.set(k,String(v));},
  delete:async k=>{memory.delete(k);}
 };
 const scheduled=new Function(
 "getArgentinaDigestSlotInfo","getMostRecentArgentinaDigestSlotInfo",
 "getChannelStateStore","apdProcessExpiryNotices","checkEmailCronSlotHealth",
 "shouldRunProvinciaCurrentAuto","maybeRunProvinciaCurrentCron",
 "runEmailAlertsSweep","recordObservedEmailCron","console",
 scheduledSource+"\nreturn scheduled;"
 )(
  getArgentinaDigestSlotInfo,getMostRecentArgentinaDigestSlotInfo,
  ()=>kv,async()=>{throw Error("Unexpected morning expiry notices");},
  async()=>({ok:true}),()=>false,async()=>{},
  async(_env,opts)=>{calls.push({...opts});return {ok:true,finished:true,processed_users:2,sent_count:0};},
  async()=>{}, {log(){},error(...args){other.push(args)}}
 );
 const ctx={waitUntil(p){pending.push(Promise.resolve(p));}};
 const run=async(iso,cron="1-59/2 * * * *")=>{
  await scheduled({scheduledTime:Date.parse(iso),cron},{},ctx);
  await Promise.all(pending.splice(0));
 };
 return {run,calls,memory,other};
}
test("morning start occurs at 06:01 Argentina using EXISTING 2-minute Cron",async()=>{
 const s=simulate();
 assert.equal(getArgentinaDigestSlotInfo("2026-11-05T09:01:00Z").slot_key,"2026-11-05_06");
 await s.run("2026-11-05T09:01:00Z");
 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0].slot_key,"2026-11-05_06");
 assert.equal(s.calls[0].source,"cron_slot");
 assert.ok(s.memory.has("email:slot:2026-11-05_06:finished"));
 await s.run("2026-11-05T09:03:00Z");
 assert.equal(s.calls.length,1,"No repeated completed morning digest");
});
test("morning kickoff tolerates a missed 06:01 but does not start late at 06:15",async()=>{
 const s=simulate();
 await s.run("2026-11-05T09:09:00Z");
 assert.equal(s.calls.length,1);
 const later=simulate();await later.run("2026-11-05T09:15:00Z");
 assert.equal(later.calls.length,0);
});
test("regular 14:00 Argentina Cron still schedules its normal slot",async()=>{
 const s=simulate();
 await s.run("2026-11-05T17:00:00Z","0 17 * * *");
 assert.deepEqual(s.calls.map(c=>c.slot_key),["2026-11-05_14"]);
});
test("outside morning window, continuation alone does not invent extra digests",async()=>{
 const s=simulate();
 await s.run("2026-11-05T08:59:00Z");
 await s.run("2026-11-05T10:01:00Z");
 assert.equal(s.calls.length,0);
});
test("morning digest is restricted to offers with imminent verified closing time",()=>{
 const fn=extract("runEmailAlertsSweep");
 const begin=fn.indexOf("    const morningUrgent = /_06$/.test(slotKey);");
 const end=fn.indexOf("    const totalAlerts = sortedLatest.length;",begin);
 assert.ok(begin>0&&end>begin);
 const slice=fn.slice(begin,end);
 assert.match(slice,/closing\.eligible/);
 const apply=new Function("slotKey","storedAlerts","apdOfferDeadlineStatus","emailAlertTime","Date",
 slice+"\nreturn sortedLatest;");
 const now=Date.parse("2026-11-05T09:01:00Z");
 const day={now:()=>now};
 const docs=[
  {offer_payload:{estado:"Publicada",finoferta:"2026-11-05T07:30:00Z"},id:1},
  {offer_payload:{estado:"Publicada",finoferta:"2026-11-05T10:30:00Z"},id:2},
  {offer_payload:{estado:"Publicada",finoferta:"2026-11-05T14:30:00Z"},id:3},
  {offer_payload:{estado:"Publicada",finoferta:"2026-11-05T05:00:00Z"},id:4},
  {offer_payload:{estado:"Publicada",finoferta:"2026-11-05"},id:5}
 ];
 const morning=apply("2026-11-05_06",docs,apdOfferDeadlineStatus,()=>0,day);
 const afternoon=apply("2026-11-05_14",docs,apdOfferDeadlineStatus,()=>0,day);
 assert.deepEqual(morning.map(x=>x.id),[1,2]);
 assert.deepEqual(afternoon.map(x=>x.id),[1,2,3]);
});
