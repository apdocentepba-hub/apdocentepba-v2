/** Validates public Android Firebase config for a separate pilot.
 * Read-only. No provider requests, no billing changes, no credentials emitted.
 * Usage: node scripts/mobile-firebase-pilot-preflight.mjs google-services.json PROJECT_ID EXPO_PROJECT_UUID
 * The expected Firebase project ID must be independently verified by the owner.
 */
import fs from "node:fs";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
export const PILOT_PACKAGE="ar.com.alertasapd.pilot";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbidden=new Set(["private_key","private_key_id","client_secret","refresh_token","service_account","access_token","client_email"]);
function hasSecret(v,depth=0){
 if(depth>20)throw Error("invalid_config_depth");
 if(!v||typeof v!=="object")return false;
 return Object.entries(v).some(([k,val])=>forbidden.has(k.toLowerCase())||typeof val==="string"&&val.includes("-----BEGIN PRIVATE KEY-----")||hasSecret(val,depth+1));
}
export function validatePilotFirebase({document,expectedProjectId,expoProjectId}={}){
 if(typeof expectedProjectId!=="string"||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(expectedProjectId)||typeof expoProjectId!=="string"||!uuid.test(expoProjectId))throw Error("invalid_expected_project_identity");
 if(!document||typeof document!=="object"||Array.isArray(document)||hasSecret(document))throw Error("private_or_invalid_config");
 const info=document.project_info;
 if(info?.project_id!==expectedProjectId||typeof info.project_number!=="string"||!/^\d{5,20}$/.test(info.project_number))throw Error("firebase_project_mismatch");
 if(!Array.isArray(document.client)||document.client.length>100)throw Error("invalid_android_clients");
 const matches=document.client.filter(c=>c?.client_info?.android_client_info?.package_name===PILOT_PACKAGE);
 if(matches.length!==1)throw Error("android_package_missing_or_ambiguous");
 const c=matches[0],appId=c.client_info.mobilesdk_app_id;
 if(typeof appId!=="string"||!appId.startsWith("1:"+info.project_number+":android:")||!/^1:\d+:android:[a-f0-9]+$/i.test(appId)||!Array.isArray(c.api_key)||!c.api_key.some(k=>typeof k?.current_key==="string"&&/^AIza[A-Za-z0-9_-]{25,80}$/.test(k.current_key)))throw Error("android_client_invalid");
 return Object.freeze({ok:true,package:PILOT_PACKAGE,projectId:expectedProjectId,expoProjectId,credentialValuesPrinted:false,remoteRegistrationVerified:false,pushVerified:false,billingVerified:false});
}
function selfTest(){
 const p="alertasapd-pilot",e="11111111-1111-4111-8111-111111111111",client={client_info:{android_client_info:{package_name:PILOT_PACKAGE},mobilesdk_app_id:"1:123456789:android:abcdef"},api_key:[{current_key:"AIza"+"X".repeat(35)}]};
 const doc={project_info:{project_id:p,project_number:"123456789"},client:[client]};
 const test=(document=doc,expectedProjectId=p,expoProjectId=e)=>validatePilotFirebase({document,expectedProjectId,expoProjectId});
 assert.equal(test().ok,true);
 assert.throws(()=>test(doc,"other-project"),/project_mismatch/);
 assert.throws(()=>test(doc,p,"bad"),/identity/);
 assert.throws(()=>test({...doc,private_key:"fixture"}),/private/);
 assert.throws(()=>test({...doc,client:[client,client]}),/ambiguous/);
 assert.throws(()=>test({...doc,client:[]}),/missing/);
 assert.throws(()=>test({...doc,client:[{...client,api_key:[]}]}),/invalid/);
 assert.ok(!JSON.stringify(test()).includes("AIza"));
 console.log("PILOT_FIREBASE_PREFLIGHT_SELF_TEST_PASS");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv[2]==="--self-test")selfTest();
  else{
   const [file,expectedProjectId,expoProjectId]=process.argv.slice(2);
   if(!file||fs.statSync(file).size>65536)throw Error("invalid_file");
   const document=JSON.parse(fs.readFileSync(file,"utf8"));
   console.log(JSON.stringify(validatePilotFirebase({document,expectedProjectId,expoProjectId})));
  }
 }catch(e){console.error("Firebase pilot preflight failed; no credential output.");process.exitCode=1;}
}
