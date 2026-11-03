/* Contract parity of the actual canonical Worker business functions.
 * Complete ABC documents vs the 29-field public Published-only projection.
 * ALL records, preferences and PID rows are FICTITIOUS. No HTTP, secrets,
 * personal identities, Supabase writes, or production worker modifications.
 * Note: raw is INTENTIONALLY different to discard unnecessary personal fields.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PUBLIC_ALERT_FIELDS} from "./apd-abc-published-projected-cursor-readonly.mjs";

const worker=readFileSync("worker-live/worker_hotfix.js","utf8");
const names=[
 "norm","unique","normDistritoABC","resolveOfferDistrict",
 "distritosPrefsAPD","matchDistritos","extraerSigla",
 "normalizarTextoSimple","matchCargosMaterias","turnosPrefs",
 "categoriasNivel","matchNivelModalidad","mapTurnoAPD","matchTurno",
 "coincideOfertaConPreferenciasAPD","normalizePidAreaCode",
 "normalizePidAreaLabel","parsePidPuntaje","normalizePidRows",
 "extractOfertaAreaIdentity","isPidAreaCompatible",
 "categoriasPidBloque","categoriasOfertaParaPid","setsIntersect",
 "isPidBlockCompatibleWithOferta","normalizeDistrictText",
 "addDistrictVariant","buildDistrictVariants",
 "extractCatalogDistrictNames","buildDistrictIndex",
 "resolveDistrictAgainstCatalog","extractPidRequestedDistricts",
 "resolveOfertaDistrict","evaluatePidCompatibility",
 "sanitizeSolrNumber","sanitizeKeyText","buildSourceOfferKeyFromOferta",
 "normalizarCursoDivisionServidor","parsePartesFechaAbc",
 "formatearFechaAbc","formatearDiasHorariosOferta",
 "resolverTipoRevistaOferta","buildAbcPostulantesUrl",
 "buildAlertItem","estadoOfertaEsPublicada","ofertaEsVisibleParaAlerta"
];
function originalFunction(name){
 const start=worker.indexOf("function "+name+"(");
 assert.ok(start>=0,"Missing canonical Worker definition: "+name);
 const end=worker.indexOf("\n__name("+name+",",start);
 assert.ok(end>start,"Missing canonical Worker function marker: "+name);
 return worker.slice(start,end);
}
const script=names.map(originalFunction).join("\n")+"\nreturn {"+
 names.join(",")+"};";
const canonical=new Function("__name","__name2","__name22",
 "__name222","__name2222","__name22222",script)(
 ...Array.from({length:6},()=>()=>{})
);
function baseOffer({
 id=101, district="AVELLANEDA", code="PRE", cargo="PRECEPTOR",
 nivel="SECUNDARIA", turno="M",status="Publicada"
}={}){
 return {
  id:"SOLR_FAKE_"+id,iddetalle:String(id),idoferta:String(id+10000),
  descdistrito:district,estado:status,
  escuela:"ESCUELA FICTICIA",descripcioncargo:cargo+" ("+code+")",
  cargo:cargo+" ("+code+")",
  descripcionarea:cargo+" ("+code+")",
  descnivelmodalidad:nivel,nivelmodalidad:nivel,turno,
  jornada:"SIMPLE",hsmodulos:"2",cursodivision:"1° 1°",
  supl_desde:"2026-11-01",supl_hasta:"2026-11-30",
  finoferta:"2026-11-30T22:00:00",ult_movimiento:"2026-11-02T12:00:00",
  supl_revista:"S",lunes:"08:00-10:00",martes:"08:00-10:00",
  observaciones:"Sin datos personales. Solo pruebas.",
  tipooferta:"CARGO",iniciooferta:"2026-11-01",
  // Simulate sensitive and unnecessary full Solr fields excluded by projection.
  cuilautor:"SENSITIVE_FAKE_ONLY",reemp_cuil:"SENSITIVE_FAKE_ONLY",
  reemp_apeynom:"SENSITIVE_FAKE_ONLY",
  domiciliodesempeno:"SENSITIVE_FAKE_ONLY",
  areaincumbencia:"SENSITIVE_FAKE_ONLY",
  _version_:12345
 };
}
const project=row=>Object.fromEntries(Object.entries(row)
 .filter(([key])=>PUBLIC_ALERT_FIELDS.includes(key)));
function prefs({districts=["AVELLANEDA"],cargos=["PRECEPTOR (PRE)"],
 niveles=["SECUNDARIA"],turnos=["MANANA"]}={}){
 return {distrito_principal_apd:districts[0],otros_distritos_apd:districts.slice(1),
  cargos_apd:cargos,niveles,turnos};
}
function pid({requested="AVELLANEDA;LA MATANZA",residence="AVELLANEDA",
 area="PRECEPTOR (PRE)",bloque="SECUNDARIA",score="69,50"}={}){
 return {result:{
  distritos_solicitados:requested,distrito_residencia:residence,
  listado:"108 B",anio:"2026",table_rows:[{
   area,bloque,puntaje_total:score
  }]
 }};
}
const catalogos={distritos:[
 {nombre:"AVELLANEDA"},{nombre:"LA MATANZA"},{nombre:"QUILMES"}
]};
function matchAndBuild(doc,preferences,pidData){
 const evaluated=canonical.coincideOfertaConPreferenciasAPD(doc,preferences);
 const rows=canonical.normalizePidRows(pidData);
 const evaluatedPid=canonical.evaluatePidCompatibility(doc,pidData,rows,
  canonical.buildDistrictIndex(catalogos));
 const meta=pidData?.result ? {listado:pidData.result.listado,anio:pidData.result.anio} : null;
 const item=canonical.buildAlertItem(doc,evaluated,{...evaluatedPid,meta});
 return {
  visible:canonical.ofertaEsVisibleParaAlerta(doc),
  published:canonical.estadoOfertaEsPublicada(doc),
  evaluation:evaluated,pid:evaluatedPid,
  item:{...item,raw:undefined}
 };
}
const scenarios=[
 ["compatible with PID and residence bonus",baseOffer(),prefs(),pid()],
 ["missing PID",baseOffer(),prefs(),null],
 ["wrong district preferences",baseOffer(),prefs({districts:["LA MATANZA"]}),pid()],
 ["wrong cargo",baseOffer(),prefs({cargos:["MAESTRO (MG)"]}),pid()],
 ["wrong modality",baseOffer(),prefs({niveles:["PRIMARIA"]}),pid()],
 ["wrong shift",baseOffer(),prefs({turnos:["NOCHE"]}),pid()],
 ["no PID requested in offer district",baseOffer(),prefs(),pid({requested:"LA MATANZA"})],
 ["same area with incompatible PID block",baseOffer(),prefs(),pid({bloque:"PRIMARIA"})],
 ["correct item without residence bonus",baseOffer({district:"LA MATANZA"}),prefs({districts:["LA MATANZA"]}),pid()],
 ["different level and afternoon",baseOffer({nivel:"TECNICO PROFESIONAL",turno:"T"}),prefs({niveles:["TECNICO PROFESIONAL"],turnos:["TARDE"]}),pid({bloque:"TECNICO PROFESIONAL"})],
 ["not published state",baseOffer({status:"Cerrada"}),prefs(),pid()],
 ["source published but no configured cargo filter",baseOffer({code:"MG",cargo:"MAESTRO"}),prefs({cargos:[]}),pid({area:"MAESTRO (MG)"})]
];
for(const [title,complete,preferences,pidData] of scenarios){
 test("canonical filtering and PID parity: "+title,()=>{
  const before=matchAndBuild(complete,preferences,pidData);
  const projected=project(complete);
  const after=matchAndBuild(projected,preferences,pidData);
  assert.deepEqual(after,before);
  assert.equal(after.item.source_offer_key,canonical.buildSourceOfferKeyFromOferta(complete));
  assert.ok(Object.keys(projected).every(x=>PUBLIC_ALERT_FIELDS.includes(x)));
  assert.equal(projected.cuilautor,undefined);
  assert.equal(projected.reemp_cuil,undefined);
  assert.equal(projected.reemp_apeynom,undefined);
  // The canonical Worker currently returns raw: oferta. The new projection
  // would shrink it, so only core client-visible computed fields are equal.
  const rawItem=canonical.buildAlertItem(complete,before.evaluation,{...before.pid});
  assert.ok("cuilautor" in rawItem.raw,"Baseline includes source sensitive fields");
  const projectedItem=canonical.buildAlertItem(projected,after.evaluation,{...after.pid});
  assert.ok(!("cuilautor" in projectedItem.raw),"Projected raw excludes CUIL");
 });
}
test("negative control: missing cargo/area field must break functional parity",()=>{
 const full=baseOffer();
 const projected=project(full);
 delete projected.descripcioncargo;
 delete projected.cargo;
 delete projected.descripcionarea;
 const a=matchAndBuild(full,prefs(),pid());
 const b=matchAndBuild(projected,prefs(),pid());
 assert.notDeepEqual(a,b,"Parity test must detect omitted role/area fields");
});
test("negative control: missing level must break PID block or preference matching",()=>{
 const full=baseOffer();
 const projected=project(full);
 delete projected.descnivelmodalidad;delete projected.nivelmodalidad;
 const a=matchAndBuild(full,prefs(),pid());
 const b=matchAndBuild(projected,prefs(),pid());
 assert.notDeepEqual(a,b);
});
test("negative control: missing turno must not pass preference matching",()=>{
 const full=baseOffer();const projected=project(full);
 delete projected.turno;
 assert.notDeepEqual(matchAndBuild(full,prefs(),pid()),matchAndBuild(projected,prefs(),pid()));
});
test("canary: no personal Solr fields may be in the selection allowlist",()=>{
 for(const k of ["cuilautor","reemp_cuil","reemp_apeynom",
  "domiciliodesempeno","_version_","idsuna"])
  assert.ok(!PUBLIC_ALERT_FIELDS.includes(k),"Unexpected private Solr field "+k);
});
console.log("APD_PROJECTED_ALERT_PID_PARITY_OFFLINE: fictitious full/projection canonical equality, raw privacy intentionally distinct");
