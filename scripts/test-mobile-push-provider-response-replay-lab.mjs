import test from 'node:test';
import assert from 'node:assert/strict';
import {
 classifyExpoPushTicketLab,classifyExpoPushReceiptLab,
 classifyFcmHttpV1Lab,createMobilePushProviderReplayLab
} from './mobile-push-provider-response-replay-lab.mjs';

const DISPATCH='66666666-6666-4666-8666-666666666666';
const TICKET='11111111-1111-4111-8111-111111111111';
const ticketOk=()=>({httpStatus:200,body:{data:[{status:'ok',id:TICKET}]}});
const receiptOk=()=>({httpStatus:200,body:{data:{[TICKET]:{status:'ok'}}}});
const receiptInvalid=()=>({
 httpStatus:200,body:{data:{[TICKET]:{
  status:'error',message:'DO_NOT_LEAK_TOKEN',
  details:{error:'DeviceNotRegistered'}
 }}}
});
const fcmOk=()=>({
 httpStatus:200,body:{name:'projects/lab-project/messages/0:123456789'}
});
const fcmUnregistered=()=>({
 httpStatus:404,body:{error:{
  code:404,status:'NOT_FOUND',message:'SENSITIVE_PROVIDER_MESSAGE',
  details:[{
   '@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',
   errorCode:'UNREGISTERED'
  }]
 }}
});
test('Expo ticket only means queued, NOT provider or device delivery',()=>{
 const c=classifyExpoPushTicketLab(ticketOk());
 assert.equal(c.state,'awaiting_receipt');
 assert.equal(c.receiptId,TICKET);
 assert.equal(c.reason,'expo_ticket_only');
 assert.notEqual(c.state,'provider_accepted');
});
test('Expo receipt means underlying provider accepted, not a device delivery',()=>{
 const c=classifyExpoPushReceiptLab({...receiptOk(),receiptId:TICKET});
 assert.equal(c.state,'provider_accepted');
 assert.equal(c.reason,'expo_receipt_provider_accepted');
});
test('Expo DeviceNotRegistered ticket and receipt terminate token usage',()=>{
 const t=classifyExpoPushTicketLab({httpStatus:200,body:{
  data:[{status:'error',message:'DO_NOT_EXPOSE',
   details:{error:'DeviceNotRegistered'}}]
 }});
 const r=classifyExpoPushReceiptLab({...receiptInvalid(),receiptId:TICKET});
 assert.equal(t.state,'invalid_device');
 assert.equal(r.state,'invalid_device');
 assert.equal(JSON.stringify(r).includes('DO_NOT_LEAK'),false);
});
test('Expo missing receipt remains pending, never treats missing map entry as ok',()=>{
 const r=classifyExpoPushReceiptLab({
  httpStatus:200,receiptId:TICKET,body:{data:{}}
 });
 assert.equal(r.state,'awaiting_receipt');
});
for(const [name,data,expected] of [
 ['HTTP429',{httpStatus:429,body:{errors:[{code:'PUSH_TOO_MANY_NOTIFICATIONS'}]}},'uncertain'],
 ['HTTP503',{httpStatus:503,body:{errors:[{code:'PUSH_TOO_MANY_NOTIFICATIONS'}]}},'uncertain'],
 ['timeout',{httpStatus:0,body:null},'uncertain'],
 ['HTTP400',{httpStatus:400,body:{}},'rejected'],
 ['malformed body',{httpStatus:200,body:'INVALID'},'uncertain'],
 ['missing ticket',{httpStatus:200,body:{}},'uncertain'],
 ['duplicate tickets',{httpStatus:200,body:{data:[
  {status:'ok',id:TICKET},{status:'ok',id:TICKET}
 ]}},'uncertain'],
 ['missing ticket ID',{httpStatus:200,body:{data:{status:'ok'}}},'uncertain'],
 ['bad ticket ID',{httpStatus:200,body:{data:{
  status:'ok',id:'https://leak?token=SECRET'
 }}},'uncertain'],
 ['envelope errors',{httpStatus:200,body:{errors:[{message:'SERVER_DEBUG'}],
  data:{status:'ok',id:TICKET}}},'uncertain'],
 ['explicit ticket rejection',{httpStatus:200,body:{data:{
  status:'error',details:{error:'MessageTooBig'}
 }}},'rejected']
]){
 test('Expo '+name+' is classified conservatively',()=>{
  const result=classifyExpoPushTicketLab(data);
  assert.equal(result.state,expected);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  assert.ok(!JSON.stringify(result).includes('SERVER_DEBUG'));
 });
}
for(const [name,data,expected] of [
 ['receipt HTTP503',{httpStatus:503,body:{}},'uncertain'],
 ['unknown receipt',{httpStatus:200,body:{data:{[TICKET]:{status:'unknown'}}}},'uncertain'],
 ['receipt rejected',{httpStatus:200,body:{data:{[TICKET]:{
  status:'error',details:{error:'MessageTooBig'}
 }}}},'rejected'],
 ['missing map',{httpStatus:200,body:{}},'uncertain']
]){
 test('Expo '+name+' does not fabricate acceptance',()=>{
  const result=classifyExpoPushReceiptLab({...data,receiptId:TICKET});
  assert.equal(result.state,expected);
 });
}
test('FCM HTTP v1 success is provider accepted, not displayed on device',()=>{
 const r=classifyFcmHttpV1Lab(fcmOk());
 assert.equal(r.state,'provider_accepted');
 assert.equal(r.reason,'fcm_message_accepted');
 assert.ok(!JSON.stringify(r).includes('123456789'));
});
test('FCM UNREGISTERED only proven by explicit structured FcmError detail',()=>{
 assert.equal(classifyFcmHttpV1Lab(fcmUnregistered()).state,'invalid_device');
 assert.equal(classifyFcmHttpV1Lab({
  httpStatus:404,body:{error:{status:'NOT_FOUND',message:'DO_NOT_LEAK'}}
 }).state,'uncertain');
});
for(const [code,state] of [
 [429,'uncertain'],[500,'uncertain'],[503,'uncertain'],
 [401,'uncertain'],[403,'uncertain'],[400,'rejected'],[200,'uncertain']
]){
 test('FCM '+code+' without valid success message fails closed',()=>{
  const r=classifyFcmHttpV1Lab({httpStatus:code,body:{
   error:{status:'UNAVAILABLE',message:'SECRET_RECIPIENT'}
  }});
  assert.equal(r.state,state);
  assert.ok(!JSON.stringify(r).includes('SECRET_RECIPIENT'));
 });
}
test('Expo ticket→receipt replay is one synthetic submission only',()=>{
 const sim=createMobilePushProviderReplayLab({dispatchId:DISPATCH,transport:'expo'});
 assert.equal(sim.snapshot().state,'prepared');
 assert.equal(sim.submit(ticketOk()).state,'awaiting_receipt');
 assert.equal(sim.submit(ticketOk()).applied,false);
 assert.equal(sim.receipt({httpStatus:200,body:{data:{}}}).state,
  'awaiting_receipt');
 assert.equal(sim.receipt(receiptOk()).state,'provider_accepted');
 assert.equal(sim.receipt(receiptOk()).applied,false);
 assert.equal(sim.timeout(),false);
 assert.deepEqual(sim.snapshot(),{
  state:'provider_accepted',transport:'expo',submission_attempts:1,
  receipt_pending:false,late_receipt_audit_only:false,
  reason:'expo_receipt_provider_accepted',
  delivery_to_device_confirmed:false,provider_calls:0
 });
});
test('late Expo receipt after timeout stays quarantined; never reopen SQL state',()=>{
 const sim=createMobilePushProviderReplayLab({dispatchId:DISPATCH,transport:'expo'});
 sim.submit(ticketOk());
 assert.equal(sim.timeout(),true);
 assert.equal(sim.snapshot().state,'uncertain');
 assert.equal(sim.receipt(receiptOk()).reason,'late_receipt_audit_only');
 assert.equal(sim.snapshot().late_receipt_audit_only,true);
 assert.equal(sim.snapshot().state,'uncertain');
 assert.equal(sim.submit(ticketOk()).applied,false);
});
test('late Expo receipt after device revocation never reactivates authorization',()=>{
 const sim=createMobilePushProviderReplayLab({dispatchId:DISPATCH,transport:'expo'});
 sim.submit(ticketOk());
 assert.equal(sim.revoke(),true);
 assert.equal(sim.receipt(receiptOk()).applied,false);
 assert.equal(sim.snapshot().state,'revoked');
 assert.equal(sim.submit(ticketOk()).applied,false);
});
test('rejection, invalid device and timeout can never create second submission',()=>{
 const payloads=[
  {httpStatus:200,body:{data:[{status:'error',details:{
   error:'DeviceNotRegistered'
  }}]}},
  {httpStatus:400,body:{data:[]}},
  {httpStatus:503,body:{}}
 ];
 for(const data of payloads){
  const sim=createMobilePushProviderReplayLab({dispatchId:DISPATCH,transport:'expo'});
  const outcome=sim.submit(data);
  assert.ok(['invalid_device','rejected','uncertain'].includes(outcome.state));
  assert.equal(sim.submit(ticketOk()).applied,false);
  assert.equal(sim.snapshot().submission_attempts,1);
  assert.equal(sim.snapshot().provider_calls,0);
 }
});
test('FCM replay records accepted service response but not device receipt',()=>{
 const sim=createMobilePushProviderReplayLab({dispatchId:DISPATCH,transport:'fcm'});
 assert.equal(sim.submit(fcmOk()).state,'provider_accepted');
 assert.equal(sim.receipt(receiptOk()).applied,false);
 assert.equal(sim.submit(fcmOk()).applied,false);
 assert.equal(sim.snapshot().delivery_to_device_confirmed,false);
});
test('unknown FCM outcome cannot be retried in the same dispatch',()=>{
 const sim=createMobilePushProviderReplayLab({dispatchId:DISPATCH,transport:'fcm'});
 assert.equal(sim.submit({httpStatus:503}).state,'uncertain');
 assert.equal(sim.submit(fcmOk()).applied,false);
 assert.equal(sim.snapshot().state,'uncertain');
});
test('synthetic replay cannot be initialized with invalid transport or dispatch',()=>{
 assert.throws(()=>createMobilePushProviderReplayLab({
  dispatchId:'not-a-uuid',transport:'expo'
 }),/invalid_provider_replay_identity/);
 assert.throws(()=>createMobilePushProviderReplayLab({
  dispatchId:DISPATCH,transport:'https://exp.host'
 }),/invalid_provider_replay_identity/);
});
test('no recipient, email, auth token, provider URLs or raw responses escape replay',()=>{
 const sim=createMobilePushProviderReplayLab({dispatchId:DISPATCH,transport:'expo'});
 sim.submit({httpStatus:200,body:{data:[{
  status:'error',message:'DO_NOT_EXPOSE',
  details:{error:'MessageTooBig'},token:'EXPO_PUSH_TOKEN_PRIVATE'
 }]}});
 const report=JSON.stringify(sim.snapshot());
 for(const value of ['DO_NOT_EXPOSE','EXPO_PUSH_TOKEN_PRIVATE',
  'https://exp.host','66666666-6666-4666-8666-666666666666'])
  assert.equal(report.includes(value),false,value);
});
