// Explicit read-only test-payment verification. Never accepts a production payment.
// This is not an automated purchase and does not prove that a token alone is test-only.
import {pathToFileURL} from 'node:url';
export async function inspectSandboxPayment({token,paymentId,expectedReference,transport=fetch}){
 if(typeof token!=='string'||!token.trim()||typeof paymentId!=='string'||!/^[0-9]{1,30}$/.test(paymentId)||typeof expectedReference!=='string'||!/^apd-sandbox-[a-zA-Z0-9-]{8,100}$/.test(expectedReference))throw Error('Explicit sandbox token, test payment ID and QA reference required');
 const response=await transport(new URL('https://api.mercadopago.com/v1/payments/'+paymentId),{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token}});
 if(!response.ok)throw Error('Test payment lookup rejected');
 const p=await response.json();
 if(String(p?.id)!==paymentId||p.live_mode!==false||p.external_reference!==expectedReference||p.currency_id!=='ARS'||p.transaction_amount!==2000||p.status!=='approved'||p.transaction_amount_refunded!==0)throw Error('Test payment contract not verified');
 return {verifiedTestPayment:true,liveMode:false,amountArs:2000,status:'approved',providerWrites:0,databaseWrites:0};
}
// Separate evidence path for the disposable checkout fixture. It never grants access,
// initiates a payment/refund, or relaxes the production payment adapter.
export async function inspectSandboxLifecycle({token,paymentId,expectedReference,expectedSellerId,phase,transport=fetch}){
 const numeric=v=>typeof v==='string'&&/^[0-9]{1,30}$/.test(v);
 const reference=typeof expectedReference==='string'&&(
  /^apd-sandbox-[a-zA-Z0-9-]{8,100}$/.test(expectedReference)||
  /^00000000-0000-4000-8000-000000000007:COMPLETO:[0-9]{1,20}$/.test(expectedReference));
 if(typeof token!=='string'||!token.trim()||!numeric(paymentId)||!numeric(expectedSellerId)||!reference||!['approved','refunded'].includes(phase))throw Error('Explicit disposable sandbox scope required');
 const get=async path=>{
  const response=await transport(new URL(path,'https://api.mercadopago.com'),{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token}});
  if(!response.ok)throw Error('Sandbox metadata lookup rejected');
  return response.json();
 };
 const seller=await get('/users/me');
 if(String(seller?.id)!==expectedSellerId||seller.site_id!=='MLA'||!Array.isArray(seller.tags)||!seller.tags.includes('test_user'))throw Error('Argentina test seller not verified');
 const payment=await get('/v1/payments/'+paymentId);
 if(String(payment?.id)!==paymentId||String(payment.collector_id)!==expectedSellerId||payment.live_mode!==false||payment.external_reference!==expectedReference||payment.currency_id!=='ARS'||payment.transaction_amount!==2000||payment.status!==phase||payment.transaction_amount_refunded!==(phase==='refunded'?2000:0))throw Error('Sandbox payment lifecycle not verified');
 return {verifiedTestSeller:true,verifiedTestPayment:true,liveMode:false,amountArs:2000,status:phase,refundedArs:payment.transaction_amount_refunded,providerWrites:0,databaseWrites:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 // No fallback to production MERCADOPAGO_ACCESS_TOKEN. Never print IDs or token.
 try{const args={token:process.env.APD_MP_SANDBOX_ACCESS_TOKEN,paymentId:process.env.APD_MP_SANDBOX_PAYMENT_ID,expectedReference:process.env.APD_MP_SANDBOX_REFERENCE};const result=process.env.APD_MP_SANDBOX_PHASE?await inspectSandboxLifecycle({...args,expectedSellerId:process.env.APD_MP_SANDBOX_SELLER_ID,phase:process.env.APD_MP_SANDBOX_PHASE}):await inspectSandboxPayment(args);console.log('APD_SANDBOX_PAYMENT '+JSON.stringify(result));}catch{console.error('Sandbox payment not verified; no writes attempted.');process.exitCode=1;}
}
