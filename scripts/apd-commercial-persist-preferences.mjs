export async function persistFreePreferences(env,userId,expected,next,transport=fetch){
 const u=new URL(env.SUPABASE_URL),key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||typeof key!=='string'||!key.trim())throw Error('Unverified database endpoint');
 if(next?.user_id!==userId||expected!==null&&expected?.user_id!==userId)throw Error('Invalid account snapshot');
 const r=await transport(new URL('/rest/v1/rpc/apd_save_free_preferences',u),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_user_id:userId,p_expected:expected,p_next:next})});
 if(!r.ok)throw Error('Preference save unconfirmed');
 const data=await r.json();
 if(data?.ok!==true||data.preferences?.user_id!==userId)throw Error('Preference save conflict or unconfirmed');
 return [data.preferences];
}
