/**
 * APDocentePBA - strict server-side session gate for *future* mobile push.
 * LAB ONLY. No DB, Worker or production effects.
 *
 * Explicitly refuses the legacy "bearer == user UUID" fallback. The token
 * must match an existing active, unexpired session belonging to an active user.
 * Dependency callbacks are trusted server-side repositories, not client code.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid=x=>typeof x==="string"&&UUID.test(x);
export async function verifyStrictMobileSession({
 authorization,
 loadSessionByToken,
 loadUserById,
 now=Date.now()
}={}){
 if(typeof authorization!=="string"||
    !/^Bearer [A-Za-z0-9._~-]{24,512}$/.test(authorization))return null;
 if(typeof loadSessionByToken!=="function"||
    typeof loadUserById!=="function"||
    !Number.isFinite(Number(now)))return null;
 const token=authorization.slice(7);
 // Even if a real user's UUID is submitted, never treat it as a session.
 // A UUID-shaped bearer is valid only when the sessions table contains
 // that exact active token; user IDs alone are never authenticated.
 let session,user;
 try{
  session=await loadSessionByToken(token);
  if(!session||session.token!==token||session.activo!==true||
     !uuid(session.user_id)||typeof session.expires_at!=="string")return null;
  const expiry=Date.parse(session.expires_at);
  if(!Number.isFinite(expiry)||expiry<=Number(now))return null;
  user=await loadUserById(session.user_id);
  if(!user||!uuid(user.id)||user.id!==session.user_id||user.activo!==true)return null;
 }catch{return null;}
 // Never return bearer, session ID, emails, names or secrets to a handler.
 return Object.freeze({userId:user.id,sessionVerified:true});
}
