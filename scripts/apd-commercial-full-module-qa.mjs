// Exact complete candidate module executed in a VM with only synthetic services.
// Do not export source, bind production secrets, use scheduled(), or call external hosts.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
export async function verifyCommercialFullModule(source,realDb=null){
 assert.equal(typeof vm.SourceTextModule,'function','Run with --experimental-vm-modules');
 const uid='00000000-0000-4000-8000-000000000007',other='00000000-0000-4000-8000-000000000099';
 const user={id:uid,nombre:'Fixture',apellido:'QA',email:'fixture@example.invalid',activo:true,es_admin:false};
 const admin={id:other,nombre:'Admin QA',apellido:'Fixture',email:'admin@example.invalid',activo:true,es_admin:true};
 const testAccount={id:'00000000-0000-4000-8000-000000000088',nombre:'APD QA a',apellido:'QA322-123',email:'apd-diary-qa-a@example.invalid',activo:false,es_admin:false};
 const adminToken='fixture-admin-only',accounts=[user,admin,testAccount];
 const origin='https://fixture.invalid',secret='fixture-webhook-only',token='fixture-session-only';
 const dbkey='fixture-db-only',mpkey='fixture-mp-only';
 const env=Object.freeze({SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:dbkey,MERCADOPAGO_ACCESS_TOKEN:mpkey,MERCADOPAGO_WEBHOOK_SECRET:secret,MERCADOPAGO_CURRENCY_ID:'ARS',MERCADOPAGO_WEBHOOK_URL:origin+'/api/mercadopago/webhook'});
 let clock=realDb?Date.now():Date.parse('2026-11-25T20:00:00Z'),payment=null,session=null,providerCreates=0,dbMutations=0,webhookEvents=0,unexpected=0,failFinalize=false,failPayment=false,refunded=false,enrollment=true;
 let ref=realDb?null:uid+':COMPLETO:123';const prefId='fixture-pref-123',checkoutUrl='https://www.mercadopago.com/mla/checkout/start?pref_id='+prefId;
 const iso=ms=>new Date(ms).toISOString();
 const rows=[{id:'trial-qa',user_id:uid,plan_code:'TRIAL_14D',status:'ACTIVE',source:'trial_complete_14d',started_at:iso(clock),trial_ends_at:iso(clock+336*3600000)}];
 const catalog=[['FREE',0,0,1,1],['TRIAL_14D',0,14,5,10],['COMPLETO',2000,0,5,10]].map(([code,price_ars,trial_days,max_distritos,max_cargos])=>({code,nombre:code,price_ars,trial_days,max_distritos,max_cargos,is_active:true,public_visible:code!=='TRIAL_14D',feature_flags:{email:true,telegram:true,whatsapp:code!=='FREE',provincia:code!=='FREE',insights_plus:code!=='FREE'}}));
 const response=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
 const reject=()=>{unexpected++;throw Error('Unexpected synthetic network request');};
 const fetchFixture=async(input,init={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  const method=String(init.method||'GET').toUpperCase(),headers=new Headers(init.headers);
  if(url.origin===origin&&url.pathname.startsWith('/rest/v1/')){
   assert.equal(headers.get('authorization'),'Bearer '+dbkey);
   const name=url.pathname.slice('/rest/v1/'.length);
   if(realDb){
    if(method==='POST'){
     dbMutations++;
     if(name==='rpc/apd_finalize_complete_checkout'&&failFinalize){failFinalize=false;return response({},503);}
     if(name==='rpc/apd_apply_complete_approval'&&failPayment){failPayment=false;return response({},503);}
     if(name==='mercadopago_webhook_events')webhookEvents++;
    }else if(method!=='GET')return reject();
    return await realDb.request(name,url.search,init);
   }
   if(method==='GET'){
    if(name==='subscription_plans')return response(catalog);
    if(name==='apd_commercial_release_control')return response([{enrollment_open:enrollment}]);
    if(name==='sessions'){
     const t=url.searchParams.get('token');if(!t)return response([]);
     const id=t==='eq.'+token?uid:t==='eq.'+adminToken?other:null;
     return response(id?[{token:t.slice(3),user_id:id,activo:true,expires_at:iso(clock+86400000)}]:[]);
    }
    if(name==='users'){
     const id=url.searchParams.get('id');
     if(id)return response(accounts.filter(a=>'eq.'+a.id===id));
     const offset=Number(url.searchParams.get('offset')||0);return response(accounts.slice(offset));
    }
    if(['notification_delivery_logs','worker_runs','errores_sistema'].includes(name))return response([]);
    if(name==='user_subscriptions'){assert.equal(url.searchParams.get('user_id'),'eq.'+uid);return response(rows);}
    if(name==='user_preferences'){assert.equal(url.searchParams.get('user_id'),'eq.'+uid);return response([{user_id:uid,distrito_principal:'AVELLANEDA',otros_distritos:['QUILMES'],cargos:['MAT','FIS'],materias:[],niveles:[],turnos:[],alertas_activas:true,alertas_email:true}]);}
    return reject();
   }
   if(method!=='POST')return reject();
   dbMutations++;
   const args=JSON.parse(init.body);
   if(name==='mercadopago_webhook_events'){webhookEvents++;return response([{}],201);}
   if(name==='rpc/apd_reserve_complete_checkout'){
    assert.equal(args.p_user_id,uid);
    if(!enrollment)return response({ok:false,reason:'release_paused'});
    if(session==='ready')return response({ok:true,mode:'reuse',reference:ref,checkout_url:checkoutUrl});
    if(session==='creating')return response({ok:false,reason:'checkout_in_progress',reference:ref});
    session='creating';return response({ok:true,mode:'create',reference:ref});
   }
   if(name==='rpc/apd_finalize_complete_checkout'){
    assert.equal(args.p_user_id,uid);assert.equal(args.p_reference,ref);assert.equal(args.p_url,checkoutUrl);assert.equal(args.p_preference_id,prefId);
    if(failFinalize){failFinalize=false;return response({},503);}
    session='ready';return response({ok:true,duplicate:false});
   }
   if(name==='rpc/apd_apply_complete_approval'){
    assert.equal(args.p_reference,ref);assert.equal(args.p_amount,2000);assert.equal(args.p_currency,'ARS');
    if(failPayment){failPayment=false;return response({},503);}
    if(refunded)return response({ok:false,reason:'payment_under_review'});
    if(rows.some(r=>r.plan_code==='COMPLETO'))return response({ok:true,duplicate:true});
    rows.unshift({id:'paid-qa',user_id:uid,plan_code:'COMPLETO',status:'ACTIVE',source:'mercadopago_checkout',started_at:iso(clock),current_period_ends_at:iso(clock+720*3600000)});
    return response({ok:true,duplicate:false});
   }
   if(name==='rpc/apd_review_complete_payment'){
    assert.equal(args.p_reference,ref);assert.equal(args.p_disposition,'revoke');
    refunded=true;rows.find(r=>r.plan_code==='COMPLETO').status='CANCELLED';return response({ok:true,duplicate:false,disposition:'revoke'});
   }
   return reject();
  }
  if(url.origin==='https://api.mercadopago.com'){
   assert.equal(headers.get('authorization'),'Bearer '+mpkey);
   if(method==='POST'&&url.pathname==='/checkout/preferences'){
    providerCreates++;const payload=JSON.parse(init.body);
    if(realDb&&ref===null){assert.match(payload.external_reference,new RegExp('^'+uid+':COMPLETO:[0-9]+$'));ref=payload.external_reference;}
    assert.equal(payload.external_reference,ref);assert.equal(payload.items[0].unit_price,2000);assert.equal(payload.items[0].currency_id,'ARS');
    return response({id:prefId,init_point:checkoutUrl});
   }
   if(method==='GET'&&url.pathname==='/checkout/preferences/search'){
    assert.equal(url.searchParams.get('external_reference'),ref);
    return response({total:1,elements:[{id:prefId}]});
   }
   if(method==='GET'&&url.pathname==='/checkout/preferences/'+prefId)return response({id:prefId,external_reference:ref,init_point:checkoutUrl,items:[{id:'COMPLETO',quantity:1,currency_id:'ARS',unit_price:2000}]});
   if(method==='GET'&&url.pathname==='/v1/payments/700')return response(payment);
  }
  return reject();
 };
 const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,TextEncoder,TextDecoder,AbortController,AbortSignal,crypto:webcrypto,atob,btoa,structuredClone,fetch:fetchFixture,Date:class extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}},setTimeout,clearTimeout,console:{log(){},warn(){},error(){},info(){},debug(){}}},{codeGeneration:{strings:false,wasm:false}});
 const module=new vm.SourceTextModule(source,{context,identifier:'apd-candidate-fixture.mjs',importModuleDynamically:async()=>{throw Error('Dynamic import forbidden');}});
 await module.link(async()=>{throw Error('External import forbidden');});await module.evaluate({timeout:3000});
 const worker=module.namespace.default;assert.equal(typeof worker?.fetch,'function');
 const queued=[],ctx={waitUntil:p=>queued.push(Promise.resolve(p)),passThroughOnException:()=>{throw Error('Pass-through forbidden');}};
 const call=async(path,{method='GET',body,auth=false,headers={}}={})=>{
  const h=new Headers(headers);if(auth)h.set('Authorization','Bearer '+(auth==='admin'?adminToken:token));if(body!==undefined)h.set('Content-Type','application/json');
  const request=new Request(origin+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
  let timeout;
  try{
   const result=await Promise.race([worker.fetch(request,env,ctx),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Synthetic route timeout '+path.split('?')[0])),8000);})]);
   assert.ok(result instanceof Response,'Response contract '+path.split('?')[0]);
   const status=result.status;let data;try{data=await result.json();}catch{data=null;}
   await Promise.all(queued.splice(0));
   return {status,data};
  }finally{clearTimeout(timeout);}
 };
 const checks=[];
 const check=async(label,fn)=>{try{await fn();checks.push(label);}catch(e){throw Error('Full module scenario failed: '+label+' ('+e.name+')');}};
 await check('anonymous catalog and private route denial',async()=>{
  assert.equal((await call('/api/version')).status,200);
  const r=await call('/api/planes');assert.equal(r.status,200);assert.equal(r.data.commercial_model,'free_complete_v1');assert.deepEqual(r.data.planes.map(p=>p.code),['FREE','COMPLETO']);
  for(const path of ['/api/mi-plan','/api/account/profile','/api/account/preferences','/api/account/application-diary'])assert.equal((await call(path)).status,401,path);
 });
 await check('admin statistics respect authorization and exclude disabled QA',async()=>{
  for(const path of ['/api/admin/resumen','/api/admin/usuarios']){
   assert.equal((await call(path)).status,401);assert.equal((await call(path,{auth:true})).status,403);
  }
  const summary=await call('/api/admin/resumen',{auth:'admin'});assert.equal(summary.status,200);
  assert.equal(summary.data.resumen.usuarios_total,1);assert.equal(summary.data.resumen.usuarios_activos,1);assert.equal(summary.data.resumen.admins_total,1);assert.equal(summary.data.resumen.qa_total,1);
  const list=await call('/api/admin/usuarios',{auth:'admin'});assert.equal(list.status,200);assert.equal(list.data.total,1);assert.equal(list.data.qa_total,1);assert.equal(list.data.items.length,2);assert.ok(!list.data.items.some(r=>r.id===testAccount.id));
  const audit=await call('/api/admin/usuarios?include_qa=1',{auth:'admin'});assert.equal(audit.status,200);assert.equal(audit.data.items.length,3);assert.equal(audit.data.total,1);
 });
 const plan=async()=>{const r=await call('/api/mi-plan?user_id='+other,{auth:true});assert.equal(r.status,200);assert.equal(r.data.user_id,uid);assert.equal(r.data.access_active,true);return r.data.subscription.plan_code;};
 await check('bearer ownership and trial expiry',async()=>{assert.equal(await plan(),'TRIAL_14D');if(realDb){realDb.expireTrial();clock=Date.now();}else clock+=336*3600000;assert.equal(await plan(),'FREE');});
 const buy=()=>call('/api/mercadopago/create-checkout-link',{method:'POST',auth:true,body:{plan_code:'COMPLETO',price_ars:1}});
 await check('checkout failure recovers same preference and does not charge twice',async()=>{
  failFinalize=true;assert.equal((await buy()).status,503);
  const r=await buy();assert.equal(r.status,200);assert.equal(r.data.recovered,true);assert.equal(r.data.checkout_url,checkoutUrl);
  assert.equal((await buy()).data.reused,true);assert.equal(providerCreates,1);assert.equal(await plan(),'FREE');
 });
 const notify=(signed=true)=>{
  const ts=String(Math.floor(clock/1000)),requestId='fixture-event',signature=createHmac('sha256',secret).update('id:700;request-id:'+requestId+';ts:'+ts+';').digest('hex');
  return call('/api/mercadopago/webhook?data.id=700',{method:'POST',body:{type:'payment',action:'payment.updated',data:{id:'700'}},headers:{'x-request-id':requestId,'x-signature':'ts='+ts+',v1='+(signed?signature:'0'.repeat(64))}});
 };
 await check('pause new admission without invalidating outstanding checkout',async()=>{
  enrollment=false;if(realDb)realDb.pause();
  const r=await call('/api/planes');assert.equal(r.status,200);assert.equal(r.data.commercial_enrollment_open,false);
  const denied=await buy();assert.equal(denied.status,409);assert.equal(denied.data.reason,'release_paused');
  assert.equal(await plan(),'FREE');assert.equal(providerCreates,1);
 });
 await check('signed webhook retries transient failure then applies exact payment once',async()=>{
  payment={id:700,external_reference:ref,live_mode:true,status:'approved',transaction_amount:2000,currency_id:'ARS',transaction_amount_refunded:0,date_approved:iso(clock)};
  assert.equal((await notify(false)).status,401);
  failPayment=true;assert.equal((await notify()).status,503);
  assert.equal((await notify()).status,200);assert.equal(await plan(),'COMPLETO');
  assert.equal((await notify()).data.sync.duplicate,true);assert.equal(realDb?realDb.paidCount():rows.filter(r=>r.plan_code==='COMPLETO').length,1);
 });
 await check('reversal restores free without duplicate activation',async()=>{
  payment={...payment,status:'refunded',transaction_amount_refunded:2000};assert.equal((await notify()).status,200);assert.equal(await plan(),'FREE');
  payment={...payment,status:'approved',transaction_amount_refunded:0};assert.equal((await notify()).status,200);assert.equal(await plan(),'FREE');
 });
 assert.equal(unexpected,0);
 if(realDb)realDb.verifyFinalState();
 return {passed:true,fullModuleExecuted:true,realPostgreSQL:!!realDb,realPostgREST:!!realDb,scenarios:checks,syntheticProviderCreates:providerCreates,...(realDb?{isolatedDatabaseWriteRequests:dbMutations}:{syntheticDatabaseWrites:dbMutations}),syntheticWebhookEvents:webhookEvents,productionWrites:0,cronExecuted:false,externalNetwork:false};
}
