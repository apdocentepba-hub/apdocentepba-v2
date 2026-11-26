/** Expo SDK native adapter. No action at import time; enrollment controller
 * requests permission/token only after explicit consent and verified session.
 * projectId must be provisioned for this exact app in Expo/FCM.
 */
function createExpoPushPort(Notifications){
 if(!Notifications||typeof Notifications.getExpoPushTokenAsync!=="function")throw Error("expo_push_unavailable");
 return Object.freeze({
  ensureChannel:()=>Notifications.setNotificationChannelAsync("apd-alertas",{
   name:"Alertas de actos públicos",importance:Notifications.AndroidImportance.HIGH
  }),
  getPermissions:()=>Notifications.getPermissionsAsync(),
  requestPermissions:()=>Notifications.requestPermissionsAsync(),
  async getExpoToken(projectId){
   const result=await Notifications.getExpoPushTokenAsync({projectId});
   return result?.data;
  }
 });
}
module.exports={createExpoPushPort};
