import test from "node:test";
import assert from "node:assert/strict";
import {auditRadarReleaseHtml} from "./apd-radar-release-guard.mjs";
const page=(version=2,extra="")=>`<!doctype html><html><head></head><body>
<div id="panel-radar-provincia"></div><button id="btn-refresh-provincia"></button>
<script src="app_v2.js?v=20&rev=20261102-unverified-plan"></script>
<script src="candidates/radar_provincia_live_20261102.js?v=${version}"></script>
${extra}
</body></html>`;
const original=page(2);
test("current main with radar v2 accepts unrelated login/page redesign, not a fake v1-to-v2 release",()=>{
 const changed=page(2,'<section id="login">nuevo diseño</section>');
 const result=auditRadarReleaseHtml(original,changed);
 assert.deepEqual(result,{mode:"existing-radar-preserved",version:2,needsLiveAssetProof:false});
});
test("a genuine isolated consecutive script version bump remains gated",()=>{
 const r=auditRadarReleaseHtml(original,page(3));
 assert.deepEqual(r,{mode:"isolated-radar-release",fromVersion:2,
  version:3,needsLiveAssetProof:true});
});
test("legacy v1 to v2 isolated release remains recognized for old environments",()=>{
 const result=auditRadarReleaseHtml(page(1),page(2));
 assert.equal(result.mode,"isolated-radar-release");
 assert.equal(result.needsLiveAssetProof,true);
});
test("version skip, downgrade, duplicate or missing radar scripts are rejected",()=>{
 const candidates=[page(4),page(1),page(2).replace("v=2","v=3")+
  '<script src="candidates/radar_provincia_live_20261102.js?v=3"></script>',
 page(2).replace('<script src="candidates/radar_provincia_live_20261102.js?v=2"></script>','')];
 for(const item of candidates)
  assert.throws(()=>auditRadarReleaseHtml(original,item),/Radar release guard/);
});
test("can't combine radar release with unrelated homepage edits in the same PR",()=>{
 assert.throws(()=>auditRadarReleaseHtml(original,page(3,'<h1>new login</h1>')),
  /must change only one script tag/);
});
test("radar release never permits removing the original panel or loading before app",()=>{
 const noPanel=page(2).replace('id="panel-radar-provincia"','id="fake-panel"');
 assert.throws(()=>auditRadarReleaseHtml(original,noPanel),/native radar panel controls/);
 const badOrder=page(2).replace(
  '<script src="app_v2.js?v=20&rev=20261102-unverified-plan"></script>','');
 assert.throws(()=>auditRadarReleaseHtml(original,badOrder),/script must load before radar/);
});
test("noncanonical second radar script and fragment injection rejected",()=>{
 const injected=page(2,'<script src="candidates/radar_provincia_live_20261102.js?v=999"></script>');
 assert.throws(()=>auditRadarReleaseHtml(original,injected),/exactly one canonical radar script/);
});
test("can not suppress guard by passing empty or non-html text",()=>{
 assert.throws(()=>auditRadarReleaseHtml("bad",page(2)),/invalid main HTML/);
 assert.throws(()=>auditRadarReleaseHtml(page(2),""),/invalid candidate HTML/);
});
