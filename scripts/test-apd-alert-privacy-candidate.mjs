import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SAFE_RAW_FIELD_KEYS,safeObservationNotice,safeRawAlertOffer,OBSERVATION_NOTICE}
 from "./apd-alert-payload-minimization.mjs";

const original=readFileSync("worker-live/worker_hotfix.js","utf8");
const performanceCandidate=readFileSync("tmp/apd-alerts-performance/worker_hotfix.js","utf8");
const privateCandidate=readFileSync("tmp/apd-alerts-performance/worker_privacy_candidate.js","utf8");
function getSource(source,includeHelpers){
 const begin=includeHelpers?source.indexOf("const APD_SAFE_ALERT_FIELDS = Object.freeze("):
  source.indexOf("function buildAlertItem(");
 const ending=source.indexOf("\n__name(buildAlertItem,",begin);
 assert.ok(begin>=0 && ending>begin,"Canonical Worker buildAlertItem boundary missing");
 return source.slice(begin,ending);
}
function makeAlertBuilder(source,includeHelpers){
 const code=getSource(source,includeHelpers);
 const deps={
  formatearDiasHorariosOferta:()=> "Lunes 8:00",
  resolverTipoRevistaOferta:()=>({label:"Suplencia",codigo:"S"}),
  formatearFechaAbc:x=>x,
  buildAbcPostulantesUrl:(id,detail)=>"https://ejemplo.invalid/"+id+"/"+detail,
  buildSourceOfferKeyFromOferta:x=>"D_"+x.iddetalle,
  norm:x=>String(x||"").toUpperCase(),
  mapTurnoAPD:x=>x==="M"?"MANANA":x,
  normalizarCursoDivisionServidor:x=>x||""
 };
 return new Function(...Object.keys(deps),code+"\nreturn buildAlertItem;")(
  ...Object.values(deps)
 );
}
const baseline=makeAlertBuilder(original,false);
const optimized=makeAlertBuilder(performanceCandidate,false);
const minimized=makeAlertBuilder(privateCandidate,true);
const evaluation={match:true,detalle:{cargo:true}};
const pidInfo={compatible:true,reason:"Apto",match:{area:"PRE",puntaje_total:"54"},
 district_ok:true,area_ok:true,bloque_ok:true};
function sourceOffer(observation=""){
 return {
  id:"SOLR_2100",iddetalle:"2100",idoferta:"3400",
  descdistrito:"AVELLANEDA",estado:"Publicada",
  descripcioncargo:"PRECEPTOR",descripcionarea:"PRE",escuela:"EES FICTICIA",
  turno:"M",cursodivision:"1 A",supl_desde:"2026-11-02",
  supl_hasta:"2026-11-03",finoferta:"2026-11-03",
  observaciones:observation,ult_movimiento:"2026-11-02",
  cuilautor:"20-12345678-7",reemp_cuil:"27-12345678-2",
  reemp_apeynom:"NOMBRE FICTICIO",domiciliodesempeno:"DOMICILIO_FICTICIO",
  payload:{private_email:"secreto@example.com"},_version_:177
 };
}
const strip=a=>{const x={...a};delete x.raw;delete x.observaciones;return x};
test("two Worker candidates retain every computed top-level alert field",()=>{
 const input=sourceOffer("Correo docente@example.com; DNI 12345678");
 const a=baseline(input,evaluation,pidInfo);
 const b=optimized(input,evaluation,pidInfo);
 const c=minimized(input,evaluation,pidInfo);
 assert.deepEqual(a,b);
 assert.deepEqual(strip(c),strip(a));
 assert.equal(c.observaciones,OBSERVATION_NOTICE);
 assert.deepEqual(c.raw,safeRawAlertOffer(input));
 assert.equal(c.raw.observaciones,OBSERVATION_NOTICE);
 assert.equal(c.abc_url,a.abc_url);
 assert.equal(c.pid_compatible,a.pid_compatible);
});
test("free-text observations are withheld, including unrecognized personal names",()=>{
 for(const observation of [
  "docente@example.com", "CUIL 20-12345678-7",
  "La profesora Juanita Ejemplo vive en calle Inventada 123",
  "<img src=x onerror=alert(1)>",
  "Lunes de 8:00 a 10:00"
 ]){
  const value=minimized(sourceOffer(observation),evaluation,pidInfo);
  assert.equal(value.observaciones,OBSERVATION_NOTICE);
  assert.equal(value.raw.observaciones,OBSERVATION_NOTICE);
  const json=JSON.stringify(value);
  assert.equal(json.includes(observation),false,"Free text leaked");
  assert.doesNotMatch(json,/secreto@example\.com|20-12345678-7|DOMICILIO_FICTICIO|NOMBRE FICTICIO/);
 }
});
test("empty observations remain empty and do not show a false ABC notice",()=>{
 for(const observation of ["","  ",null,undefined]){
  const value=minimized(sourceOffer(observation),evaluation,pidInfo);
  assert.equal(value.observaciones,"");
  assert.equal(value.raw.observaciones,"");
  assert.equal(safeObservationNotice(observation),"");
 }
});
test("no nested PII, unusual keys, or objects escape the raw allowlist",()=>{
 const malicious=sourceOffer("Teléfono del docente");
 malicious.cargo={nested:"personal@example.com"};
 malicious.__protoSafe="SHOULD_NOT_EXPOSE";
 const result=minimized(malicious,evaluation,pidInfo);
 assert.ok(Object.keys(result.raw).every(k=>SAFE_RAW_FIELD_KEYS.includes(k)||k==="observaciones"));
 assert.equal(result.raw.__protoSafe,undefined);
 assert.equal(result.raw.cargo,undefined);
 assert.equal(result.raw.payload,undefined);
 assert.equal(result.raw.cuilautor,undefined);
 assert.equal(result.raw.reemp_cuil,undefined);
 assert.equal(result.raw.reemp_apeynom,undefined);
 assert.equal(result.raw.domiciliodesempeno,undefined);
 assert.equal(result.raw._version_,undefined);
 assert.doesNotMatch(JSON.stringify(result),/personal@example\.com|SHOULD_NOT_EXPOSE/);
});
test("default candidate is isolated from performance-only and published Worker",()=>{
 assert.ok(!original.includes("function apdMinimizedRawAlertOffer("));
 assert.ok(!performanceCandidate.includes("function apdMinimizedRawAlertOffer("));
 assert.ok(privateCandidate.includes("function apdMinimizedRawAlertOffer("));
 assert.ok(privateCandidate.includes("apdSafeObservationNotice(oferta.observaciones)"));
 assert.ok(privateCandidate.includes("raw: apdMinimizedRawAlertOffer(oferta)"));
 assert.equal(privateCandidate.includes("raw: oferta\n"),false);
});
test("current HTML dashboard sources don't directly depend on alert.raw",()=>{
 const html=readFileSync("index.html","utf8");
 const sources=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
   .map(m=>m[1].split(/[?#]/)[0]).filter(x=>!x.startsWith("http"));
 let inspected=0;
 for(const path of sources){
  const text=readFileSync(path,"utf8");
  inspected++;
  // Only an explicit alert.raw dependency is treated as blocker.
  const pattern=/\b(?:alerta|alert|a)\s*\.\s*raw\b/;
  assert.doesNotMatch(text,pattern,"Review consumer of raw in "+path);
 }
 assert.ok(inspected>=20,"Inspected too few frontend scripts");
});
