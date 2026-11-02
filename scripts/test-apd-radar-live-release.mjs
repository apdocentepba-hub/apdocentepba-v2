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

test("release modifies one and only one frontend script reference",()=>{
 assert.equal(prior.split(OLD).length-1,1,"main must have one old radar script");
 assert.equal(prior.split(NEW).length-1,0,"main must not already use the candidate");
 assert.equal(source,prior.replace(OLD,NEW),"Unexpected production HTML change");
 assert.equal(source.split(NEW).length-1,1,"Exactly one new radar script required");
 assert.equal(source.split(OLD).length-1,0,"Legacy banner script must not load");
 assert.ok(source.indexOf("app_v2.js?v=20&rev=20261102-unverified-plan")<
   source.indexOf(NEW),"Canonical API URL must load before live radar");
 assert.equal(source.split('id="panel-radar-provincia"').length-1,1);
 assert.equal(source.split('id="btn-refresh-provincia"').length-1,1);
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
