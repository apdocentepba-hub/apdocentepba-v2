/* Creates a separate fail-closed ABC deadline research candidate.
 * The already-uploaded 0%-traffic PID Worker remains byte-for-byte identical.
 * No Cloudflare calls, no user data, no production writes.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {createHash} from "node:crypto";
const input="tmp/apd-published-pid-research/worker_hotfix.js";
const output="tmp/apd-close-safe-research/worker_hotfix.js";
const pinned="d4f84bdd2e1ca98bc04b2d23b6de51fc3ccf179c0a7168b904140adc6cc5433f";
const sha=s=>createHash("sha256").update(s).digest("hex");
const baseline=readFileSync(input,"utf8");
assert.equal(sha(baseline),pinned,"STOP: unexpected PID candidate");
let code=baseline;
const changed=[];
function patch(name,oldText,newText){
 const start=code.indexOf("async function "+name+"(")>=0
   ?code.indexOf("async function "+name+"("):code.indexOf("function "+name+"(");
 const end=code.indexOf("\n__name("+name+",",start);
 assert.ok(start>0&&end>start,"Missing function "+name);
 const fn=code.slice(start,end);
 assert.equal(fn.split(oldText).length,2,"Function "+name+" unexpectedly changed");
 const next=fn.replace(oldText,newText);
 assert.notEqual(next,fn);
 code=code.slice(0,start)+next+code.slice(end);
 changed.push(name);
}
patch("construirAlertasParaUsuario",
 "    if (!ofertaEsVisibleParaAlerta(oferta)) {",
 [
 "    // ABC Publicada is not sufficient: require unexpired, precise closure.",
 "    const deadline = apdOfferDeadlineStatus(oferta);",
 "    if (!deadline.eligible) {",
 "      descartadas.push({iddetalle:oferta.iddetalle || oferta.id || null,motivo:'cierre_'+deadline.reason});",
 "      continue;",
 "    }",
 "    if (!ofertaEsVisibleParaAlerta(oferta)) {"
 ].join("\n"));
patch("ofertaVigente",
 '  const estado = norm2(oferta?.estado || "");',
 '  if (!apdOfferDeadlineStatus(oferta).eligible) return false;\n  const estado = norm2(oferta?.estado || "");');
patch("sendInitialAlertsDigestIfNeeded",
 "  const items = Array.isArray(alertData?.resultados) ? alertData.resultados : Array.isArray(alertData?.alertas) ? alertData.alertas : [];",
 "  const candidates = Array.isArray(alertData?.resultados) ? alertData.resultados : Array.isArray(alertData?.alertas) ? alertData.alertas : [];\n  const items = candidates.filter(item => apdOfferDeadlineStatus(item).eligible);");
patch("sendEmailAlertForUser",
 "    const payload = {\n      alert_key: alertKey || null,\n      source: options.source || \"cron\",\n      alert: canonicalAlert\n    };",
 "    if (!apdOfferDeadlineStatus(canonicalAlert).eligible) {\n      return {ok:true,skipped:true,reason:'deadline_not_verified_or_expired',alert_key:alertKey};\n    }\n    const payload = {\n      alert_key: alertKey || null,\n      source: options.source || \"cron\",\n      alert: canonicalAlert\n    };");
patch("runEmailAlertsSweep",
 "    const sortedLatest = storedAlerts.slice().sort((a, b) => emailAlertTime(b) - emailAlertTime(a));",
 "    const sortedLatest = storedAlerts.filter(item => apdOfferDeadlineStatus(item?.offer_payload || item).eligible)\n      .sort((a, b) => emailAlertTime(b) - emailAlertTime(a));");
patch("runEmailAlertsSweep",
 "    const visibleAlertsForRender = applyPidVisibilityToAlerts(\n      visibleAlerts,\n      emailPlanCode\n    );",
 "    const visibleAlertsForRender = applyPidVisibilityToAlerts(\n      visibleAlerts,\n      emailPlanCode\n    ).filter(item => apdOfferDeadlineStatus(item?.offer_payload || item).eligible);");
const guard=readFileSync("scripts/lib/apd-offer-close-guard.mjs","utf8");
assert.equal((guard.match(/export function /g)||[]).length,2);
const functions=guard.replace(/^export function /gm,"function ");
code=functions+"\n"+code;
const reversed=code.slice(functions.length+1);
assert.equal(reversed.replace(/[\s\S]*/,""),""); // no-op shape sanity
assert.notEqual(code,baseline);
assert.deepEqual(changed.sort(),["construirAlertasParaUsuario","ofertaVigente","runEmailAlertsSweep","runEmailAlertsSweep","sendEmailAlertForUser","sendInitialAlertsDigestIfNeeded"].sort());
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,code);
console.log("APD_CLOSE_SAFE_RESEARCH_GENERATED "+JSON.stringify({
 status:"not_uploaded",source_sha256:pinned,candidate_sha256:sha(code),
 touched_functions:changed,fail_closed_on_unknown_time:true,
 timezone:"America/Argentina/Buenos_Aires",no_email_sent:true,production_unchanged:true
}));
