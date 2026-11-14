/* APDocentePBA V3 — post-deploy read-only smoke.
 * Checks ONLY anonymous public static resources. No login, Worker API, cookies,
 * contact with users, DB, tokens, or write operations. Use after approved merge.
 * Node 22+: node scripts/check-apd-v3-public-release-readonly.mjs --expect=after
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const ORIGIN="https://alertasapd.com.ar";
const TAG_CSS='<link rel="stylesheet" href="public-landing-v3.css?v=20261103" />';
const TAG_JS='<script src="apd_panel_priority_v3.js?v=1"></script>';
const RADAR='<script src="candidates/radar_provincia_live_20261102.js?v=2"></script>';
const APP='<script src="app_v2.js?v=20&rev=20261114-compact1"></script>';
const TABS='<script src="panel_tabs_patch.js?v=finalvisual2"></script>';
const UI='<script src="apd_ui_v21.js?v=20261102-clean"></script>';
const SHA=value=>createHash("sha256").update(value).digest("hex");
const count=(s,part)=>s.split(part).length-1;

export function checkHtml(text,expected){
 assert.ok(expected==="before"||expected==="after","expected before/after only");
 assert.match(text,/<html\b/i);
 assert.equal(count(text,RADAR),1,"existing radar script changed");
 for(const id of ["form-login","form-registro","panel-alertas","panel-docente",
                    "google-btn-login","google-btn-registro"]){
  assert.equal(count(text,'id="'+id+'"'),1,"missing or duplicate: "+id);
 }
 assert.equal(count(text,APP),1,"app runtime script changed");
 assert.equal(count(text,TABS),1,"tabs script changed");
 assert.equal(count(text,UI),1,"v2.1 UI script changed");
 assert.ok(text.indexOf(APP)<text.indexOf(TABS) &&
           text.indexOf(TABS)<text.indexOf(UI),"legacy script ordering changed");
 if(expected==="after"){
  assert.equal(count(text,TAG_CSS),1,"new v3 CSS absent or duplicated");
  assert.equal(count(text,TAG_JS),1,"new v3 priority script absent or duplicated");
  assert.ok(text.indexOf(UI)<text.indexOf(TAG_JS),"priority loaded before tab scripts");
  assert.match(text,/id="apd-public-title"/,"new V3 home not present");
  assert.match(text,/class="section hidden apd-auth-v3"/,"new V3 login not present");
 }else{
  assert.equal(count(text,TAG_CSS),0,"V3 CSS already present");
  assert.equal(count(text,TAG_JS),0,"V3 priority already present");
 }
 return {expected,radar:1,forms_preserved:true,legacy_scripts_preserved:true,
         new_asset_links:expected==="after"?2:0};
}
async function getPublic(path,maxBytes){
 const url=new URL(path,ORIGIN);
 assert.equal(url.origin,ORIGIN);
 const resp=await fetch(url,{
  method:"GET",redirect:"error",cache:"no-store",credentials:"omit",
  headers:{Accept:"text/html, text/css, text/javascript"},
  signal:AbortSignal.timeout(15000)
 });
 assert.equal(resp.status,200,"Unexpected HTTP status for "+url.pathname);
 assert.equal(new URL(resp.url).origin,ORIGIN,"Unexpected response origin");
 const bytes=Buffer.from(await resp.arrayBuffer());
 assert.ok(bytes.length>0&&bytes.length<=maxBytes,"Unexpected public asset size: "+url.pathname);
 return bytes.toString("utf8");
}
export async function checkPublic(expected){
 const html=await getPublic("/",256*1024);
 const info=checkHtml(html,expected);
 if(expected==="after"){
  for(const [asset,publicPath] of [
   ["public-landing-v3.css","/public-landing-v3.css?v=20261103"],
   ["apd_panel_priority_v3.js","/apd_panel_priority_v3.js?v=1"]
  ]){
   const actual=await getPublic(publicPath,128*1024);
   const local=readFileSync(asset,"utf8");
   assert.equal(SHA(actual),SHA(local),"Live public asset differs from tested source: "+asset);
  }
 }
 return {...info,source_hashes_verified:expected==="after",
         user_sessions_accessed:false,production_mutation:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const value=process.argv.find(v=>v.startsWith("--expect="))?.slice(9);
 if(value!=="before"&&value!=="after")
  throw Error("Specify --expect=before or --expect=after");
 checkPublic(value).then(info=>{
  console.log("APD_PUBLIC_READONLY_CHECK_PASS "+JSON.stringify(info));
 }).catch(error=>{
  console.error("APD_PUBLIC_READONLY_CHECK_FAIL "+error.message);
  process.exitCode=1;
 });
}
