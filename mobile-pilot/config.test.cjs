const test=require("node:test"),assert=require("node:assert/strict");
const cfg=require("./app.config.js");
test("pilot identity exact, no live account backend",()=>{
 assert.equal(cfg.android.package,"ar.com.alertasapd.pilot");
 assert.equal(cfg.extra.eas.projectId,"c032c89f-7c44-49c7-a30f-d8ea0b223053");
 assert.equal(cfg.extra.backendEnabled,false);
 assert.equal(cfg.owner,"apdocentepba");
 assert.equal(cfg.updates.enabled,false);
});
