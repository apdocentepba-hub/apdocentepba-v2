const test=require("node:test");
const assert=require("node:assert/strict");
const {DEMO_OFFERS,DISTRICTS,SHIFTS,filterDemoOffers,toggleSaved,demoCounters}=require("./demo-state.cjs");
test("demo offers are clearly fictitious and have unique IDs",()=>{
 assert.ok(DEMO_OFFERS.length>=3);
 assert.equal(new Set(DEMO_OFFERS.map(x=>x.id)).size,DEMO_OFFERS.length);
 assert.ok(DEMO_OFFERS.every(x=>x.id.startsWith("DEMO-")&&x.escuela.includes("ficticia")));
});
test("unfiltered view exposes only local example offers",()=>{
 assert.equal(filterDemoOffers(DEMO_OFFERS).length,DEMO_OFFERS.length);
});
test("district selection filters without network access",()=>{
 const out=filterDemoOffers(DEMO_OFFERS,{district:"Avellaneda"});
 assert.equal(out.length,2);
 assert.ok(out.every(x=>x.distrito==="Avellaneda"));
});
test("shift combines with district correctly",()=>{
 const out=filterDemoOffers(DEMO_OFFERS,{district:"Avellaneda",shift:"Tarde"});
 assert.equal(out.length,1);assert.equal(out[0].cargo,"Informática");
});
test("search accepts accent-insensitive queries",()=>{
 const out=filterDemoOffers(DEMO_OFFERS,{query:"INFORMATICA"});
 assert.equal(out.length,2);
});
test("unknown and invalid data fail closed to an empty list",()=>{
 assert.deepEqual(filterDemoOffers(null),[]);
 assert.deepEqual(filterDemoOffers([{id:"X"}],{query:"cargos"}),[]);
});
test("saved demo offers toggle without changing source data",()=>{
 let saved=toggleSaved([],"DEMO-APD-001");
 assert.deepEqual(saved,["DEMO-APD-001"]);
 saved=toggleSaved(saved,"DEMO-APD-001");
 assert.deepEqual(saved,[]);
 assert.equal(DEMO_OFFERS.length,4);
});
test("unrecognized IDs cannot be saved",()=>{
 assert.deepEqual(toggleSaved([],"SOME-REAL-UNVERIFIED-OFFER"),[]);
});
test("demo counters must never imply a delivered push",()=>{
 assert.deepEqual(demoCounters(DEMO_OFFERS,["DEMO-APD-001"]),{matching:4,saved:1,pushReceived:0});
});
test("available filters are enumerated and contain a visible All option",()=>{
 assert.equal(DISTRICTS[0],"Todos");assert.equal(SHIFTS[0],"Todos");
});
test("local sample contains no real external URLs, user accounts, or credentials",()=>{
 const s=JSON.stringify(DEMO_OFFERS);
 assert.doesNotMatch(s,/https?:|Bearer |@|password|dni|cuil|apns|fcm/i);
});
