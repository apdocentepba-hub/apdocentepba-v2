/** Entire connected controller exercised with synthetic HTTP + notification ports.
 * No real network, credentials, Expo tokens or user records. Explicit demo only.
 */
const {createConnectedNativeDashboard}=require("./native-connected-dashboard.js");
const uid="11111111-1111-4111-8111-111111111111",deviceId="22222222-2222-4222-8222-222222222222",projectId="c032c89f-7c44-49c7-a30f-d8ea0b223053";
function createOfflineDashboard(){
 const token="b".repeat(64),demoEmail="fixture@example.invalid",demoPassword="local-fixture";
 let active=false,registered=false;
 const fetchImpl=async(url,opts)=>{
  const path=new URL(url).pathname;
  const reply=(data,status=200)=>({url,redirected:false,status,ok:status>=200&&status<300,headers:{get:key=>key.toLowerCase()==="content-type"?"application/json":null},text:async()=>JSON.stringify(data)});
  if(path==="/api/login"){
   const p=JSON.parse(opts.body);
   if(p.email!==demoEmail||p.password!==demoPassword)return reply({ok:false},401);
   active=true;return reply({ok:true,user:{id:uid},session_token:token});
  }
  if(!active||opts.headers.Authorization!=="Bearer "+token)return reply({ok:false},401);
  if(path==="/api/account/profile")return reply({ok:true,user:{id:uid,nombre:"Docente de prueba",activo:true}});
  if(path==="/api/account/preferences")return reply({ok:true,preferences:{user_id:uid,distrito_principal:"AVELLANEDA (ejemplo)",cargos:["Matemática"],turnos:["Mañana"],alertas_activas:true}});
  if(path==="/api/mis-alertas"){
   const until=new Date(Date.now()+86400000-10800000).toISOString().slice(0,19)+"Z";
   return reply({ok:true,resultados:[{source_offer_key:"DEMO-NATIVE-1",cargo:"Matemática · ejemplo",escuela:"Escuela ficticia 01",distrito:"AVELLANEDA",turno:"Mañana",revista:"Suplencia",dias_horarios:"Lunes 08:00 a 10:00",finoferta:until,raw:{estado:"PUBLICADA"}},{source_offer_key:"DEMO-NATIVE-2",cargo:"Informática · ejemplo",escuela:"Escuela ficticia 02",distrito:"QUILMES",turno:"Tarde",revista:"Provisional",dias_horarios:"Martes 14:00 a 16:00",finoferta:until,raw:{estado:"PUBLICADA"}}]});
  }
  if(path==="/api/mobile/devices"&&opts.method==="GET")return reply({ok:true,devices:registered?[{id:deviceId,enabled:true,opted_in:true}]:[]});
  if(path==="/api/mobile/devices"&&opts.method==="POST"){
   const p=JSON.parse(opts.body);if(p.device_id!==deviceId||p.opted_in!==true)return reply({ok:false},400);
   registered=true;return reply({ok:true,device:{id:deviceId,enabled:true,opted_in:true,platform:"android",transport:"expo"}});
  }
  if(path==="/api/mobile/devices/"+deviceId&&opts.method==="DELETE"){registered=false;return reply({ok:true,revoked:true});}
  if(path==="/api/account/logout"&&opts.method==="POST"&&!registered){active=false;return reply({ok:true,revoked:true});}
  return reply({ok:false},404);
 };
 const notifications={ensureChannel:async()=>{},getPermissions:async()=>({granted:true}),getExpoToken:async()=>"ExpoPushToken[synthetic_fixture_only]"};
 const dashboard=createConnectedNativeDashboard({enabled:true,fetchImpl,notifications,deviceId,projectId});
 return {dashboard,loginDemo:()=>dashboard.login(demoEmail,demoPassword)};
}
module.exports={createOfflineDashboard};
