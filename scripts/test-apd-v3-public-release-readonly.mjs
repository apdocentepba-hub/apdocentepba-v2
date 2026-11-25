import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {checkHtml} from "./check-apd-v3-public-release-readonly.mjs";
const before=execFileSync("git",["show","origin/main:index.html"],{encoding:"utf8"});
const after=readFileSync("index.html","utf8");
test("anonymous source baseline recognizes whether V3 has already shipped",()=>{
 const v3AlreadyPresent=before.includes('public-landing-v3.css?v=20261103') &&
  before.includes('apd_panel_priority_v3.js?v=1');
 // V3 has already shipped. Only normalize the exact old app asset tag in
 // the historical main baseline; the candidate and live gate require NEW.
 const approvedApp='<script src="app_v2.js?v=20&rev=20261124-perfil"></script>';
 const knownOld=['20261102-unverified-plan','20261114-compact1'].map(rev=>'<script src="app_v2.js?v=20&rev='+rev+'"></script>');
 const recognized=[approvedApp,...knownOld].filter(tag=>before.includes(tag));
 assert.equal(recognized.length,1,"Baseline must carry one known canonical app source");
 const normalizedBefore=before.replace(recognized[0],approvedApp);
 const result=checkHtml(normalizedBefore,v3AlreadyPresent?"after":"before");
 assert.equal(result.new_asset_links,v3AlreadyPresent?2:0);
 assert.equal(result.forms_preserved,true);
});
test("proposed V3 release is public-site ready without changing old JS ordering",()=>{
 const result=checkHtml(after,"after");
 assert.equal(result.new_asset_links,2);
 assert.equal(result.legacy_scripts_preserved,true);
});
test("post-deploy gate detects missing priority JS, missing CSS or wrong radar version",()=>{
 assert.throws(()=>checkHtml(after.replace('<script src="apd_panel_priority_v3.js?v=1"></script>',""),"after"),
               /new v3 priority script/);
 assert.throws(()=>checkHtml(after.replace('<link rel="stylesheet" href="public-landing-v3.css?v=20261103" />',""),"after"),
               /new v3 CSS/);
 assert.throws(()=>checkHtml(after.replace('radar_provincia_live_20261102.js?v=2',
                                            'radar_provincia_live_20261102.js?v=1'),"after"),
               /radar script/);
});
test("pre-deploy baseline rejects a candidate accidentally published",()=>{
 assert.throws(()=>checkHtml(after,"before"),/already present/);
});

test("release rejects unapproved app version, duplicate runtime and reordered approved runtime",()=>{
 const approved='<script src="app_v2.js?v=20&rev=20261124-perfil"></script>';
 const tabs='<script src="panel_tabs_patch.js?v=finalvisual3"></script>';
 assert.throws(()=>checkHtml(after.replace(approved,approved.replace('20261124-perfil','unknown')),"after"),/app runtime script changed/);
 assert.throws(()=>checkHtml(after.replace(approved,approved+'<script src="./app_v2.js?v=other"></script>'),"after"),/duplicate app runtime/);
 assert.throws(()=>checkHtml(after.replace(approved,'').replace(tabs,tabs+approved),"after"),/legacy script ordering/);
});
