import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSandboxPreference,privateReceipt} from './apd-commercial-sandbox-preference.mjs';
const ref='apd-sandbox-12345678-1234-4234-8234-123456789abc';
const prefId='1234-abcdef12';
const notify='https://apd-sandbox.invalid/webhook';
const seller={id:1234,site_id:'MLA',tags:['test_user']},buyer={id:5678,site_id:'MLA',tags:['test_user']};
const pref={id:prefId,collector_id:1234,external_reference:ref,notification_url:notify,items:[{id:'APD-QA-COMPLETO',unit_price:2000,currency_id:'ARS',quantity:1}],init_point:'https://www.mercadopago.com/mla/checkout/start?pref_id='+prefId,sandbox_init_point:'https://sandbox.mercadopago.com/mla/checkout/pay?pref_id='+prefId};
function fixture({overrideSeller=seller,overrideBuyer=buyer,search={total:0,elements:[]},created=pref,readback=pref,failPost=false}={}){
 const calls=[],receipts=[];
 const response=v=>new Response(JSON.stringify(v),{status:200});
 const opts={token:'test-fixture',sellerId:'1234',buyerId:'5678',reference:ref,ack:'CREATE_ONE_TEST_PREFERENCE_NO_REAL_PAYMENT',now:()=>Date.parse('2026-11-26T18:00:00Z'),receipt:{begin:v=>{receipts.push(v)},complete:v=>receipts.push(v)},transport:async(u,i)=>{
  calls.push([i.method,u.pathname,u.search]);
  assert.equal(u.origin,'https://api.mercadopago.com');assert.equal(i.redirect,'error');
  if(u.pathname==='/users/me')return response(overrideSeller);
  if(u.pathname==='/users/5678')return response(overrideBuyer);
  if(u.pathname==='/checkout/preferences/search'){assert.equal(u.searchParams.get('external_reference'),ref);return response(search);}
  if(i.method==='POST'&&u.pathname==='/checkout/preferences'){
   assert.equal(receipts.length,1);const b=JSON.parse(i.body);assert.equal(b.notification_url,notify);assert.equal(b.external_reference,ref);assert.equal(b.items[0].unit_price,2000);assert.equal(b.expires,true);assert.equal(b.expiration_date_to,'2026-11-26T19:00:00.000Z');
   assert.ok(!('payer' in b)&&!('back_urls' in b));if(failPost)throw Error('fixture timeout');return response(created);
  }
  if(u.pathname==='/checkout/preferences/'+prefId)return response(readback);
  assert.fail('Unexpected request');
 }};
 return {opts,calls,receipts};
}
test('test identities, isolated preference, private intent and exact provider readback',async()=>{
 const f=fixture(),r=await createSandboxPreference(f.opts);
 assert.equal(r.status,'ready_test_only');assert.equal(r.paymentCreated,false);assert.equal(r.databaseWrites,0);assert.equal(r.notificationDeliveryTested,false);
 assert.deepEqual(f.calls.map(c=>c[0]),['GET','GET','GET','POST','GET']);assert.equal(f.receipts.length,2);
});
test('same account, missing ack and real reference refused before any provider request',async()=>{
 for(const o of [{buyerId:'1234'},{ack:''},{reference:'00000000-0000-4000-8000-000000000007:COMPLETO:123'},{token:''}]){
  const f=fixture();await assert.rejects(createSandboxPreference({...f.opts,...o}));assert.equal(f.calls.length,0);
 }
});
test('wrong or unverified seller or buyer never triggers writes',async()=>{
 for(const o of [{overrideSeller:{...seller,tags:[]}},{overrideSeller:{...seller,site_id:'MLB'}},{overrideSeller:{...seller,id:999}},{overrideBuyer:{...buyer,tags:[]}}]){
  const f=fixture(o);await assert.rejects(createSandboxPreference(f.opts));assert.ok(f.calls.every(c=>c[0]==='GET'));assert.equal(f.receipts.length,0);
 }
});
test('existing or uncertain reference search never creates another preference',async()=>{
 for(const search of [{total:1,elements:[{}]},{total:0},{elements:[]}]){
  const f=fixture({search});await assert.rejects(createSandboxPreference(f.opts));assert.ok(f.calls.every(c=>c[0]==='GET'));assert.equal(f.receipts.length,1);
 }
});
test('ambiguous POST not retried and intent retained',async()=>{
 const f=fixture({failPost:true});await assert.rejects(createSandboxPreference(f.opts));assert.equal(f.calls.filter(c=>c[0]==='POST').length,1);assert.equal(f.receipts.length,1);
});
test('mismatched preference or unsafe link never generates a ready receipt',async()=>{
 for(const o of [{created:{...pref,collector_id:999}},{readback:{...pref,notification_url:'https://alertasapd.com.ar/api/mercadopago/webhook'}},{readback:{...pref,init_point:'https://evil.invalid/mla/checkout/start?pref_id='+prefId}},{readback:{...pref,init_point:pref.init_point+'&pref_id=bad'}},{readback:{...pref,sandbox_init_point:'https://sandbox.mercadopago.com/mla/checkout/pay?pref_id=wrong'}}]){
  const f=fixture(o);await assert.rejects(createSandboxPreference(f.opts));assert.equal(f.receipts.length,1);assert.equal(f.calls.filter(c=>c[0]==='POST').length,1);
 }
});
test('filesystem intent survives retry and never overwrites original evidence',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apd-qa-private-'));
 try{
  const f=fixture(),receipt=privateReceipt(dir,ref);
  await createSandboxPreference({...f.opts,receipt:{begin:v=>{receipt.begin(v);f.receipts.push(v)},complete:v=>{receipt.complete(v);f.receipts.push(v)}}});
  const next=fixture();await assert.rejects(createSandboxPreference({...next.opts,receipt}));
  assert.ok(next.calls.every(c=>c[0]==='GET'));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,ref+'.intent.json'))).status,'intent');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,ref+'.ready.json'))).paymentCreated,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
