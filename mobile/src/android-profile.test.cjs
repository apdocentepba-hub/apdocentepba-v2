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
 const result=config("validated-pilot","missing-fixture.json");
 assert.equal(result.status,0,result.stderr);const c=JSON.parse(result.stdout);
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
 const result=config("validated-pilot",file);assert.notEqual(result.status,0);assert.match(result.stderr,/Firebase configuration does not match/);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test("matching synthetic Firebase config accepted and secret fields rejected",()=>{
 const fs=require("node:fs"),os=require("node:os");const dir=fs.mkdtempSync(path.join(os.tmpdir(),"apd-config-"));
 try{
 const file=path.join(dir,"config.json");
 const fixture={project_info:{project_id:"alertasapd-dd3df",project_number:"432541641942"},client:[{client_info:{android_client_info:{package_name:"ar.com.alertasapd.pilot"},mobilesdk_app_id:"1:432541641942:android:729123387f5828f58c2d77"}}]};
 fs.writeFileSync(file,JSON.stringify(fixture));
 const valid=config("validated-pilot",file);assert.equal(valid.status,0,valid.stderr);
 fixture.private_key="synthetic_forbidden";fs.writeFileSync(file,JSON.stringify(fixture));
 const invalid=config("validated-pilot",file);assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/Firebase configuration does not match/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
