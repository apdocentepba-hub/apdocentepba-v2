/**
 * APDocentePBA: account-scoped inbox in real local workerd runtime.
 * All values are synthetic; NO external fetches, DB, API keys or send.
 */
import {createMobileInboxEventLogLab}
 from '../mobile-inbox-event-log-lab.mjs';
import {createMobileInboxSyncHandlerLab}
 from '../mobile-inbox-sync-endpoint-lab.mjs';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const TA='lab_session_user_a_012345678901234567890';
const TB='lab_session_user_b_012345678901234567890';
const repo=createMobileInboxEventLogLab();
const entry=(id,revision,status)=>({
 id:'DEMO-AVISO-00'+id,offerId:'DEMO-APD-00'+id,
 revision,status
});
repo.injectServerEvent({userId:A,event:entry(1,1,'active')});
repo.injectServerEvent({userId:A,event:entry(1,2,'cancelled')});
repo.injectServerEvent({userId:A,event:entry(2,1,'active')});
repo.injectServerEvent({userId:B,event:entry(4,1,'active')});
const tokens=new Map([[TA,A],[TB,B]]);
const handler=createMobileInboxSyncHandlerLab({
 repository:repo,
 loadSessionByToken:async token=>{
  const user_id=tokens.get(token);
  return user_id?{
   token,user_id,activo:true,expires_at:'2099-01-01T00:00:00Z'
  }:null;
 },
 loadUserById:async id=>({id,activo:true})
});
export default {fetch:request=>handler(request)};
