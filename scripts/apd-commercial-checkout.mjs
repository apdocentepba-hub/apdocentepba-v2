// Server-only checkout orchestration. Production stays disabled until reconciliation and QA gates pass.
export async function completeCheckout({user,body,catalogReady,reserve,finalize,createPreference,webhookUrl}){
 const fail=(status,reason)=>({status,body:{ok:false,reason,message:'No se pudo confirmar la contratación. Revisá el estado antes de reintentar.'}});
 if(!user?.id||user.activo!==true)return fail(401,'unauthenticated');
 if(body?.user_id&&body.user_id!==user.id)return fail(403,'identity_mismatch');
 if(String(body?.plan_code||'').trim().toUpperCase()!=='COMPLETO'||catalogReady!==true)return fail(409,'offer_unavailable');
 const validUrl=v=>{
  try{const u=new URL(v);return u.protocol==='https:'&&['www.mercadopago.com.ar','mercadopago.com.ar'].includes(u.hostname)&&!u.port&&!u.username&&!u.password&&u.pathname.startsWith('/checkout/');}catch{return false;}
 };
 const validRef=v=>typeof v==='string'&&v.startsWith(user.id+':COMPLETO:')&&/^[0-9]{1,20}$/.test(v.slice((user.id+':COMPLETO:').length));
 try{
  const r=await reserve(user.id);
  if(r?.ok!==true)return fail(409,r?.reason||'reservation_unverified');
  if(!validRef(r.reference))return fail(503,'reservation_unverified');
  if(r.mode==='reuse'&&validUrl(r.checkout_url))return {status:200,body:{ok:true,checkout_url:r.checkout_url,plan_code:'COMPLETO',price_ars:2000,reused:true}};
  if(r.mode!=='create')return fail(503,'reservation_unverified');
  const mp=await createPreference({user,plan:{code:'COMPLETO',nombre:'AlertasAPD Completo',descripcion:'30 días de acceso completo, sin renovación automática',price_ars:2000},externalReference:r.reference,webhookUrl});
  if(!validUrl(mp?.checkout_url)||typeof mp?.preference_id!=='string'||!mp.preference_id)return fail(503,'provider_unverified');
  const saved=await finalize(user.id,r.reference,mp.checkout_url,mp.preference_id);
  if(saved?.ok!==true)return fail(503,'persistence_unverified');
  return {status:200,body:{ok:true,checkout_url:mp.checkout_url,plan_code:'COMPLETO',price_ars:2000,reused:false}};
 }catch{return fail(503,'reconciliation_required');}
}
