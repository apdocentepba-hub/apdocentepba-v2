const test=require("node:test");
const assert=require("node:assert/strict");
const {createNativeDashboard}=require("./native-dashboard.js");
const {createOfflineDashboard}=require("./native-dashboard-fixture.js");
test("native dashboard fixture login, refresh and logout never leave another account's offers",async()=>{
 const {dashboard,loginDemo}=createOfflineDashboard();
 assert.equal(dashboard.snapshot().account,null);
 const result=await loginDemo();
 assert.equal(result.account.name,"Docente de prueba");
 assert.equal(result.offers.length,2);
 assert.equal(result.preferences.district,"AVELLANEDA (ejemplo)");
 assert.ok(!JSON.stringify(result).includes("bearer"));
 assert.equal((await dashboard.refresh()).offers.length,2);
 const end=await dashboard.logout();
 assert.equal(end.account,null);assert.deepEqual(end.offers,[]);assert.equal(end.preferences,null);
});
function setup({failRevoke=false,hold=false}={}){
 let account=null,release,stamp=1000,registered=true;
 const calls=[];
 const client={account:()=>account,login:async()=>{account={userId:"a",name:"fixture"};return account;},alerts:async()=>{if(hold)await new Promise(r=>release=r);return {items:[{key:"one",expiresAt:2000}],excluded:0};},preferences:async()=>({district:"fixture"}),logoutLocal:()=>{calls.push("logout");account=null;}};
 const push={status:async()=>({state:registered?"registered":"not_registered"}),disable:async()=>{calls.push("revoke");if(failRevoke)throw Error("private");registered=false;return {state:"revoked"};},enable:async({consent})=>{assert.equal(consent,true);registered=true;return {state:"registered"};}};
 return {d:createNativeDashboard({client,push,now:()=>stamp}),calls,release:()=>release?.(),expire:()=>stamp=2000,hasRelease:()=>!!release};
}
test("registered device revocation happens before local logout",async()=>{
 const f=setup();await f.d.login("fixture","fixture");assert.equal((await f.d.enablePush()).pushState,"registered");await f.d.logout();assert.deepEqual(f.calls,["revoke","logout"]);assert.equal(f.d.snapshot().account,null);
});
test("failed revocation keeps account and reports an unconfirmed operation",async()=>{
 const f=setup({failRevoke:true});await f.d.login("fixture","fixture");
 await assert.rejects(f.d.logout(),/operation_unconfirmed/);
 assert.deepEqual(f.calls,["revoke"]);assert.ok(f.d.snapshot().account);assert.ok(!f.d.snapshot().error.includes("private"));
});
test("snapshot filters expired offers and dispose rejects a late response",async()=>{
 const f=setup();await f.d.login("fixture","fixture");f.expire();assert.deepEqual(f.d.snapshot().offers,[]);
 const g=setup({hold:true});const pending=g.d.login("fixture","fixture");while(!g.hasRelease())await new Promise(r=>setImmediate(r));
 g.d.dispose();g.release();await assert.rejects(pending,/operation_unconfirmed/);assert.equal(g.d.snapshot().account,null);assert.deepEqual(g.d.snapshot().offers,[]);
});

test("mounted offline account fixture uses complete controller with simulated notification state",async()=>{
 const {dashboard,loginDemo}=createOfflineDashboard();await loginDemo();
 assert.equal((await dashboard.refreshPushStatus()).pushState,"not_registered");
 assert.equal((await dashboard.enablePush()).pushState,"registered");
 assert.equal((await dashboard.disablePush()).pushState,"revoked");
 await dashboard.enablePush();assert.equal((await dashboard.logout()).account,null);
});
