/* Builds a non-deployed Worker candidate. Flag OFF by default.
 * Never edits the live Worker or Supabase. Fail when canonical anchors change.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {pathToFileURL} from "node:url";
const changeOnce=(input,oldText,newText,label)=>{
 const found=input.split(oldText).length-1;
 if(found!==1)throw Error(label+": expected exactly once, found "+found);
 return input.replace(oldText,newText);
};
export function buildDistrictSourceAliasPreview(live,source){
 if(live.includes("APD_DISTRICT_SOURCE_ALIASES_ENABLED")||
    live.includes("apdSourceDistrictForCatalog("))throw Error("Alias preview already integrated");
 const hook=source.replace("export function apdSourceDistrictForCatalog(",
   "function apdSourceDistrictForCatalog(");
 if(hook===source)throw Error("Missing explicit alias function");
 let out=changeOnce(live,"var worker_hotfix_default = {",
   hook+"\nvar worker_hotfix_default = {","safe function location");
 out=changeOnce(out,
   "    const batchInfo = await fetchAPDDistrictBatch(\n      districtName,\n      nextPage,\n      PROVINCIA_STEP_PAGES,\n      PROVINCIA_CAPTURE_ROWS_PER_PAGE\n    );",
   "    const batchInfo = await fetchAPDDistrictBatch(\n      districtName,\n      nextPage,\n      PROVINCIA_STEP_PAGES,\n      PROVINCIA_CAPTURE_ROWS_PER_PAGE,\n      env?.APD_DISTRICT_SOURCE_ALIASES_ENABLED === \"true\"\n    );",
   "only ABC scan call");
 out=changeOnce(out,
   "async function fetchAPDDistrictBatch(distritoAPD, startPage, pagesToRead, rowsPerPage) {\n  const docs = [];",
   "async function fetchAPDDistrictBatch(distritoAPD, startPage, pagesToRead, rowsPerPage, aliasesEnabled = false) {\n  const docs = [];\n  const queryDistrict = aliasesEnabled ? apdSourceDistrictForCatalog(distritoAPD) : distritoAPD;",
   "source query per district");
 out=changeOnce(out,
   "const q = 'descdistrito:\"' + escaparSolr(distritoAPD) + '\" AND estado:\"Publicada\"';",
   "const q = 'descdistrito:\"' + escaparSolr(queryDistrict) + '\" AND estado:\"Publicada\"';",
   "only source Solr query");
 out=changeOnce(out,
   'norm(doc?.descdistrito || "") === norm(distritoAPD) && estadoOfertaEsPublicada(doc)',
   'norm(doc?.descdistrito || "") === norm(queryDistrict) && estadoOfertaEsPublicada(doc)',
   "canonical source filter");
 out=changeOnce(out,
   'const shapedRows = batchInfo.docs.map((doc) => buildGlobalSnapshotRow(doc, capturedAt));',
   'const shapedRows = batchInfo.docs.map((doc) => buildGlobalSnapshotRow(doc, capturedAt,\n      env?.APD_DISTRICT_SOURCE_ALIASES_ENABLED === "true" ? districtName : null));',
   "canonical district for preferences and pruning");
 out=changeOnce(out,
   "function buildGlobalSnapshotRow(oferta, capturedAt) {",
   "function buildGlobalSnapshotRow(oferta, capturedAt, canonicalDistrict = null) {",
   "snapshot function");
 const snapshotStart=out.indexOf("function buildGlobalSnapshotRow(");
 const snapshotEnd=out.indexOf("\n__name(buildGlobalSnapshotRow",snapshotStart);
 if(snapshotStart<0||snapshotEnd<0)throw Error("Snapshot function boundaries changed");
 const snapshotBody=out.slice(snapshotStart,snapshotEnd);
 const patchedSnapshot=changeOnce(snapshotBody,
   'distrito: norm(oferta.descdistrito || ""),',
   'distrito: canonicalDistrict ? norm(canonicalDistrict) : norm(oferta.descdistrito || ""),',
   "district database storage inside snapshot function");
 out=out.slice(0,snapshotStart)+patchedSnapshot+out.slice(snapshotEnd);
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const out=resolve(process.argv[2]||"tmp/apd-scanner-alias-preview/worker-preview.mjs");
 if(!out.includes("apd-scanner-alias-preview"))throw Error("Refusing production overwrite");
 const compiled=buildDistrictSourceAliasPreview(
   readFileSync("worker-live/worker_hotfix.js","utf8"),
   readFileSync("worker-live/apd_scanner_source_district_alias_candidate.mjs","utf8"));
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,compiled,"utf8");
 console.log("Candidate Worker built, NOT deployed: "+out);
}
