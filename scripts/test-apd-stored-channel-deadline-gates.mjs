/* Tests the real generated functions, with synthetic db/email/channel fixtures.
 * Strictly no network, no database writes and no outbound messages.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {apdOfferDeadlineStatus} from "./lib/apd-offer-close-guard.mjs";

const src=readFileSync("tmp/apd-channel-deadline-safe-worker/worker_hotfix.js","utf8");
function extract(name){
 const candidates=["async function "+name+"(","function "+name+"("];
 let start=-1;
 for(const s of candidates){start=src.indexOf(s);if(start>=0)break;}
 assert.ok(start>=0,"Missing routine "+name);
 const ends=["\n__name("+name+",","\n  __name("+name+","];
 const positions=ends.map(x=>src.indexOf(x,start)).filter(x=>x>start);
 assert.ok(positions.length,"Missing function end "+name);
 return src.slice(start,Math.min(...positions));
}
const fixedNow=Date.parse("2026-11-04T20:00:00Z");
const gate=offer=>apdOfferDeadlineStatus(offer,fixedNow);
const abc=(date,estado="Publicada")=>({
 estado,finoferta:date,source_offer_key:"ABC_RECORD"
});
const stored=(date,estado="Publicada",suffix="x")=>({
 estado:"Publicada",source_offer_key:"D_"+suffix,cargo:"Matemática",
 raw:{estado:"Publicada",raw:abc(date,estado)},
 fecha_cierre:"31/12/2099 23:59"
});
const rows=[
 {id:"old1",offer_id:"D_old",offer_payload:stored("2020-05-03T07:30:00Z","Publicada","old"),last_seen_at:"2026-11-04T19:00:00Z"},
 {id:"future1",offer_id:"D_future",offer_payload:stored("2026-11-05T07:30:00Z","Publicada","future"),last_seen_at:"2026-11-04T19:01:00Z"},
 {id:"closed1",offer_id:"D_closed",offer_payload:stored("2099-11-05T07:30:00Z","Cerrada","closed"),last_seen_at:"2026-11-04T19:02:00Z"},
 {id:"unknown1",offer_id:"D_unknown",offer_payload:{estado:"Publicada",source_offer_key:"D_unknown",cargo:"Matemática",fecha_cierre:"31/12/2099 23:59"},last_seen_at:"2026-11-04T19:03:00Z"}
];
test("PID cached offer reader excludes expired/closed/unverifiable rows",async()=>{
 const get=new Function("pdSupabaseSelect","apdOfferDeadlineStatus",
  extract("fetchStoredOffers")+"\nreturn fetchStoredOffers;")(
    async()=>rows,gate
 );
 const out=await get({},"TEST_ACCOUNT");
 assert.deepEqual(out.map(x=>x.offer_id),["D_future"]);
});
for(const fn of ["loadTelegramStoredAlerts","waLoadStoredAlerts"]){
 test(fn+" rejects the same expired/closed/unverifiable cached offers",async()=>{
  const method=new Function("supabaseSelect","normalizeOfferPayload","apdOfferDeadlineStatus",
    extract(fn)+"\nreturn "+fn+";")(
    async()=>rows,x=>x,gate
  );
  const result=await method({},"TEST_ACCOUNT",50);
  assert.equal(result.length,1);
  assert.equal(result[0].offer_payload.source_offer_key,"D_future");
 });
}
function runLegacyEmailDigest({deadlineJump=false}={}){
 let now=fixedNow,sendEvents=[],patchEvents=[],renderAlerts=[];
 const liveGate=x=>apdOfferDeadlineStatus(x,now);
 const sql=async(env,path)=>{
  if(path.startsWith("users?"))return [{id:"TEST_ACCOUNT",nombre:"Prueba",email:"synthetic@example.invalid",activo:true}];
  if(path.startsWith("user_preferences?"))return [{alertas_activas:true,alertas_email:true}];
  if(path.startsWith("user_offer_state?")) return deadlineJump?[{
    id:"future1",offer_id:"D_future",
    offer_payload:{...stored("2026-11-05T07:30:00Z","Publicada","future"),idoferta:"12",iddetalle:"34"},
    last_seen_at:"2026-11-04T19:01:00Z"
  }]:rows;
  throw Error("Unexpected query "+path);
 };
 const fn=new Function("supabaseSelect","resolverPlanUsuario","isPlanActivo","parseFechaFlexible",
  "obtenerResumenPostulantesABC","buildTop5NuevasHtml","enviarMailBrevo","fetch",
  "apdOfferDeadlineStatus",extract("sendPendingEmailDigests")+"\nreturn sendPendingEmailDigests;")(
   sql,async()=>({subscription:{status:"active"}}),()=>true,
   x=>new Date(x),
   async()=>{if(deadlineJump)now=Date.parse("2026-11-05T10:31:00Z");return {};},
   alerts=>{renderAlerts=alerts;return "FAKE_HTML";},
   async(recipient,name,subject)=>{sendEvents.push({subject});return {ok:true};},
   async(url,init)=>{assert.equal(init.method,"PATCH");patchEvents.push(url);return new Response(null,{status:204});},
   liveGate
 );
 return {run:()=>fn({SUPABASE_URL:"https://test.invalid",SUPABASE_SERVICE_ROLE_KEY:"MOCK"},{}),sendEvents,patchEvents,getRendered:()=>renderAlerts};
}
test("legacy email digest skips expired rows and patches only delivered offers",async()=>{
 const f=runLegacyEmailDigest();
 const result=await f.run();
 assert.equal(result.sent_digests,1);
 assert.equal(f.sendEvents.length,1);
 assert.match(f.sendEvents[0].subject,/1 nueva oferta/);
 assert.equal(f.patchEvents.length,1);
 assert.equal(f.getRendered().length,1);
 assert.equal(f.getRendered()[0].offer_payload.source_offer_key,"D_future");
});
test("legacy email digest rechecks closure AFTER enrichment and sends nothing after expiry",async()=>{
 const f=runLegacyEmailDigest({deadlineJump:true});
 const result=await f.run();
 assert.equal(result.sent_digests,0);
 assert.deepEqual(f.sendEvents,[]);
 assert.deepEqual(f.patchEvents,[]);
});
test("Telegram and WhatsApp repeat closure gate just before rendering",()=>{
 const tg=extract("handleTelegramWebhook");
 const wa=extract("handleWhatsAppWebhook");
 assert.match(tg,/applyPidVisibilityToAlerts\([\s\S]*?\.filter\(item => apdOfferDeadlineStatus\(item\?\.offer_payload \|\| item\)\.eligible\)/);
 assert.match(wa,/applyPidVisibilityToAlerts\([\s\S]*?\.filter\(item => apdOfferDeadlineStatus\(item\?\.offer_payload \|\| item\)\.eligible\)/);
});
test("email digest dedupe IDs describe only the actual rendered offers",()=>{
 const sweep=extract("runEmailAlertsSweep");
 assert.match(sweep,/const visibleAlertKeys = visibleAlertsForRender\.map/);
 assert.match(sweep,/const visibleOfferIds = visibleAlertsForRender\.map/);
 assert.doesNotMatch(sweep,/const visibleAlertKeys = visibleSource\.map/);
 assert.doesNotMatch(sweep,/const visibleOfferIds = visibleSource\.map/);
});
