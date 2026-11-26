import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverCompletePreference as recover} from './apd-commercial-recover-checkout.mjs';
const userId='00000000-0000-4000-8000-000000000007',reference=userId+':COMPLETO:123',preferenceId='fixture-123',env={MERCADOPAGO_ACCESS_TOKEN:'fixture-only'};
const valid={id:preferenceId,external_reference:reference,items:[{id:'COMPLETO',quantity:1,unit_price:2000,currency_id:'ARS'}],init_point:'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=fixture'};
const reply=v=>new Response(JSON.stringify(v));
test('recover existing verified preference without creating checkout or granting access',async()=>{
 let calls=0,saves=0;
 const r=await recover({env,userId,reference,preferenceId,transport:async(url,req)=>{calls++;assert.equal(req.method,'GET');assert.equal(req.redirect,'error');assert.equal(url.href,'https://api.mercadopago.com/checkout/preferences/fixture-123');return reply(valid);},finalize:async(...args)=>{saves++;assert.deepEqual(args,[userId,reference,valid.init_point,preferenceId]);return {ok:true,duplicate:false};}});
 assert.equal(r.recovered,true);assert.equal(calls,1);assert.equal(saves,1);
});
test('wrong owner reference price currency URL expired or unverifiable preference never finalizes',async()=>{
 for(const data of [{...valid,external_reference:'other'},{...valid,id:'other'},{...valid,items:[{...valid.items[0],unit_price:1}]},{...valid,items:[{...valid.items[0],currency_id:'USD'}]},{...valid,init_point:'https://evil.invalid/checkout/x'},{...valid,expires:true,expiration_date_to:'2000-01-01T00:00:00Z'}]){
  const r=await recover({env,userId,reference,preferenceId,transport:async()=>reply(data),finalize:async()=>assert.fail('must not write')});assert.equal(r.ok,false);
 }
});
test('uncertain provider or persistence fails closed',async()=>{
 for(const transport of [async()=>{throw Error('network')},async()=>new Response('',{status:503})])assert.equal((await recover({env,userId,reference,preferenceId,transport,finalize:async()=>assert.fail('must not write')})).ok,false);
 assert.equal((await recover({env,userId,reference,preferenceId,transport:async()=>reply(valid),finalize:async()=>({ok:false})})).ok,false);
});

test('recover by unique external reference, verify full provider details before finalizing',async()=>{
 let count=0;
 const legacy='https://www.mercadopago.com/mla/checkout/start?pref_id=fixture';
 const r=await recover({env,userId,reference,transport:async(url,req)=>{count++;assert.equal(req.method,'GET');if(count===1){assert.equal(url.pathname,'/checkout/preferences/search');assert.equal(url.searchParams.get('external_reference'),reference);assert.equal(url.searchParams.get('site_id'),'MLA');return reply({total:1,elements:[{id:preferenceId}]});}return reply({...valid,init_point:legacy});},finalize:async(...args)=>{assert.equal(args[2],legacy);return {ok:true};}});
 assert.equal(r.checkout_url,legacy);assert.equal(count,2);
 for(const listing of [{total:0,elements:[]},{total:2,elements:[{id:preferenceId}]},{total:1,elements:[{id:'bad/segment'}]}])assert.equal((await recover({env,userId,reference,transport:async()=>reply(listing),finalize:async()=>assert.fail('unsafe finalization')})).ok,false);
});
