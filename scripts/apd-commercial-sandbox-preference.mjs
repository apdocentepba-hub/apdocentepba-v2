// Explicit local operator tool. No production credentials, databases or automatic payments.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const API='https://api.mercadopago.com';
const NOTIFY='https://apd-sandbox.invalid/webhook';
const ACK='CREATE_ONE_TEST_PREFERENCE_NO_REAL_PAYMENT';
const numeric=v=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v);
const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9-]{8,180}$/.test(v);
const safeRef=v=>typeof v==='string'&&/^apd-sandbox-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
function idString(v){return typeof v==='number'&&Number.isSafeInteger(v)?String(v):typeof v==='string'?v:'';}
function testIdentity(p,id){return idString(p?.id)===id&&p.site_id==='MLA'&&Array.isArray(p.tags)&&p.tags.includes('test_user');}
function checkoutLink(raw,id){
 let u;try{u=new URL(raw);}catch{throw Error('Sandbox link not verified');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||
 !((u.hostname==='sandbox.mercadopago.com'&&u.pathname==='/mla/checkout/pay')||
 (u.hostname==='www.mercadopago.com'&&u.pathname==='/mla/checkout/start'))||
 u.searchParams.getAll('pref_id').length!==1||u.searchParams.get('pref_id')!==id)throw Error('Sandbox link not verified');
 return u.href;
}
export async function createSandboxPreference({token,sellerId,buyerId,reference,ack,receipt,transport=fetch,now=Date.now}){
 if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token)||!numeric(sellerId)||!numeric(buyerId)||sellerId===buyerId||!safeRef(reference)||ack!==ACK||typeof receipt?.begin!=='function'||typeof receipt?.complete!=='function')throw Error('Explicit isolated sandbox parameters required');
 const request=async(method,endpoint,body)=>{
  const u=new URL(endpoint,API);if(u.origin!==API)throw Error('Unexpected provider endpoint');
  let res;try{res=await transport(u,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{throw Error('Provider request uncertain; do not retry creation');}
  if(!res.ok)throw Error('Provider request rejected; reconcile before retry');
  try{return await res.json();}catch{throw Error('Provider response uncertain; do not retry creation');}
 };
 const seller=await request('GET','/users/me');
 if(!testIdentity(seller,sellerId))throw Error('Seller is not the exact Argentine test account');
 const buyer=await request('GET','/users/'+buyerId);
 if(!testIdentity(buyer,buyerId))throw Error('Buyer test identity not verified');
 // Reserve the intent locally BEFORE the first and only preference POST.
 // A failed or ambiguous operation must not be retried or removed automatically.
 await receipt.begin({reference,sellerId,buyerId,status:'intent',createdAt:new Date(now()).toISOString()});
 const query=new URL('/checkout/preferences/search',API);query.searchParams.set('external_reference',reference);
 const existing=await request('GET',query.href);
 if(existing?.total!==0||!Array.isArray(existing.elements)||existing.elements.length!==0)throw Error('Reference is not proven unused; reconcile manually');
 const stamp=now();
 const body={external_reference:reference,items:[{id:'APD-QA-COMPLETO',title:'AlertasAPD — PRUEBA SIN DINERO REAL',quantity:1,currency_id:'ARS',unit_price:2000}],notification_url:NOTIFY,expires:true,expiration_date_from:new Date(stamp-60000).toISOString(),expiration_date_to:new Date(stamp+3600000).toISOString()};
 const preference=await request('POST','/checkout/preferences',body);
 const item=preference?.items?.[0];
 if(!safeId(preference?.id)||idString(preference.collector_id)!==sellerId||preference.external_reference!==reference||preference.notification_url!==NOTIFY||preference.items.length!==1||item?.id!=='APD-QA-COMPLETO'||item.currency_id!=='ARS'||item.quantity!==1||Number(item.unit_price)!==2000)throw Error('Preference not verified; reconcile manually');
 const verified=await request('GET','/checkout/preferences/'+preference.id);
 const vi=verified?.items?.[0];
 if(verified?.id!==preference.id||idString(verified.collector_id)!==sellerId||verified.external_reference!==reference||verified.notification_url!==NOTIFY||verified.items.length!==1||vi?.id!=='APD-QA-COMPLETO'||vi.currency_id!=='ARS'||vi.quantity!==1||Number(vi.unit_price)!==2000)throw Error('Preference readback failed; reconcile manually');
 // Mercado Pago documents init_point for a test-seller checkout and sandbox_init_point
 // as an API response. Only these exact official Argentine routes are accepted.
 const url=checkoutLink(verified.init_point,verified.id);
 const sandboxUrl=verified.sandbox_init_point?checkoutLink(verified.sandbox_init_point,verified.id):null;
 const result={status:'ready_test_only',reference,preferenceId:verified.id,checkoutUrl:url,sandboxUrl,verifiedTestSeller:true,verifiedTestBuyer:true,amountArs:2000,paymentCreated:false,databaseWrites:0,notificationDeliveryTested:false};
 await receipt.complete(result);
 return result;
}
// Store intent and result as separate exclusive files; never overwrite an ambiguous intent.
export function privateReceipt(directory,reference){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||!safeRef(reference))throw Error('Explicit private receipt directory required');
 if(!fs.statSync(directory).isDirectory())throw Error('Receipt directory missing');
 const root=fs.realpathSync(directory),repo=fs.realpathSync(process.cwd());
 if(root===repo||root.startsWith(repo+path.sep))throw Error('Receipt must stay outside the current working directory');
 const write=(suffix,value)=>{
  const file=path.join(root,reference+suffix+'.json');
  const fd=fs.openSync(file,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 };
 return {begin:v=>write('.intent',v),complete:v=>write('.ready',v)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const e=process.env,reference=e.APD_MP_SANDBOX_REFERENCE;
  const result=await createSandboxPreference({token:e.APD_MP_SANDBOX_ACCESS_TOKEN,sellerId:e.APD_MP_SANDBOX_SELLER_ID,buyerId:e.APD_MP_SANDBOX_BUYER_ID,reference,ack:e.APD_MP_SANDBOX_CREATE_ACK,receipt:privateReceipt(e.APD_MP_SANDBOX_RECEIPT_DIR,reference)});
  // Do not print links, identifiers, tokens or provider bodies to shared logs.
  console.log('APD_SANDBOX_PREFERENCE_READY '+JSON.stringify({testSeller:result.verifiedTestSeller,testBuyer:result.verifiedTestBuyer,amountArs:result.amountArs,paymentCreated:false,databaseWrites:0,privateReceiptWritten:true}));
 }catch{console.error('Sandbox preference not verified. Inspect private intent; never retry an uncertain creation.');process.exitCode=1;}
}
