import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const script=readFileSync("scripts/audit-apd-scanner-expiration-real.mjs","utf8");
const source=readFileSync("worker-live/worker_hotfix.js","utf8");
test("only public offer state, district, and expiry fields requested",()=>{
 assert.match(script,/"fl","descdistrito,estado,finoferta,fecha_cierre"/);
 assert.match(script,/"rows","300"/);
 assert.match(script,/documents_stored_or_logged:0/);
 assert.match(script,/credentials:"omit"/);
 assert.match(script,/uses_exact_current_worker_expiry_filter:true/);
 assert.doesNotMatch(script,/idoferta|iddetalle|DNI|CUIL|email|user_id|service_role|Authorization:|method:"POST"/);
});
test("real Worker expiration function rejects an old offer but not future published offer",()=>{
 const grab=(a,b)=>{
  const i=source.indexOf(a),j=source.indexOf(b,i);
  assert.ok(i>=0&&j>i);
  return source.slice(i,j);
 };
 const ctx=vm.createContext({Date});
 vm.runInContext([
  grab("function norm2(","\n__name(norm2"),
  grab("function parseFechaFlexible2(","\n__name(parseFechaFlexible2"),
  grab("function ofertaVigente(","\n__name(ofertaVigente")
 ].join("\n"),ctx);
 assert.equal(ctx.ofertaVigente({estado:"Publicada",finoferta:"2020-01-01"}),false);
 assert.equal(ctx.ofertaVigente({estado:"Publicada",finoferta:"2099-01-01"}),true);
 assert.equal(ctx.ofertaVigente({estado:"Anulada",finoferta:"2099-01-01"}),false);
 assert.equal(ctx.ofertaVigente({estado:"Publicada"}),true);
});
