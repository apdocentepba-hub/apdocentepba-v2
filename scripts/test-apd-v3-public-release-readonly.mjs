import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {checkHtml} from "./check-apd-v3-public-release-readonly.mjs";
const before=execFileSync("git",["show","origin/main:index.html"],{encoding:"utf8"});
const after=readFileSync("index.html","utf8");
test("anonymous source baseline has current scripts but not V3 assets",()=>{
 const result=checkHtml(before,"before");
 assert.equal(result.new_asset_links,0);
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
