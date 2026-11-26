/** Offline UI harness for the actual native account + dashboard contracts.
 * No external calls, no user input/credentials, no real offers or remote push.
 */
const {createNativeAccountClient}=require("./native-account-client.js");
const {createNativeDashboard}=require("./native-dashboard.js");
const uid="11111111-1111-4111-8111-111111111111";
const demoEmail="fixture@example.invalid",demoPassword="local-fixture";
function createOfflineDashboard(){
 const token="b".repeat(64);
 const request=async r=>{
  if(r.path==="/api/login"&&r.body?.email===demoEmail&&r.body?.password===demoPassword)return {status:200,data:{ok:true,user:{id:uid},session_token:token}};
  if(r.bearer!==token)return {status:401,data:null};
  if(r.path==="/api/account/profile")return {status:200,data:{ok:true,user:{id:uid,nombre:"Docente de prueba",activo:true}}};
  if(r.path==="/api/account/preferences")return {status:200,data:{ok:true,preferences:{user_id:uid,distrito_principal:"AVELLANEDA (ejemplo)",cargos:["Matemática"],turnos:["Mañana"],alertas_activas:true}}};
  if(r.path==="/api/mis-alertas"){
   const until=new Date(Date.now()+86400000-10800000).toISOString().slice(0,19)+"Z";
   return {status:200,data:{ok:true,resultados:[{source_offer_key:"DEMO-NATIVE-1",cargo:"Matemática · ejemplo",escuela:"Escuela ficticia 01",distrito:"AVELLANEDA",turno:"Mañana",revista:"Suplencia",dias_horarios:"Lunes 08:00 a 10:00",finoferta:until,raw:{estado:"PUBLICADA"}},{source_offer_key:"DEMO-NATIVE-2",cargo:"Informática · ejemplo",escuela:"Escuela ficticia 02",distrito:"QUILMES",turno:"Tarde",revista:"Provisional",dias_horarios:"Martes 14:00 a 16:00",finoferta:until,raw:{estado:"PUBLICADA"}}]}};
  }return {status:404,data:null};
 };
 const dashboard=createNativeDashboard({client:createNativeAccountClient({request})});
 return {dashboard,loginDemo:()=>dashboard.login(demoEmail,demoPassword)};
}
module.exports={createOfflineDashboard};
