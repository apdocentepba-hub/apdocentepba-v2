/* Research-only fail-closed transformation for stored channels.
 * No Cloudflare calls, email sends or database modifications.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
const input="tmp/apd-mail-verified-worker/worker_hotfix.js";
const output="tmp/apd-channel-deadline-safe-worker/worker_hotfix.js";
const pinned="c4bc191256bb465244bf0fcd69838add30a13d5f48ba2fc8bccf337e3225bba8";
const sha=x=>createHash("sha256").update(x).digest("hex");
let code=readFileSync(input,"utf8");
assert.equal(sha(code),pinned,"STOP: source differs from reviewed email-safe candidate");
const changed=[];
function patch(name,oldText,newText){
 const starts=["async function "+name+"(","function "+name+"("];
 let start=-1;for(const s of starts){start=code.indexOf(s);if(start>=0)break;}
 const ends=["\n__name("+name+",","\n  __name("+name+","];
 let end=-1;for(const marker of ends){const i=code.indexOf(marker,start);if(i>=0&&(end<0||i<end))end=i;}
 assert.ok(start>=0&&end>start,"Missing function "+name);
 const fn=code.slice(start,end);
 assert.equal(fn.split(oldText).length,2,"Unexpected source drift in "+name);
 code=code.slice(0,start)+fn.replace(oldText,newText)+code.slice(end);
 changed.push(name);
}
patch("fetchStoredOffers",
 '    offer_id: row.offer_id || row.offer_payload?.offer_id || ""\n  }));',
 '    offer_id: row.offer_id || row.offer_payload?.offer_id || ""\n  })).filter(item => apdOfferDeadlineStatus(item).eligible);');
patch("sendPendingEmailDigests",
 '    const nuevas = rows.filter((x) => x && x.is_active !== false).sort((a, b) => {',
 '    const nuevas = rows.filter((x) => x && x.is_active !== false && apdOfferDeadlineStatus(x?.offer_payload || x).eligible).sort((a, b) => {');
patch("sendPendingEmailDigests",
 '    const html = buildTop5NuevasHtml(alerts, user);',
 '    // Recheck after reading postulantes: offer may expire while enriching.\n    const safeAlerts = alerts.filter(item => apdOfferDeadlineStatus(item?.offer_payload || item).eligible);\n    if (!safeAlerts.length) continue;\n    const html = buildTop5NuevasHtml(safeAlerts, user);');
patch("sendPendingEmailDigests",
 '    const asunto = `APDocentePBA: ${alerts.length} nueva${alerts.length === 1 ? "" : "s"} oferta${alerts.length === 1 ? "" : "s"} para vos`;',
 '    const asunto = `APDocentePBA: ${safeAlerts.length} nueva${safeAlerts.length === 1 ? "" : "s"} oferta${safeAlerts.length === 1 ? "" : "s"} para vos`;');
patch("sendPendingEmailDigests",
 '        nuevas.map((row) => {',
 '        nuevas.filter(row => safeAlerts.some(item => item.row_id === row.id)).map((row) => {');
patch("loadTelegramStoredAlerts",
 '      return !!(p.offer_id || p.source_offer_key || p.iddetalle || p.idoferta || p.cargo || p.materia || p.title);',
 '      return !!(p.offer_id || p.source_offer_key || p.iddetalle || p.idoferta || p.cargo || p.materia || p.title)\n        && apdOfferDeadlineStatus(item.offer_payload || item).eligible;');
patch("waLoadStoredAlerts",
 '      return !!(p.offer_id || p.source_offer_key || p.iddetalle || p.idoferta || p.codigo || p.cargo || p.materia || p.title);',
 '      return !!(p.offer_id || p.source_offer_key || p.iddetalle || p.idoferta || p.codigo || p.cargo || p.materia || p.title)\n        && apdOfferDeadlineStatus(item.offer_payload || item).eligible;');
patch("handleTelegramWebhook",
 '    const visibleAlertsForRender = applyPidVisibilityToAlerts(\n      visibleAlerts,\n      entitlement?.plan_code\n    );',
 '    const visibleAlertsForRender = applyPidVisibilityToAlerts(\n      visibleAlerts,\n      entitlement?.plan_code\n    ).filter(item => apdOfferDeadlineStatus(item?.offer_payload || item).eligible);');
patch("handleWhatsAppWebhook",
 '          const visibleAlertsForRender = applyPidVisibilityToAlerts(\n            visibleAlerts,\n            entitlement?.plan_code\n          );',
 '          const visibleAlertsForRender = applyPidVisibilityToAlerts(\n            visibleAlerts,\n            entitlement?.plan_code\n          ).filter(item => apdOfferDeadlineStatus(item?.offer_payload || item).eligible);');
patch("runEmailAlertsSweep",
 '    const visibleAlertKeys = visibleSource.map((item) => buildEmailAlertKey(userId, item?.offer_payload || item || {})).filter(Boolean);',
 '    const visibleAlertKeys = visibleAlertsForRender.map((item) => buildEmailAlertKey(userId, item?.offer_payload || item || {})).filter(Boolean);');
patch("runEmailAlertsSweep",
 '    const visibleOfferIds = visibleSource.map((item) => {',
 '    const visibleOfferIds = visibleAlertsForRender.map((item) => {');
assert.equal(changed.length,11);
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,code);
writeFileSync("tmp/apd-channel-deadline-safe-worker/attestation.json",JSON.stringify({
 base_source_sha256:pinned,candidate_sha256:sha(code),
 modified_functions:[...new Set(changed)],
 db_writes:0,emails_sent:0,cloudflare_uploaded:false,production_modified:false
},null,2)+"\n");
console.log("APD_STORED_CHANNEL_DEADLINE_GATES_OK "+JSON.stringify({
 candidate_sha256:sha(code),changed_functions:[...new Set(changed)],
 emails_sent:0,db_writes:0,traffic_changed:false
}));
