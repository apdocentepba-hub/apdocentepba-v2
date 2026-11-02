/* One-time read-only audit: apply EXACT Worker expiry filter to public offer projections.
 * Six requests, rows max 300; fields descdistrito/estado/finoferta/fecha_cierre.
 * Do not persist or print individual offers, identifiers, or personal data.
 */
import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import vm from "node:vm";
import {apdSourceDistrictForCatalog} from "../worker-live/apd_scanner_source_district_alias_candidate.mjs";
const SOURCE=readFileSync("worker-live/worker_hotfix.js","utf8");
const snip=(begin,end)=>{
 const start=SOURCE.indexOf(begin),stop=SOURCE.indexOf(end,start);
 assert.ok(start>=0&&stop>start,"Canonical Worker expiry function not found: "+begin);
 return SOURCE.slice(start,stop);
};
const ctx=vm.createContext({Date,Math});
vm.runInContext([
 snip("function norm2(","\n__name(norm2"),
 snip("function parseFechaFlexible2(","\n__name(parseFechaFlexible2"),
 snip("function ofertaVigente(","\n__name(ofertaVigente")
].join("\n"),ctx,{timeout:1000});
assert.equal(typeof ctx.ofertaVigente,"function");
const names=["MATANZA","LAS HERAS","NUEVE DE JULIO","GENERAL LAMADRID","HIPOLITO YRIGOYEN","JUAREZ"];
const normal=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();
const results=[];
for(const catalogName of names){
 const officialName=apdSourceDistrictForCatalog(catalogName);
 const u=new URL("https://servicios3.abc.gob.ar/valoracion.docente/api/apd.oferta.encabezado/select");
 u.searchParams.set("q",'descdistrito:"'+officialName+'" AND estado:"Publicada"');
 u.searchParams.set("rows","300");
 u.searchParams.set("start","0");
 u.searchParams.set("wt","json");
 u.searchParams.set("fl","descdistrito,estado,finoferta,fecha_cierre");
 const controller=new AbortController();
 const t=setTimeout(()=>controller.abort(),18000);
 let json;
 try{
  const res=await fetch(u,{method:"GET",redirect:"error",credentials:"omit",cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}});
  assert.equal(res.status,200,"ABC HTTP "+res.status);
  const raw=new TextDecoder("iso-8859-1").decode(await res.arrayBuffer());
  assert.ok(raw.length<1000000,"ABC public projected response unexpectedly large");
  json=JSON.parse(raw);
 }finally{clearTimeout(t);}
 const count=json?.response?.numFound,docs=json?.response?.docs;
 assert.ok(Number.isSafeInteger(count)&&count>=0&&count<=300,"Partial/invalid public source count");
 assert.ok(Array.isArray(docs)&&docs.length===count,"Results truncated; decline misleading statistics");
 let candidate=0,rejected=0,missingDate=0,nonparsedDate=0;
 for(const doc of docs){
  assert.equal(normal(doc.descdistrito),normal(officialName),"Wrong district in ABC source");
  assert.equal(normal(doc.estado),"PUBLICADA","Wrong ABC state");
  const rawDate=doc.finoferta||doc.fecha_cierre||"";
  if(!rawDate)missingDate++;
  else if(ctx.parseFechaFlexible2(rawDate)===null)nonparsedDate++;
  if(ctx.ofertaVigente(doc))candidate++;else rejected++;
 }
 results.push({district:catalogName,source_name:officialName,
  index_publicadas:count,scanner_vigente_filter_pass: candidate,
  scanner_vigente_filter_reject:rejected,without_expiry_field:missingDate,
  unparsed_expiry_field:nonparsedDate,observed_at_utc:new Date().toISOString()});
}
const sum=k=>results.reduce((n,x)=>n+x[k],0);
const report={schema_version:1,source:"ABC public projected documents",captured_at_utc:new Date().toISOString(),
  requests_sent:6,documents_stored_or_logged:0,fields_requested:["descdistrito","estado","finoferta","fecha_cierre"],
  uses_exact_current_worker_expiry_filter:true,
  indexed_publicadas:sum("index_publicadas"),
  scanner_filter_pass_before_dedup:sum("scanner_vigente_filter_pass"),
  scanner_filter_reject:sum("scanner_vigente_filter_reject"),
  without_expiry_field:sum("without_expiry_field"),
  unparsed_expiry_field:sum("unparsed_expiry_field"),
  caveat:"Does not confirm deduplication, captured jobs, user compatibility or submission status. No individual data retained.",
  districts:results};
const out=resolve("tmp/apd-scanner-expiration-audit/report.json");
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
