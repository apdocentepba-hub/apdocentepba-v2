const test=require("node:test"),assert=require("node:assert/strict");
const rows=[{eventKey:"a".repeat(64),dispatchId:"11111111-1111-4111-8111-111111111111",ticketId:"ticket_fixture_123"},{eventKey:"b".repeat(64),dispatchId:"22222222-2222-4222-8222-222222222222",ticketId:"ticket_fixture_456"}];
async function setup(reply,allow=true){
 const {createExpoReceiptPollLab}=await import("../../scripts/mobile-push-expo-receipt-poll-lab.mjs");const calls=[];
 const run=createExpoReceiptPollLab({authorizeRun:async()=>allow,database:{listExpoPendingReceiptChecks:async()=>rows,settleConsumedExpoReceipt:async x=>{calls.push(x);return true}},transport:{getReceipts:async ids=>{assert.deepEqual(ids,rows.map(r=>r.ticketId));return reply}}});
 return {run,calls};
}
test("settles accepted receipt and keeps missing receipt pending",async()=>{
 const f=await setup({httpStatus:200,body:{data:{ticket_fixture_123:{status:"ok"}}}});const r=await f.run({});assert.equal(r.settled,1);assert.equal(r.pending,1);assert.equal(r.delivery_to_device_confirmed,false);assert.deepEqual(f.calls.map(x=>x.outcome),["provider_accepted","pending"]);
});
test("outage, malformed receipt and unauthorized job never invent delivery",async()=>{
 for(const [reply,allow] of [[{httpStatus:503},true],[{httpStatus:200,body:{data:{ticket_fixture_123:{status:"unknown"},ticket_fixture_456:{status:"unknown"}}}},true],[{httpStatus:200,body:{data:{}}},false]]){
 const f=await setup(reply,allow);const r=await f.run({});assert.equal(r.settled,0);assert.equal(f.calls.length,0);
 }
});
