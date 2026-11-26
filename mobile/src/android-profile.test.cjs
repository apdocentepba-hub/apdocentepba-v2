const test=require("node:test");
const assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process");
const path=require("node:path");
function config(profile,file){
 const env={...process.env,APD_ANDROID_PROFILE:profile,GOOGLE_SERVICES_JSON:file};
 const r=spawnSync(process.execPath,["-e","process.stdout.write(JSON.stringify(require('./app.config.js')))"],{cwd:path.join(__dirname,".."),env,encoding:"utf8"});
 return r;
}
test("default remains disconnected lab",()=>{
 const c=JSON.parse(config("lab","missing-fixture.json").stdout);
 assert.equal(c.android.package,"ar.com.alertasapd.laboratorio");
 assert.equal(c.extra.backendEnabled,false);
});
test("candidate matches installed pilot identity, version increments, remote features stay disabled",()=>{
 const c=JSON.parse(config("validated-pilot","missing-fixture.json").stdout);
 assert.equal(c.android.package,"ar.com.alertasapd.pilot");
 assert.equal(c.extra.eas.projectId,"c032c89f-7c44-49c7-a30f-d8ea0b223053");
 assert.equal(c.android.versionCode,2);
 assert.equal(c.plugins[0][1].defaultChannel,"apd-alertas");
 assert.equal(c.extra.backendEnabled,false);assert.equal(c.extra.pushEnabled,false);
 assert.equal(c.updates.enabled,false);
});
test("wrong Firebase file rejected",()=>{
 const fs=require("node:fs");const os=require("node:os");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"apd-config-"));
 try{const file=path.join(dir,"bad.json");fs.writeFileSync(file,JSON.stringify({project_info:{project_id:"wrong"}}));
 assert.notEqual(config("validated-pilot",file).status,0);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
