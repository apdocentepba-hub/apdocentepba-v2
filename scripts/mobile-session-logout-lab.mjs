/** Candidate logout route. No route mounted in production.
 * Exact token only, never a user id or password; idempotent confirmed revoke.
 */
export function createMobileSessionLogoutLab({revokeSession}={}){
 if(typeof revokeSession!=='function')throw Error('missing_session_repository');
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 return async function handle(request){
  const url=new URL(request.url);
  if(url.pathname!=='/api/account/logout'||url.search)return reply(404,{ok:false});
  if(request.method!=='POST')return reply(405,{ok:false});
  const header=request.headers.get('authorization')||'';
  if(!/^Bearer [a-f0-9]{64}$/.test(header))return reply(401,{ok:false});
  try{
   // No request body is used to identify a session.
   if(await revokeSession({token:header.slice(7)})!==true)return reply(401,{ok:false});
   return reply(200,{ok:true,revoked:true});
  }catch{return reply(503,{ok:false});}
 };
}
