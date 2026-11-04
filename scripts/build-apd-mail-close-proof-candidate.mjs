/* Creates an OFFLINE revised email presentation from the exact 0%-traffic
 * final Worker. Does not replace the uploaded version or send any emails.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname} from "node:path";
import {createHash} from "node:crypto";
const input="tmp/apd-morning-worker/worker_hotfix.js";
const output="tmp/apd-mail-verified-worker/worker_hotfix.js";
const pinned="0d6f54103c7821960cdd28fbf395fa10ba3837dc60aa9618fb4c82d1380a73fe";
const sha=s=>createHash("sha256").update(s).digest("hex");
const original=readFileSync(input,"utf8");
assert.equal(sha(original),pinned,"STOP: 0%-uploaded source drifted");
let src=original;
const changed=[];
function patch(name,from,to){
 const start=src.indexOf("function "+name+"("),end=src.indexOf("\n__name("+name+",",start);
 assert.ok(start>=0&&end>start,"Missing "+name);
 const fn=src.slice(start,end);
 assert.equal(fn.split(from).length,2,"Function "+name+" changed unexpectedly");
 src=src.slice(0,start)+fn.replace(from,to)+src.slice(end);
 changed.push(name);
}
patch("renderMailOfferCard",
 '  const titulo = p.cargo || p.materia || p.title || "Oferta APD";',
 '  const titulo = p.cargo || p.materia || p.title || "Oferta APD";\n  const cierreValidado = apdMailClosingLabel(raw);');
patch("renderMailOfferCard",
 'mailInfoBox("CIERRE", escHtml(p.fecha_cierre || p.finoferta || "\\u2014"))',
 'mailInfoBox("CIERRE DE POSTULACIÓN (ABC)", escHtml(cierreValidado.text))');
patch("buildDigestHtml",
 '  const items = visibleAlerts.map(renderMailOfferCard).join("");',
 '  const items = visibleAlerts.map(renderMailOfferCard).join("");\n  const generatedLabel = apdMailGeneratedAtLabel();');
patch("buildDigestHtml",
 '                    ${intro}\n                  </div>\n\n                  <table role="presentation"',
 [
 '                    ${intro}',
 '                  </div>',
 '                  <div style="background:#fff8e8;border:1px solid #f2d38b;padding:11px 12px;margin:0 0 14px 0;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#654321;">',
 '                    ${escHtml("Aviso generado: " + generatedLabel + ". Fecha y hora de cierre según la oferta consultada en ABC. Verificá el plazo y la disponibilidad en ABC y en la SAD de tu distrito antes de postularte; pueden existir cambios o diferencias de horario. Este mensaje no confirma una designación.")}',
 '                  </div>',
 '',
 '                  <table role="presentation"'
 ].join("\n").replace(/@@/g,"$")
);
const helper=readFileSync("scripts/lib/apd-mail-close-proof.mjs","utf8")
 .replace(/^import \{apdOfferDeadlineStatus\} from "\.\/apd-offer-close-guard\.mjs";\s*/m,"")
 .replace(/^export function /gm,"function ");
assert.ok(!/\bimport\b/.test(helper.replace(/\/\*[\s\S]*?\*\//g,"")),"Unexpected imports in helper");
assert.equal((helper.match(/^function /gm)||[]).length,2);
const finalSource=helper+"\n"+src;
assert.notEqual(finalSource,original);
assert.deepEqual(changed,["renderMailOfferCard","renderMailOfferCard","buildDigestHtml","buildDigestHtml"]);
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,finalSource);
console.log("APD_MAIL_CLOSE_PROOF_CANDIDATE_OK "+JSON.stringify({
 source_base_sha256:pinned,source_candidate_sha256:sha(finalSource),
 changed_functions:[...new Set(changed)],validated_close_only:true,
 generated_at_timezone:"America/Argentina/Buenos_Aires",
 not_uploaded:true,traffic_changes:0,emails_sent:0
}));
