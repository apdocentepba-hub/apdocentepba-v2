const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const app=fs.readFileSync(path.join(root,"App.js"),"utf8");
const config=JSON.parse(fs.readFileSync(path.join(root,"app.json"),"utf8"));
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
test("demo app has no network request code or SDK with real push permission",()=>{
 assert.doesNotMatch(app,/\bfetch\s*\(|\bXMLHttpRequest\b|axios\b|websocket\b/i);
 assert.doesNotMatch(app,/expo-notifications|Notifications\.requestPermissionsAsync|registerForPushNotifications/i);
 assert.ok(!pkg.dependencies["expo-notifications"]);
});
test("demo displays an unambiguous warning that offers are fictitious",()=>{
 assert.match(app,/MODO DEMOSTRACIÓN/);
 assert.match(app,/SIN DATOS REALES/);
 assert.match(app,/No son vacantes de ABC/);
});
test("config does not enable production backend or push",()=>{
 assert.equal(config.expo.extra.demoOnly,true);
 assert.equal(config.expo.extra.backendEnabled,false);
 assert.equal(config.expo.extra.pushEnabled,false);
 assert.deepEqual(config.expo.android.permissions,[]);
 assert.match(config.expo.android.package,/\.laboratorio$/);
});
test("Android JS export is an explicit script and does not imply a signed APK",()=>{
 assert.match(pkg.scripts["export:android"],/expo export --platform android/);
 assert.ok(!pkg.scripts.build||!pkg.scripts.build.includes("eas build"));
});
test("demo exposes all four navigation sections",()=>{
 for(const label of ["Inicio","Alertas","Filtros","Cuenta"])assert.ok(app.includes(label));
});
