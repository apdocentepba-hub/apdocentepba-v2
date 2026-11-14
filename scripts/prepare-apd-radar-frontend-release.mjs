/* Builds LOCAL release and rollback candidates. Does not change index.html or deploy.
 * Only difference allowed: one radar script reference. No access to user data.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

export const OLD_TAG='<script src="radar_provincia_patch_semaforo.js?v=2"></script>';
export const NEW_TAG='<script src="candidates/radar_provincia_live_20261102.js?v=1"></script>';
export function checksum(source){return createHash("sha256").update(source).digest("hex");}
function once(s,needle,label){
  const n=s.split(needle).length-1;
  if(n!==1)throw Error(label+": expected one occurrence, found "+n);
}
export function buildRadarFrontendRelease(originalHtml,oldJs,newJs){
  once(originalHtml,OLD_TAG,"Current radar script");
  if(originalHtml.includes(NEW_TAG))throw Error("Already enabled");
  const appTag='<script src="app_v2.js?v=20&rev=20261114-compact1"></script>';
  once(originalHtml,appTag,"Canonical dashboard API source");
  if(originalHtml.indexOf(appTag)>originalHtml.indexOf(OLD_TAG)){
    throw Error("Dashboard API must be loaded before radar");
  }
  if(!/\/api\/provincia\/backfill-status/.test(newJs))throw Error("New radar lacks verified status endpoint");
  if(!/credentials: "omit"/.test(newJs) || !/method: "GET"/.test(newJs))throw Error("Radar must use anonymous GET only");
  if(!/SNAPSHOT\s*=/.test(oldJs))throw Error("Original radar fingerprint changed");
  const releaseHtml=originalHtml.replace(OLD_TAG,NEW_TAG);
  once(releaseHtml,NEW_TAG,"New radar reference");
  if(releaseHtml.replace(NEW_TAG,OLD_TAG)!==originalHtml)throw Error("Unexpected HTML modifications");
  return {
    releaseHtml,rollbackHtml:originalHtml,
    manifest:{
      project:"APDocentePBA",action:"preview_only",live_deployment:false,
      changed_paths_if_approved:["index.html"],
      old_tag:OLD_TAG,new_tag:NEW_TAG,
      initial_html_sha256:checksum(originalHtml),
      candidate_html_sha256:checksum(releaseHtml),
      rollback_html_sha256:checksum(originalHtml),
      original_radar_sha256:checksum(oldJs),
      candidate_radar_sha256:checksum(newJs),
      conditions:[
        "Browser mobile and admin/student session smoke before publishing",
        "Public API /api/provincia/backfill-status must return real counts",
        "No Worker/Supabase migration performed by this script",
        "Restore rollback index.html if the radar fails after authorized release"
      ]
    }
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const source=readFileSync("index.html","utf8");
  const old=readFileSync("radar_provincia_patch_semaforo.js","utf8");
  const newer=readFileSync("candidates/radar_provincia_live_20261102.js","utf8");
  const out=resolve(process.argv[2]||"tmp/apd-radar-release-candidate");
  const inRepo=resolve("index.html");
  if(out===dirname(inRepo)||out===inRepo||!out.includes("apd-radar-release-candidate")) {
    throw Error("Refusing to write over the production site");
  }
  const result=buildRadarFrontendRelease(source,old,newer);
  mkdirSync(out,{recursive:true});
  writeFileSync(resolve(out,"index-preview.html"),result.releaseHtml);
  writeFileSync(resolve(out,"index-rollback.html"),result.rollbackHtml);
  writeFileSync(resolve(out,"release-manifest.json"),JSON.stringify(result.manifest,null,2)+"\n");
  console.log("Release and rollback previews generated without touching index.html: "+out);
}
