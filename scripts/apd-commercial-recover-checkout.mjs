// Read-only Mercado Pago lookup; only finalize a known reserved checkout.
// The caller must be a trusted operator/server, never a public route.
export async function recoverCompletePreference({env,userId,reference,preferenceId,finalize,transport=fetch}){
 const deny=reason=>({ok:false,reason});
 if(typeof userId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))return deny('invalid_owner');
 if(typeof reference!=='string'||!reference.startsWith(userId+':COMPLETO:')||!/^[0-9]{1,20}$/.test(reference.slice((userId+':COMPLETO:').length)))return deny('invalid_reference');
 if(typeof preferenceId!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(preferenceId))return deny('invalid_preference');
 const token=env.MERCADOPAGO_ACCESS_TOKEN;
 if(typeof token!=='string'||!token.trim())return deny('provider_unavailable');
 try{
  const res=await transport(new URL('https://api.mercadopago.com/checkout/preferences/'+encodeURIComponent(preferenceId)),{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token}});
  if(!res.ok)return deny('provider_unverified');
  const data=await res.json();
  if(data?.id!==preferenceId||data.external_reference!==reference||!Array.isArray(data.items)||data.items.length!==1)return deny('provider_mismatch');
  const item=data.items[0];
  if(item.id!=='COMPLETO'||item.currency_id!=='ARS'||item.quantity!==1||item.unit_price!==2000)return deny('provider_mismatch');
  const url=new URL(data.init_point);
  if(url.protocol!=='https:'||!['www.mercadopago.com.ar','mercadopago.com.ar'].includes(url.hostname)||url.port||url.username||url.password||!url.pathname.startsWith('/checkout/'))return deny('unsafe_checkout');
  if(data.expires===true&&(!Number.isFinite(Date.parse(data.expiration_date_to))||Date.parse(data.expiration_date_to)<=Date.now()))return deny('expired_preference');
  const result=await finalize(userId,reference,url.href,preferenceId);
  if(result?.ok!==true)return deny('persistence_unverified');
  return {ok:true,recovered:true,duplicate:result.duplicate===true};
 }catch{return deny('reconciliation_required');}
}
