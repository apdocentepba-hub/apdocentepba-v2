/** UI coordinator for the native client. No secrets in UI snapshots.
 * The current APK uses a fixture transport; real pilot must supply its own.
 */
function createNativeDashboard({client,push=null,now=Date.now}={}){
 if(!client||typeof client.login!=="function")throw Error("missing_client");
 let revision=0,busy=false,disposed=false;
 let state={account:null,offers:[],preferences:null,excluded:0,loading:false,error:null,pushState:"unknown",updatedAt:null};
 const snapshot=()=>({...state,account:state.account?{...state.account}:null,offers:state.offers.filter(o=>o.expiresAt>now()).map(o=>({...o})),preferences:state.preferences?JSON.parse(JSON.stringify(state.preferences)):null});
 const clear=()=>{state={account:null,offers:[],preferences:null,excluded:0,loading:false,error:null,pushState:"unknown",updatedAt:null};};
 async function run(operation){
  if(busy||disposed)throw Error("operation_unavailable");
  busy=true;const epoch=revision;state={...state,loading:true,error:null};
  const valid=()=>{if(disposed||epoch!==revision)throw Error("view_changed");};
  try{await operation(valid);valid();}
  catch(e){
   if(epoch===revision&&!disposed){
    if(!client.account()){clear();}else{state={...state,offers:[],preferences:null,updatedAt:null};}
    state.error="No se pudo confirmar la operación. Revisá tu conexión o volvé a ingresar.";
   }
   throw Error("operation_unconfirmed");
  }finally{busy=false;if(epoch===revision&&!disposed)state.loading=false;}
  return snapshot();
 }
 async function load(valid){
  const account=client.account();if(!account)throw Error("session_required");
  // Never retain a previous set while refreshing.
  state={...state,account,offers:[],preferences:null,updatedAt:null};
  const [alerts,preferences]=await Promise.all([client.alerts(),client.preferences()]);
  valid();if(client.account()?.userId!==account.userId)throw Error("session_changed");
  state={...state,offers:alerts.items,excluded:alerts.excluded,preferences,updatedAt:now()};
 }
 return Object.freeze({
  snapshot,
  login:(email,password)=>run(async valid=>{const account=await client.login(email,password);valid();state.account=account;await load(valid);}),
  refresh:()=>run(load),
  enablePush:()=>run(async valid=>{if(!push||!client.account())throw Error("push_unavailable");const r=await push.enable({consent:true});valid();state.pushState=r.state;}),
  disablePush:()=>run(async valid=>{if(!push||!client.account())throw Error("push_unavailable");const r=await push.disable();valid();state.pushState=r.state;}),
  logout:()=>run(async valid=>{
   if(push&&client.account()){
    const current=await push.status();valid();
    if(current.state==="registered"){const result=await push.disable();valid();if(result.state!=="revoked")throw Error("revocation_unconfirmed");}
    else if(current.state!=="not_registered")throw Error("push_status_unknown");
   }
   client.logoutLocal();clear();
  }),
  dispose(){disposed=true;revision++;client.logoutLocal();clear();}
 });
}
module.exports={createNativeDashboard};
