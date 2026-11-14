import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";

const source = readFileSync("index.html","utf8");
const candidate = readFileSync("candidates/radar_provincia_live_20261102.js","utf8");
const prior = execFileSync("git",["show","origin/main:index.html"],{encoding:"utf8"});
const OLD='<script src="candidates/radar_provincia_live_20261102.js?v=1"></script>';
const NEW='<script src="candidates/radar_provincia_live_20261102.js?v=2"></script>';
const url="https://alertasapd.com.ar/candidates/radar_provincia_live_20261102.js";
const hash=x=>createHash("sha256").update(x).digest("hex");

function scriptReferences(html){
 return [...html.matchAll(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*><\/script>/gi)]
   .map(match=>match[0]);
}
function radarCard(html){
 const marker='<span class="card-lbl">📍 Radar provincial</span>';
 const i=html.indexOf(marker);
 assert.ok(i>=0,"Radar heading missing");
 const begin=html.lastIndexOf('<div class="panel-card span-12">',i);
 const next=html.indexOf('<div class="panel-card span-12" id="panel-listados-pid-card"',i);
 assert.ok(begin>=0&&next>i,"Radar card bounds missing");
 return html.slice(begin,next);
}
function assertExistingRadarUnchanged(oldHtml,newHtml){
 const oldScripts=scriptReferences(oldHtml);
 const added='<script src="apd_panel_priority_v3.js?v=1"></script>';
 const proposed=scriptReferences(newHtml);
 const count=proposed.filter(tag=>tag===added).length;
 assert.ok(count<=1,"Only one approved first-alert UI script is allowed");
 // An exact visual release is allowed to bump ONLY the already audited
 // app_v2.js URL. The actual JS is separately audited by PR #290.
 // Do not allow any change to other script URLs, membership or order.
 const oldApp='<script src="app_v2.js?v=20&rev=20261102-unverified-plan"></script>';
 const newApp='<script src="app_v2.js?v=20&rev=20261114-compact1"></script>';
 const approvedTransition=oldScripts.includes(oldApp)&&proposed.includes(newApp);
 if(approvedTransition)
  assert.equal(proposed.filter(tag=>tag===newApp).length,1,"Exactly one approved visual release");
 const expected=oldScripts.map(tag=>approvedTransition&&tag===oldApp?newApp:tag);
 assert.deepEqual(proposed.filter(tag=>tag!==added),expected.filter(tag=>tag!==added),
   "A non-radar change must not alter any already loaded script tags/order");
 if(count===1){
  assert.ok(newHtml.indexOf(added)>newHtml.indexOf('<script src="apd_ui_v21.js?v=20261102-clean"></script>'),
   "First-alert UI script must load after existing panel scripts");
  assert.match(newHtml,/id="panel-alertas"/);
 }
 assert.equal(radarCard(newHtml),radarCard(oldHtml),
   "A non-radar change must not alter the existing provincial radar card");
}
test("radar release transition OR unchanged already-live radar on public redesign",()=>{
 const oldCount=prior.split(OLD).length-1;
 const newCount=prior.split(NEW).length-1;
 assert.equal(oldCount+newCount,1,
  "Main must contain exactly one known radar version");
 if(oldCount===1){
  // Strict one-line migration contract. Do not loosen the actual radar rollout.
  assert.equal(newCount,0,"Prior radar must be v1 on legacy-to-v2 release");
  assert.equal(source,prior.replace(OLD,NEW),
   "Radar release may modify only the one versioned script reference");
 }else{
  // v2 is already live. The visual/login PR must leave radar and script order
  // unchanged; don't require a historical v1 tag that main no longer has.
  assert.equal(oldCount,0);
  assertExistingRadarUnchanged(prior,source);
 }
 assert.equal(source.split(NEW).length-1,1,"Exactly one v2 radar script required");
 assert.equal(source.split(OLD).length-1,0,"Legacy radar script must not load");
 assert.ok(source.indexOf("app_v2.js?v=20&rev=20261114-compact1")<
   source.indexOf(NEW),"Canonical API must load before radar");
 assert.equal(source.split('id="panel-radar-provincia"').length-1,1);
 assert.equal(source.split('id="btn-refresh-provincia"').length-1,1);
});
test("a visual redesign cannot change radar code, script order or radar card",()=>{
 if(prior.includes(NEW)){
  assertExistingRadarUnchanged(prior,source);
  assert.throws(()=>assertExistingRadarUnchanged(prior,source.replace(NEW,OLD)),
   /script tags\/order/);
  assert.throws(()=>assertExistingRadarUnchanged(prior,
   source.replace("Refrescar radar</button>","Reemplazar radar</button>")),
   /radar card/);
  assert.throws(()=>assertExistingRadarUnchanged(prior,
   source.replace('auth_session_patch.js?v=3','auth_session_patch.js?v=4')),
   /script tags\/order/);

 }
});
test("new radar uses the existing panel and anonymous, read-only scan-state API",()=>{
 assert.match(candidate,/const nativeRadar = byId\("panel-radar-provincia"\)/);
 assert.match(candidate,/const nativeButton = byId\("btn-refresh-provincia"\)/);
 assert.match(candidate,/\/api\/provincia\/backfill-status/);
 assert.match(candidate,/method: "GET"/);
 assert.match(candidate,/credentials: "omit"/);
 assert.match(candidate,/cache: "no-store"/);
 assert.doesNotMatch(candidate,/SNAPSHOT\s*=/);
 assert.doesNotMatch(candidate,/supabase\.co\/rest\/v1/);
});
test("public candidate JavaScript asset is available before changing the homepage",async()=>{
 const ctrl=new AbortController();
 const deadline=setTimeout(()=>ctrl.abort(),15000);
 try{
  const response=await fetch(url,{signal:ctrl.signal,redirect:"follow",cache:"no-store"});
  assert.equal(response.status,200,"Candidate must be served by GitHub Pages before release");
  assert.equal(new URL(response.url).host,"alertasapd.com.ar","Unexpected redirect");
  const publicScript=await response.text();
  assert.equal(hash(publicScript),hash(candidate),"Public script must match repository candidate");
  console.log("Candidate asset verified publicly, SHA-256:",hash(publicScript));
 } finally {clearTimeout(deadline);}
});
