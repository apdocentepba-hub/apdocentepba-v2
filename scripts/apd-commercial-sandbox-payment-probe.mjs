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
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 // No fallback to production MERCADOPAGO_ACCESS_TOKEN. Never print IDs or token.
 try{console.log('APD_SANDBOX_PAYMENT '+JSON.stringify(await inspectSandboxPayment({token:process.env.APD_MP_SANDBOX_ACCESS_TOKEN,paymentId:process.env.APD_MP_SANDBOX_PAYMENT_ID,expectedReference:process.env.APD_MP_SANDBOX_REFERENCE})));}catch{console.error('Sandbox payment not verified; no writes attempted.');process.exitCode=1;}
}
