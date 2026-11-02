/* Read-only verification of the HTML and public radar asset actually served online.
 * Does not use secrets, authenticate, modify or deploy anything.
 */
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";

const SITE="https://alertasapd.com.ar/";
const LEGACY="radar_provincia_patch_semaforo.js?v=2";
const CANDIDATE="candidates/radar_provincia_live_20261102.js?v=2";
const PREVIOUS_CANDIDATE="candidates/radar_provincia_live_20261102.js?v=1";
const htmlRepo=readFileSync("index.html","utf8");
const candidateSource=readFileSync("candidates/radar_provincia_live_20261102.js","utf8");
function sha(text){return createHash("sha256").update(text).digest("hex");}
async function get(url){
 const ctrl=new AbortController();
 const handle=setTimeout(()=>ctrl.abort(),15000);
 try {
  const response=await fetch(url,{method:"GET",cache:"no-store",
   credentials:"omit",redirect:"follow",signal:ctrl.signal});
  assert.equal(response.status,200,"HTTP error fetching "+url+" ("+response.status+")");
  assert.ok(new URL(response.url).hostname==="alertasapd.com.ar","Unexpected site redirect");
  return await response.text();
 } finally {clearTimeout(handle);}
}
const deployed=await get(SITE+"?apd_radaraudit="+Date.now());
const scripts=[...deployed.matchAll(/<script\s+[^>]*src=["']([^"']+)["']/g)].map(x=>x[1]);
const oldScripts=scripts.filter(x=>x===LEGACY);
const newScripts=scripts.filter(x=>x===CANDIDATE || x===PREVIOUS_CANDIDATE);
assert.equal(oldScripts.length+newScripts.length,1,"Public site must load precisely one provincial radar");
const current= newScripts.length===1 ? "candidate" : "legacy";
const sourceName=current==="candidate" ? newScripts[0] : LEGACY;
const assetUrl=new URL(sourceName.split("?")[0],SITE);
assetUrl.searchParams.set("apd_radar_asset_audit",String(Date.now()));
const source=await get(assetUrl.href);
const expected=current==="candidate" ? candidateSource
 : readFileSync("radar_provincia_patch_semaforo.js","utf8");
const output={
 site:SITE,
 published_radar:current,
 production_source_sha256:sha(source),
 current_repo_source_sha256:sha(expected),
 published_script_matches_repository:sha(source)===sha(expected),
 published_index_matches_main_radar_tag:htmlRepo.includes('<script src="'+sourceName+'"></script>'),
 no_duplicate_script:true
};
console.log(JSON.stringify(output,null,2));
assert.equal(output.published_script_matches_repository,true,
 "Public radar asset differs from repository — investigate before deploy");
if(current==="candidate"){
  assert.match(source,/Publicadas capturadas/,"Public radar must distinguish captured from live offers");
  assert.match(source,/NO es el total de ofertas publicadas actualmente en ABC/,
    "Public radar must carry a visible ABC freshness disclaimer");
  assert.match(source,/Revisar última captura/,"Refresh label must not imply a new ABC scan");
  assert.doesNotMatch(source,/SNAPSHOT\s*=/,"Live radar must not contain frozen metrics");
  console.log("Verified live radar text: captured offers only, official ABC disclaimer, no stale snapshot");
}

if(current==="legacy")console.log("::notice::Public web is still on the old static radar; release preview not deployed.");
