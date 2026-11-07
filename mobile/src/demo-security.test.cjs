const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const app=fs.readFileSync(path.join(root,"App.js"),"utf8");
const config=JSON.parse(fs.readFileSync(path.join(root,"app.json"),"utf8"));
const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
test("demo app uses local notifications only, never connects to push provider or backend",()=>{
 assert.doesNotMatch(app,/\bfetch\s*\(|\bXMLHttpRequest\b|axios\b|websocket\b/i);
 assert.match(app,/expo-notifications/);
 assert.match(app,/scheduleNotificationAsync/);
 assert.match(app,/requestPermissionsAsync/);
 assert.doesNotMatch(app,/getExpoPushTokenAsync|getDevicePushTokenAsync|registerForPushNotificationsAsync/);
 assert.ok(pkg.dependencies["expo-notifications"]);
});
test("permission requested only by explicit demo action, no automatic registration",()=>{
 const action=app.indexOf("const tryLocalNotification=async()=>{");
 const ui=app.indexOf('onPress={tryLocalNotification}');
 assert.ok(action>0 && ui>action);
 assert.match(app,/before\.granted\?before:await Notifications\.requestPermissionsAsync\(\)/);
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
 assert.deepEqual(config.expo.android.permissions,["POST_NOTIFICATIONS"]);
 assert.equal(config.expo.extra.localNotificationsDemo,true);
 assert.ok(config.expo.plugins.includes("expo-notifications"));
 assert.match(config.expo.android.package,/\.laboratorio$/);
});
test("Android JS export is an explicit script and does not imply a signed APK",()=>{
 assert.match(pkg.scripts["export:android"],/expo export --platform android/);
 assert.ok(!pkg.scripts.build||!pkg.scripts.build.includes("eas build"));
});
test("demo exposes all four navigation sections",()=>{
 for(const label of ["Inicio","Alertas","Filtros","Cuenta"])assert.ok(app.includes(label));
});
