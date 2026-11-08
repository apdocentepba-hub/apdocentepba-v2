import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobileExpoReceiptJournalLab}
 from './mobile-push-expo-receipt-journal-lab.mjs';
import {createMobilePushPostgrestAdapterLab}
 from './mobile-push-postgrest-adapter-lab.mjs';

const EVENT='a'.repeat(64);
const DISPATCH='66666666-6666-4666-8666-666666666666';
const TICKET='11111111-1111-4111-8111-111111111111';
const PROJECT='https://apdsynthetic123.supabase.co';
const SECRET='sb_secret_ABCDEF1234567890abcdefXYZABCDEF0';
const ticket={httpStatus:200,body:{data:[{status:'ok',id:TICKET}]}};
const receipt={httpStatus:200,body:{data:{[TICKET]:{status:'ok'}}}};
const response=data=>new Response(JSON.stringify(data),{
 status:200,headers:{'content-type':'application/json'}
});
function fake(){
 const calls=[],used=new Set();
 return {
  calls,database:{
   async recordExpoTicket(args){
    calls.push({kind:'ticket',...args});
    const key=args.eventKey+'|'+args.dispatchId;
    if(used.has(key))return false;
    used.add(key);return true;
   },
   async recordExpoReceiptAudit(args){
    calls.push({kind:'receipt',...args});
    return used.has(args.eventKey+'|'+args.dispatchId);
   }
  }
 };
}
test('Expo ticket ID is persisted with exact event+authorization, never logged to caller',async()=>{
 const f=fake(),journal=createMobileExpoReceiptJournalLab({database:f.database});
 const x=await journal.recordSyntheticTicket({
  eventKey:EVENT,dispatchId:DISPATCH,providerReply:ticket
 });
 assert.deepEqual(x,{
  stored:true,classification:'awaiting_receipt',
  provider_calls:0,delivery_to_device_confirmed:false
 });
 assert.deepEqual(f.calls[0],{
  kind:'ticket',eventKey:EVENT,dispatchId:DISPATCH,ticketId:TICKET
 });
 assert.equal(JSON.stringify(x).includes(TICKET),false);
});
test('receipt acceptance is an observation, never a device receipt or SQL sent ACK',async()=>{
 const f=fake(),j=createMobileExpoReceiptJournalLab({database:f.database});
 await j.recordSyntheticTicket({eventKey:EVENT,dispatchId:DISPATCH,providerReply:ticket});
 const r=await j.recordSyntheticReceipt({
  eventKey:EVENT,dispatchId:DISPATCH,ticketId:TICKET,providerReply:receipt
 });
 assert.deepEqual(r,{
  stored:true,observed_status:'provider_accepted',
  delivery_to_device_confirmed:false,provider_calls:0
 });
 assert.deepEqual(f.calls[1],{
  kind:'receipt',eventKey:EVENT,dispatchId:DISPATCH,
  ticketId:TICKET,outcome:'provider_accepted'
 });
 assert.equal(JSON.stringify(r).includes(TICKET),false);
});
for(const [label,reply,expected] of [
 ['missing receipt',{httpStatus:200,body:{data:{}}},'pending'],
 ['Expo 5xx',{httpStatus:503,body:null},'uncertain'],
 ['explicit Expo rejection',{httpStatus:200,body:{data:{
  [TICKET]:{status:'error',details:{error:'MessageTooBig'}}
 }}},'provider_rejected'],
 ['unregistered token',{httpStatus:200,body:{data:{
  [TICKET]:{status:'error',details:{error:'DeviceNotRegistered'}}
 }}},'invalid_device']
]){
 test(label+' stores only classification, no raw provider response',async()=>{
  const f=fake(),j=createMobileExpoReceiptJournalLab({database:f.database});
  await j.recordSyntheticTicket({
   eventKey:EVENT,dispatchId:DISPATCH,providerReply:ticket
  });
  const r=await j.recordSyntheticReceipt({
   eventKey:EVENT,dispatchId:DISPATCH,ticketId:TICKET,providerReply:reply
  });
  assert.equal(r.stored,true);
  assert.equal(f.calls[1].outcome,expected);
  assert.equal(r.provider_calls,0);
 });
}
test('malformed ticket never persists and duplicated ticket is refused',async()=>{
 const f=fake(),j=createMobileExpoReceiptJournalLab({database:f.database});
 assert.equal((await j.recordSyntheticTicket({
  eventKey:EVENT,dispatchId:DISPATCH,
  providerReply:{httpStatus:200,body:{data:{status:'ok',id:'bad/id'}}}
 })).stored,false);
 assert.equal(f.calls.length,0);
 assert.equal((await j.recordSyntheticTicket({
  eventKey:EVENT,dispatchId:DISPATCH,providerReply:ticket
 })).stored,true);
 assert.equal((await j.recordSyntheticTicket({
  eventKey:EVENT,dispatchId:DISPATCH,providerReply:ticket
 })).stored,false);
});
test('reject spoofed event and dispatch before any SQL RPC',async()=>{
 const f=fake(),j=createMobileExpoReceiptJournalLab({database:f.database});
 await assert.rejects(()=>j.recordSyntheticTicket({
  eventKey:'bad',dispatchId:DISPATCH,providerReply:ticket
 }),/invalid_expo_journal_identity/);
 await assert.rejects(()=>j.recordSyntheticReceipt({
  eventKey:EVENT,dispatchId:'bad',ticketId:TICKET,providerReply:receipt
 }),/invalid_expo_journal_identity/);
 await assert.rejects(()=>j.recordSyntheticReceipt({
  eventKey:EVENT,dispatchId:DISPATCH,ticketId:'bad/id',providerReply:receipt
 }),/invalid_expo_journal_identity/);
 assert.equal(f.calls.length,0);
});
test('strictly injected private database is mandatory and cannot return unknown',async()=>{
 assert.throws(()=>createMobileExpoReceiptJournalLab(),
  /expo_journal_requires_private_database/);
 const fakeDb={
  async recordExpoTicket(){return 'truthy';},
  async recordExpoReceiptAudit(){return null;}
 };
 const j=createMobileExpoReceiptJournalLab({database:fakeDb});
 await assert.rejects(()=>j.recordSyntheticTicket({
  eventKey:EVENT,dispatchId:DISPATCH,providerReply:ticket
 }),/expo_ticket_storage_unverified/);
 await assert.rejects(()=>j.recordSyntheticReceipt({
  eventKey:EVENT,dispatchId:DISPATCH,ticketId:TICKET,providerReply:receipt
 }),/expo_receipt_storage_unverified/);
});
test('PostgREST persists only event+dispatch+ticket and classified receipt',async()=>{
 const requests=[];
 const fetchImpl=async(url,opts)=>{
  const u=new URL(url);
  requests.push({path:u.pathname,body:JSON.parse(opts.body)});
  assert.equal(opts.method,'POST');
  assert.equal(opts.headers.apikey,SECRET);
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.redirect,'manual');
  if(u.pathname.endsWith('apd_mobile_expo_record_ticket')){
   assert.deepEqual(JSON.parse(opts.body),{
    p_event_key:EVENT,p_dispatch_id:DISPATCH,p_ticket_id:TICKET
   });
   return response(true);
  }
  if(u.pathname.endsWith('apd_mobile_expo_record_receipt')){
   assert.deepEqual(JSON.parse(opts.body),{
    p_event_key:EVENT,p_dispatch_id:DISPATCH,p_ticket_id:TICKET,
    p_outcome:'provider_accepted'
   });
   return response(true);
  }
  throw Error('unexpected_private_route');
 };
 const database=createMobilePushPostgrestAdapterLab({
  projectUrl:PROJECT,secretKey:SECRET,fetchImpl
 });
 const j=createMobileExpoReceiptJournalLab({database});
 const saved=await j.recordSyntheticTicket({
  eventKey:EVENT,dispatchId:DISPATCH,providerReply:ticket
 });
 const checked=await j.recordSyntheticReceipt({
  eventKey:EVENT,dispatchId:DISPATCH,ticketId:TICKET,providerReply:receipt
 });
 assert.equal(saved.stored,true);
 assert.equal(checked.stored,true);
 assert.deepEqual(requests.map(x=>x.path),[
  '/rest/v1/rpc/apd_mobile_expo_record_ticket',
  '/rest/v1/rpc/apd_mobile_expo_record_receipt'
 ]);
 assert.ok(!JSON.stringify({saved,checked}).includes(TICKET));
 assert.ok(!JSON.stringify({saved,checked}).includes(SECRET));
});
test('PostgREST refuses fake delivery, invalid ticket and nonboolean RPC results',async()=>{
 let sent=0;
 const db=createMobilePushPostgrestAdapterLab({
  projectUrl:PROJECT,secretKey:SECRET,
  fetchImpl:async()=>{sent++;return response('invalid');}
 });
 await assert.rejects(()=>db.recordExpoTicket({
  eventKey:EVENT,dispatchId:DISPATCH,ticketId:TICKET
 }),/postgrest_invalid_expo_ticket_result/);
 await assert.rejects(()=>db.recordExpoReceiptAudit({
  eventKey:EVENT,dispatchId:DISPATCH,ticketId:TICKET,outcome:'delivered'
 }),/invalid_expo_receipt_outcome/);
 await assert.rejects(()=>db.recordExpoTicket({
  eventKey:EVENT,dispatchId:DISPATCH,ticketId:'bad/id'
 }),/invalid_expo_receipt_identity/);
 assert.equal(sent,1);
});
