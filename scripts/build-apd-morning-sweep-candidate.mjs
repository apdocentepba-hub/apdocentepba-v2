/* Optional morning deadline email slot for APD, using the existing
 * continuation Cron 1-59/2. No fifth trigger, no new service, no deployment.
 * Only generates a local research candidate from the fully tested release.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {createHash} from "node:crypto";
const input="tmp/apd-ready-worker/worker_hotfix.js";
const output="tmp/apd-morning-worker/worker_hotfix.js";
const pinned="1f2b499cd4144b5987516b8546a4ad68fcca7e5877fd4f14792bec5411d13be2";
const digest=s=>createHash("sha256").update(s).digest("hex");
let src=readFileSync(input,"utf8");
assert.equal(digest(src),pinned,"STOP: changed combined APD Worker");
let touched=[];
function changeFunction(name,from,to){
 let begin=src.indexOf("function "+name+"(");
 if(begin<0)begin=src.indexOf("async function "+name+"(");
 const end=src.indexOf("\n__name("+name+",",begin);
 assert.ok(begin>=0&&end>begin,"Unknown Worker routine "+name);
 const f=src.slice(begin,end);
 assert.equal(f.split(from).length,2,"Worker routine "+name+" drifted");
 src=src.slice(0,begin)+f.replace(from,to)+src.slice(end);
 touched.push(name);
}
changeFunction("getArgentinaDigestSlotInfo",
 "const slotHour = [14, 18, 22].includes(hour) ? hour : null;",
 "const slotHour = [6, 14, 18, 22].includes(hour) ? hour : null;");
changeFunction("getMostRecentArgentinaDigestSlotInfo",
 "  else if (hour >= 14) slotHour = 14;\n  else {",
 "  else if (hour >= 14) slotHour = 14;\n  else if (hour >= 6) slotHour = 6;\n  else {");
changeFunction("runEmailAlertsSweep",
 "    const sortedLatest = storedAlerts.filter(item => apdOfferDeadlineStatus(item?.offer_payload || item).eligible)\n      .sort((a, b) => emailAlertTime(b) - emailAlertTime(a));",
 [
 "    const morningUrgent = /_06$/.test(slotKey);",
 "    const morningDeadlineLimit = Date.now() + (5 * 60 * 60 * 1000);",
 "    const sortedLatest = storedAlerts.filter(item => {",
 "      const closing = apdOfferDeadlineStatus(item?.offer_payload || item);",
 "      return closing.eligible && (!morningUrgent || closing.closes_at_ms <= morningDeadlineLimit);",
 "    }).sort((a, b) => emailAlertTime(b) - emailAlertTime(a));"
 ].join("\n"));
const begin=src.indexOf("  async scheduled(event, env, ctx) {");
const end=src.indexOf("\n  }\n};",begin);
assert.ok(begin>=0&&end>begin,"Missing scheduled handler");
let fn=src.slice(begin,end);
const anchors=[
 ["    const isRecognizedEmailCron = isPrimaryEmailCron || isContinuationCron;",
 [
 "    // 06:01-06:13 Buenos Aires kickoff on existing 2-minute Cron.",
 "    // Never insert a new trigger into a free Cloudflare account.",
 "    const isMorningKickoff = isContinuationCron && slot.hour === 6",
 "      && slot.minute >= 1 && slot.minute <= 13;",
 "    const isRecognizedEmailCron = isPrimaryEmailCron || isContinuationCron;"
 ].join("\n")],
 ["    if (isContinuationCron && !activeSlotKey) {",
  "    if (isContinuationCron && !activeSlotKey && !isMorningKickoff) {"]
];
for(const [from,to] of anchors){
 assert.equal(fn.split(from).length,2,"Scheduled handler anchor drifted");
 fn=fn.replace(from,to);
}
src=src.slice(0,begin)+fn+src.slice(end);
touched.push("scheduled");
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,src);
console.log("APD_MORNING_SLOT_OFFLINE_CANDIDATE_OK "+JSON.stringify({
 base_sha256:pinned,candidate_sha256:digest(src),changed:touched,
 trigger_count_unchanged:4,morning_start:"06:01 Argentina",
 morning_urgent_window_hours:5,no_real_emails:true,no_live_deployment:true
}));
