import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const m=await import('./lab.mjs').catch(()=>({}));
const ref='00000000-0000-4000-8000-000000000007:COMPLETO:123';
const p={id:123,collector_id:456,live_mode:false,external_reference:ref,currency_id:'ARS',transaction_amount:2000,status:'approved',transaction_amount_refunded:0,date_approved:'2026-11-26T10:00:00Z'};
test('sandbox approval produces only the existing atomic RPC arguments',()=>{
 assert.equal(typeof m.paymentCommand,'function');
 const r=m.paymentCommand(p,{sellerId:'456',reference:ref});assert.equal(r.name,'apd_apply_complete_approval');assert.equal(r.args.p_amount,2000);assert.equal(r.args.p_payment_id,'123');
});
test('real, wrong collector, foreign reference or wrong amount can never reach reconciliation',()=>{
 assert.equal(typeof m.paymentCommand,'function');
 for(const change of [{live_mode:true},{live_mode:undefined},{collector_id:789},{external_reference:'other'},{transaction_amount:1},{currency_id:'USD'},{date_approved:'invalid'}])assert.throws(()=>m.paymentCommand({...p,...change},{sellerId:'456',reference:ref}));
 assert.throws(()=>m.paymentCommand(p,{sellerId:'456',reference:ref.replace('000007','000099')}));
});
test('full refund revokes the fixture subscription; partial or pending payments do not grant access',()=>{
 assert.equal(typeof m.paymentCommand,'function');
 const r=m.paymentCommand({...p,status:'refunded',transaction_amount_refunded:2000},{sellerId:'456',reference:ref});assert.equal(r.name,'apd_review_complete_payment');assert.equal(r.args.p_disposition,'revoke');
 for(const change of [{status:'pending'},{transaction_amount_refunded:1},{status:'refunded',transaction_amount_refunded:0}])assert.throws(()=>m.paymentCommand({...p,...change},{sellerId:'456',reference:ref}));
});
test('webhook requires signature, request ID, exact data ID and recent timestamp',()=>{
 assert.equal(typeof m.verifyWebhook,'function');
 const ts='1795687200',rid='request-test',secret='fixture-secret';
 const sig=createHmac('sha256',secret).update(`id:123;request-id:${rid};ts:${ts};`).digest('hex');
 const input={signature:`ts=${ts},v1=${sig}`,requestId:rid,id:'123',secret,now:Number(ts)*1000};
 assert.equal(m.verifyWebhook(input),true);
 for(const change of [{id:'124'},{requestId:'other'},{secret:'wrong'},{now:(Number(ts)+601)*1000},{signature:`ts=${ts},ts=${ts},v1=${sig}`}])assert.equal(m.verifyWebhook({...input,...change}),false);
});
test('locked deployment exposes health but cannot create preferences, refund or accept webhook',async()=>{
 assert.equal(typeof m.createLabHandler,'function');
 const h=m.createLabHandler({db:{},provider:async()=>assert.fail('provider call'),operatorKey:'',webhookSecret:'',sellerId:'456',publicOrigin:'https://lab.example'});
 assert.equal((await h(new Request('https://lab.example/health'))).status,200);
 for(const path of ['/checkout','/refund','/webhook'])assert.equal((await h(new Request('https://lab.example'+path,{method:'POST',body:'{}'}))).status,503);
});
test('operator routes reject missing auth and browser cross-origin mutation before database access',async()=>{
 assert.equal(typeof m.createLabHandler,'function');
 const h=m.createLabHandler({db:{},provider:async()=>assert.fail('provider call'),operatorKey:'x'.repeat(48),webhookSecret:'fixture-secret',sellerId:'456',publicOrigin:'https://lab.example'});
 assert.equal((await h(new Request('https://lab.example/checkout',{method:'POST'}))).status,401);
 assert.equal((await h(new Request('https://lab.example/checkout',{method:'POST',headers:{authorization:'Bearer '+'x'.repeat(48),origin:'https://foreign.example'}}))).status,403);
});
test('native login forms retain a same-origin Origin and still reject opaque or foreign requests',async()=>{
 const key='x'.repeat(48),origin='https://lab.example';
 const h=m.createLabHandler({db:{},provider:async()=>assert.fail('provider call'),operatorKey:key,webhookSecret:'fixture-secret',sellerId:'456',publicOrigin:origin});
 const page=await h(new Request(origin+'/'));
 assert.equal(page.headers.get('referrer-policy'),'same-origin','no-referrer turns Origin into null on native form POSTs');
 const login=()=>new URLSearchParams({key});
 const accepted=await h(new Request(origin+'/session',{method:'POST',headers:{origin},body:login()}));
 assert.equal(accepted.status,303);assert.match(accepted.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 for(const other of ['null','https://foreign.example'])assert.equal((await h(new Request(origin+'/session',{method:'POST',headers:{origin:other},body:login()}))).status,403);
});
test('authenticated buyer lookup returns only the fixed test nickname after seller validation',async()=>{
 const key='x'.repeat(48),calls=[];
 const provider=async path=>{calls.push(path);return path==='/users/me'?{id:456,site_id:'MLA',tags:['test_user']}:{id:3298351140,site_id:'MLA',tags:['test_user'],nickname:'TESTUSER123456789',email:'not-exposed@example.invalid'};};
 const h=m.createLabHandler({db:{},provider,operatorKey:key,webhookSecret:'fixture-secret',sellerId:'456',publicOrigin:'https://lab.example'});
 assert.equal((await h(new Request('https://lab.example/buyer'))).status,401);assert.equal(calls.length,0);
 const r=await h(new Request('https://lab.example/buyer',{headers:{authorization:'Bearer '+key}}));assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,nickname:'TESTUSER123456789'});assert.deepEqual(calls,['/users/me','/users/3298351140']);
});
test('payment diagnostics require operator authentication before any access',async()=>{
 const h=m.createLabHandler({db:{reference:async()=>assert.fail('database access')},provider:async()=>assert.fail('provider access'),operatorKey:'x'.repeat(48),webhookSecret:'fixture-secret',sellerId:'456',publicOrigin:'https://lab.example'});
 assert.equal((await h(new Request('https://lab.example/diagnose?payment_id=123'))).status,401);
});
test('payment diagnostics expose only predicates and never mutate the disposable database',async()=>{
 const key='x'.repeat(48),calls=[];
 const h=m.createLabHandler({db:{reference:async()=>ref,rpc:async()=>assert.fail('write forbidden')},provider:async(path,method='GET')=>{calls.push([path,method]);return path==='/users/me'?{id:456,site_id:'MLA',tags:['test_user']}:{...p,live_mode:true,payer:{email:'private@example.invalid'},access_token:'do-not-return'};},operatorKey:key,webhookSecret:'fixture-secret',sellerId:'456',publicOrigin:'https://lab.example'});
 const r=await h(new Request('https://lab.example/diagnose?payment_id=123',{headers:{authorization:'Bearer '+key}}));assert.equal(r.status,200);
 const data=await r.json();assert.equal(data.ok,true);assert.equal(data.eligible,false);assert.equal(data.checks.testMode,false);assert.equal(data.checks.referenceMatches,true);assert.equal(data.checks.amountMatches,true);
 assert.deepEqual(Object.keys(data).sort(),['checks','eligible','ok','paymentStatus']);assert.equal(JSON.stringify(data).includes('private@example.invalid'),false);assert.equal(JSON.stringify(data).includes('do-not-return'),false);
 assert.deepEqual(calls,[['/users/me','GET'],['/v1/payments/123','GET']]);
});
test('payment diagnostics reject invalid IDs before provider access',async()=>{
 const key='x'.repeat(48);const h=m.createLabHandler({db:{},provider:async()=>assert.fail('provider access'),operatorKey:key,webhookSecret:'fixture-secret',sellerId:'456',publicOrigin:'https://lab.example'});
 assert.equal((await h(new Request('https://lab.example/diagnose?payment_id=invalid',{headers:{authorization:'Bearer '+key}}))).status,400);
});
test('payment diagnostics report a safe failure stage without provider details',async()=>{
 const key='x'.repeat(48);const h=m.createLabHandler({db:{},provider:async path=>{if(path==='/users/me')return {id:456,site_id:'MLA',tags:['test_user']};throw Error('private token and payload');},operatorKey:key,webhookSecret:'fixture-secret',sellerId:'456',publicOrigin:'https://lab.example'});
 const r=await h(new Request('https://lab.example/diagnose?payment_id=123',{headers:{authorization:'Bearer '+key}}));assert.equal(r.status,503);assert.deepEqual(await r.json(),{ok:false,reason:'sandbox_diagnostics_unconfirmed',stage:'payment_read'});
});
