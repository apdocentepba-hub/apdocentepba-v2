import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reconcileSandboxReference,privateEvidence} from './apd-commercial-sandbox-reconcile-reference.mjs';
const reference='apd-sandbox-12345678-1234-4234-8234-123456789abc',pref='1234-abcdef12',seller='1234',buyer='5678',stamp='2026-11-26T18:30:00Z',approved='2026-11-26T18:31:00Z',observed='2026-11-26T18:35:00Z';
const intent={status:'intent',reference,sellerId:seller,buyerId:buyer,createdAt:stamp};
const ready={status:'ready_test_only',reference,preferenceId:pref,verifiedTestSeller:true,verifiedTestBuyer:true,paymentCreated:false,amountArs:2000,databaseWrites:0};
const preference={id:pref,collector_id:1234,external_reference:reference,notification_url:'https://apd-sandbox.invalid/webhook',items:[{id:'APD-QA-COMPLETO',currency_id:'ARS',quantity:1,unit_price:2000}]};
const payment={id:900,collector_id:1234,payer:{id:5678},external_reference:reference,currency_id:'ARS',transaction_amount:2000,transaction_amount_refunded:0,status:'approved',live_mode:false,date_approved:approved,date_last_updated:approved};
const page={paging:{total:1,offset:0,limit:2},results:[payment]};
function fixture(o={}){
 const calls=[];
 const inputs={token:'fixture-token',intent,ready,phase:'approved',now:()=>Date.parse(observed),transport:async(u,i)=>{
  calls.push(u.pathname);assert.equal(u.origin,'https://api.mercadopago.com');assert.equal(i.method,'GET');assert.equal(i.redirect,'error');
  let v;
  if(u.pathname==='/users/me')v=o.seller??{id:1234,site_id:'MLA',tags:['test_user']};
  else if(u.pathname==='/users/5678')v=o.buyer??{id:5678,site_id:'MLA',tags:['test_user']};
  else if(u.pathname==='/checkout/preferences/'+pref)v=o.preference??preference;
  else if(u.pathname==='/v1/payments/search'){for(const [k,x] of Object.entries({external_reference:reference,'collector.id':seller,'payer.id':buyer,begin_date:'NOW-30DAYS',limit:'2',offset:'0'}))assert.equal(u.searchParams.get(k),x);v=o.page??page;}
  else if(u.pathname==='/v1/payments/900'||u.pathname==='/v1/payments/901')v=o.payment??payment;
  else assert.fail('Unexpected GET');
  return new Response(JSON.stringify(v));
 }};
 return {inputs,calls};
}
test('discover one payment by reference and cross-check exact identities, preference, and detail',async()=>{
 const f=fixture(),r=await reconcileSandboxReference(f.inputs);assert.equal(r.status,'approved');assert.equal(r.paymentId,'900');assert.equal(r.providerWrites,0);assert.equal(r.webhookDeliveryVerified,false);assert.equal(f.calls.length,5);
 assert.equal((await reconcileSandboxReference(fixture({page:[page]}).inputs)).paymentId,'900');
});
test('invalid scope, expired receipts or refund without approval rejected before network',async()=>{
 for(const override of [{intent:{...intent,sellerId:buyer}},{ready:{...ready,reference:'bad'}},{intent:{...intent,createdAt:'2026-10-01T00:00:00Z'}},{phase:'refunded'},{token:''}]){const f=fixture();await assert.rejects(reconcileSandboxReference({...f.inputs,...override}));assert.equal(f.calls.length,0);}
});
test('seller, buyer and preference must all match test receipt',async()=>{
 for(const o of [{seller:{id:1234,site_id:'MLA',tags:[]}},{buyer:{id:5678,site_id:'MLB',tags:['test_user']}},{preference:{...preference,notification_url:'https://alertasapd.com.ar/webhook'}},{preference:{...preference,items:[{...preference.items[0],unit_price:100}]}}]){
  const f=fixture(o);await assert.rejects(reconcileSandboxReference(f.inputs));assert.ok(!f.calls.includes('/v1/payments/search'));
 }
});
test('incomplete pagination, no payment or multiple payments never become evidence',async()=>{
 for(const p of [{paging:{total:0,offset:0},results:[]},{paging:{total:2,offset:0},results:[payment,payment]},{paging:{total:2,offset:0},results:[payment]},{paging:{total:1,offset:1},results:[payment]},{results:[payment]}]){
  const f=fixture({page:p});await assert.rejects(reconcileSandboxReference(f.inputs));assert.equal(f.calls.length,4);
 }
});
test('exact provider detail denies real mode, wrong payer, amount, reference, status and date',async()=>{
 for(const override of [{live_mode:true},{live_mode:undefined},{payer:{id:9999}},{transaction_amount:1999},{external_reference:'wrong'},{status:'pending'},{date_approved:'2026-11-24T00:00:00Z'},{transaction_amount_refunded:1}]){
  await assert.rejects(reconcileSandboxReference(fixture({payment:{...payment,...override}}).inputs));
 }
});
test('refund must be complete and refer to identical prior approved payment and timestamp',async()=>{
 const prev=await reconcileSandboxReference(fixture().inputs),returned={...payment,status:'refunded',transaction_amount_refunded:2000,date_last_updated:'2026-11-26T18:34:00Z'};
 const r=await reconcileSandboxReference({...fixture({payment:returned}).inputs,phase:'refunded',previous:prev});
 assert.equal(r.refundedArs,2000);assert.equal(r.paymentId,prev.paymentId);
 for(const override of [{transaction_amount_refunded:1000},{status:'approved'},{date_approved:'2026-11-26T18:32:00Z'}])await assert.rejects(reconcileSandboxReference({...fixture({payment:{...returned,...override}}).inputs,phase:'refunded',previous:prev}));
 const another={...returned,id:901};const f=fixture({page:{...page,results:[another]},payment:another});await assert.rejects(reconcileSandboxReference({...f.inputs,phase:'refunded',previous:prev}));assert.equal(f.calls.length,4);
});
test('private evidence is exclusive, not overwritten or read via symlink',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apd-sandbox-evidence-'));
 try{const store=privateEvidence(dir,reference);store.write('approved',{fixture:true});assert.deepEqual(store.read('approved'),{fixture:true});assert.throws(()=>store.write('approved',{fixture:false}));fs.symlinkSync(path.join(dir,reference+'.approved.json'),path.join(dir,reference+'.refunded.json'));assert.throws(()=>store.read('refunded'));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
