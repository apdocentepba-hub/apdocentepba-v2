// Real local PostgreSQL, simulated provider. Never reads provider credentials.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createDatabase} from './server.mjs';
import {createLabHandler} from './lab.mjs';
const db=createDatabase();await db.verify();
let reference=null,refunded=false,creates=0;
const origin='https://lab.example',key='fixture-operator-key-'.repeat(3),secret='fixture-webhook-secret';
const provider=async(path,method='GET',body)=>{
 if(path==='/users/me'&&method==='GET')return {id:456,site_id:'MLA',tags:['test_user']};
 if(path==='/checkout/preferences'&&method==='POST'){creates++;reference=body.external_reference;assert.equal(body.items[0].unit_price,2000);assert.equal(body.notification_url,origin+'/webhook');return {id:'fixture-pref',init_point:'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=fixture-pref'};}
 if(path==='/v1/payments/700'&&method==='GET')return {id:700,collector_id:456,live_mode:false,external_reference:reference,currency_id:'ARS',transaction_amount:2000,status:refunded?'refunded':'approved',transaction_amount_refunded:refunded?2000:0,date_approved:new Date().toISOString()};
 if(path==='/v1/payments/700/refunds'&&method==='POST'){assert.equal(body.amount,2000);refunded=true;return {status:'approved'};}
 throw Error('Unexpected provider route');
};
const handler=createLabHandler({db,provider,operatorKey:key,webhookSecret:secret,sellerId:'456',publicOrigin:origin});
const call=async(path,body)=>handler(new Request(origin+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}));
assert.equal((await db.status()).plan,'FREE');
assert.equal((await call('/checkout',{price_ars:1,user_id:'foreign'})).status,200);
assert.equal((await call('/checkout',{})).status,200);assert.equal(creates,1);
assert.equal((await db.status()).plan,'FREE');
const ts=String(Math.floor(Date.now()/1000)),rid='fixture-request';
const signature=createHmac('sha256',secret).update(`id:700;request-id:${rid};ts:${ts};`).digest('hex');
const notify=()=>handler(new Request(origin+'/webhook?data.id=700',{method:'POST',headers:{'x-signature':'ts='+ts+',v1='+signature,'x-request-id':rid},body:'{}'}));
assert.equal((await notify()).status,200);assert.equal((await db.status()).plan,'COMPLETO');
assert.equal((await (await notify()).json()).duplicate,true);
assert.equal((await call('/refund',{})).status,200);assert.equal((await db.status()).plan,'FREE');
refunded=false;assert.equal((await notify()).status,503);assert.equal((await db.status()).plan,'FREE');
console.log('APD_LAB_INTEGRATION '+JSON.stringify({realPostgreSQL:true,provider:'simulated',checkoutCreates:creates,approval:true,duplicate:true,refund:true,replayRejected:true,productionWrites:0}));
