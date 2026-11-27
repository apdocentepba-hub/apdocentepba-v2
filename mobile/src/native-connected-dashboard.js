/** Composes the connected account/dashboard contract. NOT mounted by App.js.
 * The caller must explicitly enable a separately reviewed connected build.
 * No automatic registration, persisted session or production request on construction.
 */
const {createNativeWorkerTransport}=require("./native-worker-transport.js");
const {createNativeAccountClient}=require("./native-account-client.js");
const {createNativePushEnrollment}=require("./native-push-enrollment.js");
const {createNativeDashboard}=require("./native-dashboard.js");
function createConnectedNativeDashboard({enabled=false,fetchImpl,notifications,deviceId,projectId,platform="android",now=Date.now}={}){
 if(enabled!==true)throw Error("connected_dashboard_disabled");
 const request=createNativeWorkerTransport({enabled:true,fetchImpl});
 const client=createNativeAccountClient({request,now});
 // Account client consumes HTTP status + data; enrollment expects validated JSON.
 const requestPush=async input=>{
  const response=await request(input);
  if(response?.status===401){client.logoutLocal();throw Error("session_expired");}
  if(!response||response.status<200||response.status>=300||response.data?.ok!==true)throw Error("enrollment_unconfirmed");
  return response.data;
 };
 const push=createNativePushEnrollment({getSession:client.getSession,notifications,request:requestPush,deviceId,projectId,platform});
 return createNativeDashboard({client,push,requireRemoteLogout:true,now});
}
module.exports={createConnectedNativeDashboard};
