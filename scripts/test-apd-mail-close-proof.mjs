import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {apdMailClosingLabel,apdMailGeneratedAtLabel} from "./lib/apd-mail-close-proof.mjs";
const text=readFileSync("tmp/apd-mail-verified-worker/worker_hotfix.js","utf8");
function extract(name){
 const start=text.indexOf("function "+name+"(");
 const end=text.indexOf("\n__name("+name+",",start);
 assert.ok(start>0&&end>start,"Missing expected email template function "+name);
 return text.slice(start,end);
}
const mocks={
  normalizeOfferPayload:o=>o,
  buildMailChanceInfo:()=>({title:"Información orientativa"}),
  parseMailNumber:v=>Number(v),
  escHtml:v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),
  mailInfoBox:(name,value)=>name+":"+value,
  mailMiniBox:(name,value)=>name+":"+value,
  formatMailNumber:v=>String(v),
  PANEL_URL:"https://alertasapd.com.ar",
  apdMailClosingLabel,
  __name:x=>x,__name2:x=>x,__name22:x=>x,__name222:x=>x,__name2222:x=>x
};
const vars=Object.keys(mocks);
const renderMailOfferCard=new Function(...vars,extract("renderMailOfferCard")+
 "\nreturn renderMailOfferCard;")(...Object.values(mocks));
const digest=new Function("normalizeOfferPayload","escHtml","renderMailOfferCard","apdMailGeneratedAtLabel",
 extract("buildDigestHtml")+"\nreturn buildDigestHtml;")(
 mocks.normalizeOfferPayload,mocks.escHtml,renderMailOfferCard,
 ()=>"04/11/2026 17:00 hs (Argentina)"
);
const now=Date.parse("2026-11-04T20:00:00Z");
const sample={
 estado:"Publicada",cargo:"Matemática",distrito:"Quilmes",
 finoferta:"2026-11-05T07:30:00Z",
 fecha_cierre:"31/12/2099, 23:59",source_offer_key:"D_11",iddetalle:"11"
};
test("email closure is the authoritative ABC local instant, not outdated formatted label",()=>{
 const result=apdMailClosingLabel(sample,now);
 assert.equal(result.safe,true);
 assert.equal(result.text,"05/11/2026 a las 07:30 hs (Argentina)");
 const html=renderMailOfferCard(sample);
 assert.ok(html.includes("05/11/2026 a las 07:30 hs (Argentina)"));
 assert.ok(!html.includes("31/12/2099"));
 assert.ok(html.includes("CIERRE DE POSTULACIÓN (ABC)"));
});
test("email cannot label expired, closed or unknown-hours offer as open",()=>{
 for(const offer of [
  {...sample,finoferta:"2020-01-01T07:30:00Z"},
  {...sample,estado:"Cerrada"},
  {...sample,finoferta:"2026-11-05"},
  {...sample,finoferta:""}
 ]){
  const t=apdMailClosingLabel(offer,now);
  assert.equal(t.safe,false);
  assert.ok(t.text.includes("no verificable"));
  assert.ok(!renderMailOfferCard(offer).includes("05/11/2026 a las 07:30 hs (Argentina)"));
 }
});
test("stored nested official ABC close overrides outer display label",()=>{
 const item={estado:"Publicada",fecha_cierre:"31/12/2099, 23:59",
  raw:{estado:"Publicada",finoferta:"2026-11-05T07:30:00Z"}};
 const status=apdMailClosingLabel(item,now);
 assert.equal(status.safe,true);
 assert.equal(status.text,"05/11/2026 a las 07:30 hs (Argentina)");
});
test("generation timestamp is in Buenos Aires independent of CI timezone",()=>{
 assert.equal(apdMailGeneratedAtLabel(now),"04/11/2026 17:00 hs (Argentina)");
});
test("digest visibly warns to verify both ABC and district SAD before applying",()=>{
 const html=digest([{offer_payload:sample}],{nombre:"Docente de prueba"},{
  total_alerts:1,max_visible:1,panel_url:"https://alertasapd.com.ar"
 });
 assert.ok(html.includes("Aviso generado: 04/11/2026 17:00 hs (Argentina)"));
 assert.ok(html.includes("Verificá el plazo y la disponibilidad en ABC y en la SAD"));
 assert.ok(html.includes("no confirma una designación"));
 assert.ok(html.includes("05/11/2026 a las 07:30 hs (Argentina)"));
 assert.ok(!html.includes("31/12/2099"));
});
