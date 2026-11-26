import test from 'node:test';
import assert from 'node:assert/strict';
import * as probe from './apd-commercial-sandbox-payment-probe.mjs';
const input={token:'fixture-only',paymentId:'123',expectedReference:'00000000-0000-4000-8000-000000000007:COMPLETO:123',expectedSellerId:'456',phase:'approved'};
const seller={id:456,site_id:'MLA',tags:['test_user']};
const payment={id:123,collector_id:456,live_mode:false,external_reference:input.expectedReference,currency_id:'ARS',transaction_amount:2000,status:'approved',transaction_amount_refunded:0};
const response=value=>new Response(JSON.stringify(value));
function transport(s=seller,p=payment){return async(url,opts)=>{assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.equal(url.origin,'https://api.mercadopago.com');if(url.pathname==='/users/me')return response(s);assert.equal(url.pathname,'/v1/payments/123');return response(p);};}
test('lifecycle verifies test seller and exact disposable checkout before approved evidence',async()=>{
 assert.equal(typeof probe.inspectSandboxLifecycle,'function');
 const report=await probe.inspectSandboxLifecycle({...input,transport:transport()});
 assert.equal(report.verifiedTestSeller,true);assert.equal(report.status,'approved');assert.equal(report.providerWrites,0);assert.equal(report.databaseWrites,0);
 assert.ok(!JSON.stringify(report).includes(input.token));assert.ok(!JSON.stringify(report).includes(input.expectedReference));
});
test('reject real seller, wrong seller, missing test tag or non-Argentina account before payment lookup',async()=>{
 assert.equal(typeof probe.inspectSandboxLifecycle,'function');
 for(const change of [{tags:[]},{tags:undefined},{id:789},{site_id:'MLB'}]){
 let requests=0;await assert.rejects(probe.inspectSandboxLifecycle({...input,transport:async(url)=>{requests++;assert.equal(url.pathname,'/users/me');return response({...seller,...change});}}));assert.equal(requests,1);
 }
});
test('seller verified is not enough: reject real payment, foreign collector, reference or amount',async()=>{
 assert.equal(typeof probe.inspectSandboxLifecycle,'function');
 for(const change of [{live_mode:true},{live_mode:undefined},{collector_id:789},{collector_id:undefined},{external_reference:'another'},{transaction_amount:1},{currency_id:'USD'},{id:789}])await assert.rejects(probe.inspectSandboxLifecycle({...input,transport:transport(seller,{...payment,...change})}));
});
test('verify full refund as a separate observation, never accept partial refund or approval as refund',async()=>{
 assert.equal(typeof probe.inspectSandboxLifecycle,'function');
 const refunded={...payment,status:'refunded',transaction_amount_refunded:2000};
 const result=await probe.inspectSandboxLifecycle({...input,phase:'refunded',transport:transport(seller,refunded)});assert.equal(result.status,'refunded');assert.equal(result.refundedArs,2000);
 for(const change of [{status:'approved'},{transaction_amount_refunded:1},{transaction_amount_refunded:0}])await assert.rejects(probe.inspectSandboxLifecycle({...input,phase:'refunded',transport:transport(seller,{...refunded,...change})}));
});
test('missing scope, invalid phase and non-fixture complete reference rejected without network',async()=>{
 assert.equal(typeof probe.inspectSandboxLifecycle,'function');
 for(const change of [{token:''},{expectedSellerId:''},{expectedSellerId:'abc'},{paymentId:'1/../../users/me'},{phase:'pending'},{phase:undefined},{expectedReference:'00000000-0000-4000-8000-000000000099:COMPLETO:123'}])await assert.rejects(probe.inspectSandboxLifecycle({...input,...change,transport:async()=>assert.fail('network forbidden')}));
});
test('HTTP failure never becomes verified evidence',async()=>{
 assert.equal(typeof probe.inspectSandboxLifecycle,'function');
 await assert.rejects(probe.inspectSandboxLifecycle({...input,transport:async()=>new Response('{}',{status:401})}));
});
