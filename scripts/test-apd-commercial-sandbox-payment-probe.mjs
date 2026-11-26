import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSandboxPayment as inspect} from './apd-commercial-sandbox-payment-probe.mjs';
const args={token:'fixture-only',paymentId:'123',expectedReference:'apd-sandbox-fixture-123'};
const valid={id:123,live_mode:false,external_reference:args.expectedReference,currency_id:'ARS',transaction_amount:2000,status:'approved',transaction_amount_refunded:0};
test('read-only sandbox evidence; only payment metadata and no provider writes',async()=>{
 let calls=0;
 const r=await inspect({...args,transport:async(url,opts)=>{calls++;assert.equal(url.href,'https://api.mercadopago.com/v1/payments/123');assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');return new Response(JSON.stringify(valid));}});
 assert.equal(calls,1);assert.equal(r.verifiedTestPayment,true);assert.equal(r.providerWrites,0);
});
test('reject real, unknown, mismatched, refunded or pending payments',async()=>{
 for(const changed of [{live_mode:true},{live_mode:undefined},{id:124},{transaction_amount:1},{currency_id:'USD'},{status:'pending'},{external_reference:'other'},{transaction_amount_refunded:1}]){
  await assert.rejects(inspect({...args,transport:async()=>new Response(JSON.stringify({...valid,...changed}))}));
 }
 await assert.rejects(inspect({...args,token:'',transport:async()=>assert.fail('no request')}));
});
