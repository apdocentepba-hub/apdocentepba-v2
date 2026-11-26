// Disposable integration harness. Uses commercial checkout orchestration and the
// same PostgreSQL RPCs; it is not a native Cloudflare Worker deployment.
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {completeCheckout} from '../../scripts/apd-commercial-checkout.mjs';
export const UID='00000000-0000-4000-8000-000000000007';
const referencePattern=new RegExp('^'+UID+':COMPLETO:[0-9]{1,20}$');
const same=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
export function paymentCommand(p,{sellerId,reference}){
 if(!referencePattern.test(reference)||!/^\d{1,30}$/.test(String(p?.id))||p.live_mode!==false||String(p.collector_id)!==String(sellerId)||p.external_reference!==reference||p.transaction_amount!==2000||p.currency_id!=='ARS')throw Error('Unverified sandbox payment');
 const args={p_payment_id:String(p.id),p_reference:reference};
 if(p.status==='refunded'&&p.transaction_amount_refunded===2000)return {name:'apd_review_complete_payment',args:{...args,p_disposition:'revoke'}};
 if(p.status!=='approved'||p.transaction_amount_refunded!==0||typeof p.date_approved!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(p.date_approved)||!Number.isFinite(Date.parse(p.date_approved)))throw Error('Unsupported sandbox state');
 return {name:'apd_apply_complete_approval',args:{...args,p_status:'approved',p_amount:2000,p_currency:'ARS',p_approved_at:p.date_approved}};
}
export function verifyWebhook({signature,requestId,id,secret,now=Date.now()}){
 if(typeof secret!=='string'||secret.length<8||typeof requestId!=='string'||!requestId||requestId.length>200||!/^\d{1,30}$/.test(id)||typeof signature!=='string')return false;
 const parts=signature.split(',').map(v=>v.trim().split('='));
 if(parts.length!==2||parts.some(p=>p.length!==2)||new Set(parts.map(p=>p[0])).size!==2)return false;
 const entries=Object.fromEntries(parts),ts=entries.ts,sig=entries.v1;
 if(!/^\d{10,13}$/.test(ts)||!/^[a-f0-9]{64}$/.test(sig))return false;
 const ms=ts.length===13?Number(ts):Number(ts)*1000;
 if(Math.abs(now-ms)>5*60*1000)return false;
 return same(sig,createHmac('sha256',secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex'));
}
export function createLabHandler({db,provider,operatorKey='',webhookSecret='',sellerId='',publicOrigin,providerReady=true,now=Date.now}){
 const origin=new URL(publicOrigin).origin;
 const ready=operatorKey.length>=32&&webhookSecret.length>=8&&/^\d{1,30}$/.test(sellerId)&&providerReady;
 const boot=now(),cookie=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');let attempts=0,windowStart=boot;
 const headers={'cache-control':'no-store','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://www.mercadopago.com.ar https://mercadopago.com.ar https://www.mercadopago.com; base-uri 'none'; frame-ancestors 'none'"};
 const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{...headers,'content-type':'application/json'}});
 const page=body=>new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AlertasAPD · Laboratorio</title><style>body{font:18px system-ui;max-width:650px;margin:48px auto;padding:20px;background:#f5f7fb;color:#17243c}button,input{font:inherit;padding:12px;margin:8px 0}form{margin:24px 0}small{display:block;color:#526078}</style><h1>Laboratorio de AlertasAPD</h1><p>Prueba de $2.000 con dinero ficticio.</p>${body}<small>Datos descartables: se pierden al reiniciar. Este ensayo comprueba checkout + PostgreSQL; no ejecuta el Worker de producción.</small></html>`,{headers:{...headers,'content-type':'text/html; charset=utf-8'}});
 const logged=r=>(r.headers.get('cookie')||'').split(';').some(v=>same(v.trim(),'apd_lab='+cookie));
 const bearer=r=>same(r.headers.get('authorization')||'','Bearer '+operatorKey);
 const verifySeller=async()=>{const s=await provider('/users/me');if(String(s.id)!==sellerId||s.site_id!=='MLA'||!Array.isArray(s.tags)||!s.tags.includes('test_user'))throw Error('Test seller not verified');};
 const reconcile=async id=>{
  if(!/^\d{1,30}$/.test(id))throw Error('Invalid ID');
  await verifySeller();const payment=await provider('/v1/payments/'+id);
  const reference=await db.reference();const cmd=paymentCommand(payment,{sellerId,reference});
  const result=await db.rpc(cmd.name,cmd.args);if(result?.ok!==true)throw Error('Reconciliation rejected');
  return {ok:true,status:payment.status,duplicate:result.duplicate===true};
 };
 return async request=>{
  const url=new URL(request.url),path=url.pathname;
  if(path==='/health'&&request.method==='GET')return json({ok:true,sandbox:true,paymentsEnabled:ready&&now()-boot<90*60*1000});
  if(path==='/'&&request.method==='GET'){
   if(!ready)return page('<h2>Laboratorio instalado</h2><p>Los pagos están bloqueados hasta configurar las credenciales de prueba.</p>');
   if(!logged(request))return page('<form action="/session" method="post"><label>Clave del laboratorio<br><input name="key" type="password" required autocomplete="off"></label><br><button>Entrar</button></form>');
   const form=(route,label,input='')=>`<form action="${route}" method="post"><input type="hidden" name="csrf" value="${csrf}">${input}<button>${label}</button></form>`;
   return page('<h2>Prueba habilitada</h2>'+form('/checkout','Abrir pago ficticio de $2.000')+form('/reconcile','Comprobar pago','<label>Número del pago de prueba<br><input name="payment_id" inputmode="numeric" required></label><br>')+form('/refund','Devolver los $2.000 ficticios')+'<p><a href="/status">Ver resultado del plan</a></p>');
  }
  if(!ready||now()-boot>=90*60*1000)return json({ok:false,reason:'laboratory_locked'},503);
  if(path==='/webhook'&&request.method==='POST'){
   const id=url.searchParams.get('data.id');
   if(!verifyWebhook({signature:request.headers.get('x-signature'),requestId:request.headers.get('x-request-id'),id,secret:webhookSecret,now:now()}))return json({ok:false},401);
   try{return json(await reconcile(id));}catch{return json({ok:false,reason:'sandbox_reconciliation_unconfirmed'},503);}
  }
  if(request.method==='POST'&&request.headers.get('origin')!==null&&request.headers.get('origin')!==origin)return json({ok:false},403);
  if(path==='/session'&&request.method==='POST'){
   if(now()-windowStart>60000){windowStart=now();attempts=0;}if(++attempts>20)return json({ok:false},429);
   const body=await request.formData();if(!same(body.get('key')||'',operatorKey))return json({ok:false},401);
   return new Response(null,{status:303,headers:{...headers,location:'/', 'set-cookie':`apd_lab=${cookie}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=5400`}});
  }
  const direct=bearer(request);if(!direct&&!logged(request))return json({ok:false},401);
  let body=null;
  if(request.method==='POST'){
   body=request.headers.get('content-type')?.includes('application/json')?await request.json():Object.fromEntries(await request.formData());
   if(!direct&&!same(body.csrf||'',csrf))return json({ok:false},403);
  }
  try{
   if(path==='/status'&&request.method==='GET')return json({ok:true,...await db.status()});
   if(path==='/reconcile'&&request.method==='POST')return json(await reconcile(String(body?.payment_id||'')));
   if(path==='/checkout'&&request.method==='POST'){
    await verifySeller();
    const result=await completeCheckout({user:{id:UID,activo:true},body:{plan_code:'COMPLETO'},catalogReady:true,reserve:()=>db.rpc('apd_reserve_complete_checkout',{p_user_id:UID}),finalize:(id,reference,checkout,preference)=>db.rpc('apd_finalize_complete_checkout',{p_user_id:id,p_reference:reference,p_url:checkout,p_preference_id:preference}),webhookUrl:origin+'/webhook',createPreference:async({externalReference,webhookUrl})=>{
     if(!referencePattern.test(externalReference))throw Error('Wrong fixture reference');
     const data=await provider('/checkout/preferences','POST',{items:[{id:'COMPLETO',title:'AlertasAPD Completo · PRUEBA',description:'30 días ficticios, sin renovación',quantity:1,currency_id:'ARS',unit_price:2000}],external_reference:externalReference,notification_url:webhookUrl,back_urls:{success:origin+'/',pending:origin+'/',failure:origin+'/'}});
     return {preference_id:data.id,checkout_url:data.init_point};
    }});
    if(result.status!==200)return json(result.body,result.status);
    return direct?json(result.body):new Response(null,{status:303,headers:{...headers,location:result.body.checkout_url}});
   }
   if(path==='/refund'&&request.method==='POST'){
    const state=await db.status();if(!/^\d{1,30}$/.test(state.paymentId||''))throw Error('No verified payment');
    await verifySeller();const payment=await provider('/v1/payments/'+state.paymentId);
    const cmd=paymentCommand(payment,{sellerId,reference:await db.reference()});
    if(cmd.name==='apd_apply_complete_approval')await provider('/v1/payments/'+state.paymentId+'/refunds','POST',{amount:2000},{'X-Idempotency-Key':createHmac('sha256',operatorKey).update('refund:'+state.paymentId).digest('hex')});
    const result=await reconcile(state.paymentId);if(result.status!=='refunded')return json({ok:false,reason:'refund_not_confirmed'},503);
    return json(result);
   }
   return json({ok:false},404);
  }catch{return json({ok:false,reason:'sandbox_operation_unconfirmed'},503);}
 };
}
