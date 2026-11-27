/** APD mobile private route composition, candidate only.
 * No default fetch, deployment, cron, provider or live bindings.
 * Caller supplies the trusted server repositories and actual entitlement verifier.
 * Never substitute a client-supplied plan or enable this from a request header.
 */
import {createMobilePushDeviceHandlerLab} from './mobile-push-endpoint-lab.mjs';
import {createPersistentMobileRegistryLab} from './mobile-device-persistent-registry-lab.mjs';
import {createMobileSessionLogoutLab} from './mobile-session-logout-lab.mjs';
const ROOT='/api/mobile/devices',LOGOUT='/api/account/logout';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const deny=(status)=>Response.json({ok:false},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createMobilePrivateRoutesCandidate({
 enabled=false,adapter,loadSessionByToken,loadUserById,verifyPlan,encryptionKey,hmacKey
}={}){
 if(enabled!==true)return async request=>{
  const p=new URL(request.url).pathname;
  return p===ROOT||p.startsWith(ROOT+'/')||p===LOGOUT?deny(404):null;
 };
 if(typeof adapter?.revokeSession!=='function'||typeof loadSessionByToken!=='function'||typeof loadUserById!=='function'||typeof verifyPlan!=='function')throw Error('missing_private_route_dependencies');
 const registry=createPersistentMobileRegistryLab({adapter,encryptionKey,hmacKey});
 const devices=createMobilePushDeviceHandlerLab({registry,loadSessionByToken,loadUserById,loadPlanByUserId:async userId=>{
  const p=await verifyPlan({userId});
  return p?.user_id===userId&&p.access_active===true?{access_active:true}:null;
 }});
 const logout=createMobileSessionLogoutLab({revokeSession:x=>adapter.revokeSession(x)});
 return async request=>{
  const url=new URL(request.url),path=url.pathname;
  if(path!==LOGOUT&&path!==ROOT&&!path.startsWith(ROOT+'/'))return null;
  if(url.search)return deny(400);
  if(path.startsWith(ROOT+'/')&&!UUID.test(path.slice(ROOT.length+1)))return deny(404);
  if(!/^Bearer [a-f0-9]{64}$/.test(request.headers.get('authorization')||''))return deny(401);
  return path===LOGOUT?logout(request):devices(request);
 };
}
