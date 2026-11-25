// Server only. The caller supplies the user ID from verified authentication.
export async function claimCompleteTrial(env,userId,transport=fetch){
 if(typeof userId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))throw Error('Invalid authenticated identity');
 const url=new URL(env.SUPABASE_URL);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Invalid database endpoint');
 const key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(typeof key!=='string'||!key.trim())throw Error('Database service credential unavailable');
 let response;
 try{
  response=await transport(new URL('/rest/v1/rpc/apd_claim_complete_trial',url),{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({p_user_id:userId})
  });
 }catch{throw Error('Trial claim unavailable; retry safely');}
 if(!response.ok)throw Error('Trial claim unavailable; retry safely');
 let r;
 try{r=await response.json();}catch{throw Error('Unverified trial response');}
 if(r?.ok===true&&r.plan_code==='TRIAL_14D'&&typeof r.trial_ends_at==='string'&&Number.isFinite(Date.parse(r.trial_ends_at)))return {ok:true,created:true,trial_ends_at:r.trial_ends_at};
 if(r?.ok===false&&r.reason==='existing_history')return {ok:true,created:false};
 // No silent success, no automatic fallback INSERT, no accidental charge.
 throw Error('Trial claim not confirmed');
}
