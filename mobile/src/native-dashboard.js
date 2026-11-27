/** UI coordinator for the native client. No secrets in UI snapshots.
 * The current APK uses a fixture transport; real pilot must supply its own.
 */
function createNativeDashboard({client,push=null,requireRemoteLogout=false,now=Date.now}={}){
 if(requireRemoteLogout&&typeof client?.logoutRemote!=="function")throw Error("remote_logout_required");
 if(!client||typeof client.login!=="function")throw Error("missing_client");
 let revision=0,busy=false,disposed=false;
 let state={account:null,offers:[],preferences:null,excluded:0,accessRestricted:false,loading:false,error:null,pushState:"unknown",updatedAt:null};
 const snapshot=()=>({...state,account:state.account?{...state.account}:null,offers:state.offers.filter(o=>o.expiresAt>now()).map(o=>({...o})),preferences:state.preferences?JSON.parse(JSON.stringify(state.preferences)):null});
 const clear=()=>{state={account:null,offers:[],preferences:null,excluded:0,accessRestricted:false,loading:false,error:null,pushState:"unknown",updatedAt:null};};
 async function run(operation){
  if(busy||disposed)throw Error("operation_unavailable");
  busy=true;const epoch=revision;state={...state,loading:true,error:null};
  const valid=()=>{if(disposed||epoch!==revision)throw Error("view_changed");};
  try{await operation(valid);valid();}
  catch(e){
   if(epoch===revision&&!disposed){
    if(!client.account()){clear();}else{state={...state,offers:[],preferences:null,accessRestricted:false,updatedAt:null};}
    state.error="No se pudo confirmar la operación. Revisá tu conexión o volvé a ingresar.";
   }
   throw Error("operation_unconfirmed");
  }finally{busy=false;if(epoch===revision&&!disposed)state.loading=false;}
  return snapshot();
 }
 async function load(valid){
  const account=client.account();if(!account)throw Error("session_required");
  // Never retain a previous set while refreshing.
  state={...state,account,offers:[],preferences:null,accessRestricted:false,updatedAt:null};
  const [alerts,preferences]=await Promise.all([client.alerts(),client.preferences()]);
  valid();if(client.account()?.userId!==account.userId)throw Error("session_changed");
  state={...state,offers:alerts.items,excluded:alerts.excluded,accessRestricted:alerts.accessRestricted===true,preferences,updatedAt:now()};
 }
 return Object.freeze({
  snapshot,
  login:(email,password)=>run(async valid=>{const account=await client.login(email,password);valid();state.account=account;await load(valid);}),
  refresh:()=>run(load),
  refreshPushStatus:()=>run(async valid=>{
   if(!push||!client.account())throw Error("push_unavailable");
   state.pushState="unknown";
   const r=await push.status();valid();
   if(!["registered","not_registered"].includes(r.state))throw Error("push_status_unknown");
   state.pushState=r.state;
  }),
  enablePush:()=>run(async valid=>{
   if(!push||!client.account())throw Error("push_unavailable");
   // A lost acknowledgement might mean the previous write succeeded.
   // Always reconcile with the server before repeating registration.
   state.pushState="unknown";
   const current=await push.status();valid();
   if(current.state==="registered"){state.pushState="registered";return;}
   if(current.state!=="not_registered")throw Error("push_status_unknown");
   const r=await push.enable({consent:true});valid();state.pushState=r.state;
  }),
  disablePush:()=>run(async valid=>{
   if(!push||!client.account())throw Error("push_unavailable");
   state.pushState="unknown";
   const r=await push.disable();valid();
   if(r.state!=="revoked")throw Error("revocation_unconfirmed");
   state.pushState="revoked";
  }),
  logout:()=>run(async valid=>{
   if(push&&client.account()){
    state.pushState="unknown";
    const current=await push.status();valid();
    if(current.state==="registered"){const result=await push.disable();valid();if(result.state!=="revoked")throw Error("revocation_unconfirmed");}
    else if(current.state!=="not_registered")throw Error("push_status_unknown");
   }
   if(requireRemoteLogout){const result=await client.logoutRemote();valid();if(result?.revoked!==true)throw Error("logout_unconfirmed");}
   else client.logoutLocal();
   clear();
  }),
  dispose(){disposed=true;revision++;client.logoutLocal();clear();}
 });
}
module.exports={createNativeDashboard};
