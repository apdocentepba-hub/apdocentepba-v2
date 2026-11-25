// Only invoked with payment data fetched by the existing authenticated provider flow.
// No provider writes, no direct checkout grants, no legacy payment fallback.
export async function applyCompleteApproval(env,payment,transport=fetch){
 const deny=reason=>({processed:false,reason});
 const reference=typeof payment?.external_reference==='string'?payment.external_reference.trim():'';
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:COMPLETO:[0-9]{1,20}$/i.test(reference))return deny('invalid_complete_reference');
 if(payment.live_mode!==true)return deny('unverified_payment_environment');
 const id=typeof payment.id==='number'&&Number.isSafeInteger(payment.id)?String(payment.id):typeof payment.id==='string'?payment.id:'';
 if(!/^[0-9]{1,30}$/.test(id))return deny('invalid_payment_id');
 if(payment.status!=='approved')return deny('complete_payment_not_approved_reconciliation_required');
 if(payment.transaction_amount!==2000||payment.currency_id!=='ARS'||payment.transaction_amount_refunded!==0)return deny('invalid_complete_amount_or_refund');
 if(typeof payment.date_approved!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(payment.date_approved)||!Number.isFinite(Date.parse(payment.date_approved)))return deny('invalid_approval_date');
 const url=new URL(env.SUPABASE_URL);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Invalid database endpoint');
 const key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(typeof key!=='string'||!key.trim())throw Error('Database credential unavailable');
 let res;
 try{
  res=await transport(new URL('/rest/v1/rpc/apd_apply_complete_approval',url),{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({p_payment_id:id,p_reference:reference,p_status:'approved',p_amount:2000,p_currency:'ARS',p_approved_at:payment.date_approved})
  });
 }catch{throw Error('Complete approval reconciliation unavailable');}
 if(!res.ok)throw Error('Complete approval reconciliation unavailable');
 let result;
 try{result=await res.json();}catch{throw Error('Invalid reconciliation result');}
 if(result?.ok===true&&typeof result.duplicate==='boolean')return {processed:true,duplicate:result.duplicate,plan_code:'COMPLETO'};
 if(result?.ok===false&&['invalid_approval','unknown_checkout','ambiguous_checkout','account_unavailable','payment_or_checkout_conflict','checkout_not_eligible','release_disabled'].includes(result.reason))return deny(result.reason);
 throw Error('Unverified reconciliation result');
}
