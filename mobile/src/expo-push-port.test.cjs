const test=require("node:test");
const assert=require("node:assert/strict");
const {createExpoPushPort}=require("./expo-push-port.js");
test("Expo adapter is inert until called and passes explicit project identity",async()=>{
 const calls=[];const N={AndroidImportance:{HIGH:4},setNotificationChannelAsync:async(...a)=>calls.push(a),getPermissionsAsync:async()=>({granted:false}),requestPermissionsAsync:async()=>({granted:true}),getExpoPushTokenAsync:async args=>{calls.push(args);return {data:"ExpoPushToken[fixture_token_1234567890]"};}};
 const port=createExpoPushPort(N);assert.deepEqual(calls,[]);
 await port.ensureChannel();assert.equal(calls[0][0],"apd-alertas");assert.equal(calls[0][1].importance,4);
 assert.equal((await port.getPermissions()).granted,false);
 assert.equal((await port.requestPermissions()).granted,true);
 assert.equal(await port.getExpoToken("fixture-project"),"ExpoPushToken[fixture_token_1234567890]");assert.deepEqual(calls[1],{projectId:"fixture-project"});
});
