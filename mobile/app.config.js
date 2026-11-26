const fs=require("node:fs");
const path=require("node:path");
if(process.env.APD_ANDROID_PROFILE!=="validated-pilot"){
 module.exports=require("./app.json").expo;
}else{
const PROJECT_ID="c032c89f-7c44-49c7-a30f-d8ea0b223053";
const FIREBASE_ID="alertasapd-dd3df";
const PACKAGE="ar.com.alertasapd.pilot";
const file=process.env.GOOGLE_SERVICES_JSON||"./google-services.json";
const resolved=path.resolve(__dirname,file);
// EAS secret file paths are not visible during local CLI config evaluation.
// Prebuild on the actual builder must have this file; Expo then fails if missing.
if(fs.existsSync(resolved)){
 const doc=JSON.parse(fs.readFileSync(resolved,"utf8"));
 const invalid=(v)=>v&&typeof v==="object"&&Object.entries(v).some(([k,x])=>/^(private_key|private_key_id|client_secret|refresh_token|client_email|access_token|service_account)$/i.test(k)||(typeof x==="string"&&x.includes("-----BEGIN PRIVATE KEY-----"))||invalid(x));
 if(invalid(doc)||doc.project_info?.project_id!==FIREBASE_ID||doc.project_info?.project_number!=="432541641942"||!Array.isArray(doc.client)||doc.client.filter(c=>c.client_info?.android_client_info?.package_name===PACKAGE&&c.client_info?.mobilesdk_app_id==="1:432541641942:android:729123387f5828f58c2d77").length!==1)throw Error("Firebase configuration does not match the authorized Android pilot");
}
module.exports={name:"AlertasAPD (Candidato)",slug:"alertasapd",owner:"apdocentepba",version:"0.2.0",orientation:"portrait",scheme:"alertasapdpilot",android:{package:PACKAGE,googleServicesFile:file,permissions:["POST_NOTIFICATIONS"],versionCode:2},plugins:[["expo-notifications",{defaultChannel:"apd-alertas"}]],extra:{eas:{projectId:PROJECT_ID},demoOnly:true,pushEnabled:false,backendEnabled:false,localNotificationsDemo:true},updates:{enabled:false}};

}
