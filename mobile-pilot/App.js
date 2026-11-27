import React,{useEffect,useRef,useState} from "react";
import {View,Text,TextInput,Pressable,StyleSheet,ScrollView,Platform} from "react-native";
import * as Notifications from "expo-notifications";
const PROJECT_ID="c032c89f-7c44-49c7-a30f-d8ea0b223053";
Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
export default function App(){
 const [token,setToken]=useState(""),[status,setStatus]=useState("Sin registro"),[busy,setBusy]=useState(false),[received,setReceived]=useState(0);
 const lock=useRef(false),mounted=useRef(true);
 useEffect(()=>{
  mounted.current=true;
  const sub=Notifications.addNotificationReceivedListener(()=>setReceived(n=>n+1));
  return ()=>{mounted.current=false;sub.remove();};
 },[]);
 const register=async()=>{
  if(lock.current)return;
  lock.current=true;setBusy(true);setToken("");setStatus("Verificando permiso…");
  try{
   if(Platform.OS!=="android")throw Error("android_only");
   await Notifications.setNotificationChannelAsync("apd-alertas",{name:"Alertas de actos públicos",importance:Notifications.AndroidImportance.HIGH});
   let p=await Notifications.getPermissionsAsync();if(!p.granted)p=await Notifications.requestPermissionsAsync();
   if(!p.granted){if(mounted.current)setStatus("Permiso rechazado");return;}
   const r=await Notifications.getExpoPushTokenAsync({projectId:PROJECT_ID});
   if(!/^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{16,250}\]$/.test(r.data))throw Error("invalid_token");
   if(mounted.current){setToken(r.data);setStatus("Token obtenido. Falta comprobar la entrega remota.");}
  }catch{if(mounted.current)setStatus("No se pudo obtener el token. Revisá internet, Google Play Services y la configuración FCM.");}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 };
 return <ScrollView contentContainerStyle={s.root}>
 <Text style={s.title}>AlertasAPD</Text><Text style={s.sub}>Piloto privado de notificaciones remotas</Text>
 <Text style={s.body}>No accede a cuentas, ofertas ni pagos. No envía avisos a docentes. Activá el registro únicamente en tu teléfono de prueba.</Text>
 <Pressable disabled={busy} onPress={register} accessibilityRole="button" style={[s.btn,busy&&{opacity:.5}]}><Text style={s.btnText}>{busy?"Registrando…":"Obtener token de prueba"}</Text></Pressable>
 <Text accessibilityLiveRegion="polite" style={s.body}>{status}</Text>
 {token?<><Text style={s.body}>Copiá el token únicamente al probador oficial de Expo. No lo publiques.</Text><TextInput value={token} editable={false} multiline selectTextOnFocus style={s.token}/><Pressable accessibilityRole="button" onPress={()=>{setToken("");setStatus("Token oculto en pantalla; el permiso del sistema no fue revocado.");}}><Text style={s.link}>Ocultar token</Text></Pressable></>:null}
 <Text style={s.body}>Avisos recibidos con pantalla abierta: {received}</Text>
 <Text style={s.body}>Para probar segundo plano, salí con Inicio o bloqueá el teléfono. No uses Forzar detención de Android.</Text>
 </ScrollView>;
}
const s=StyleSheet.create({root:{padding:24,paddingTop:72,gap:18,backgroundColor:"#F1F6FB",flexGrow:1},title:{fontSize:32,fontWeight:"900",color:"#082C43"},sub:{fontSize:18,fontWeight:"700",color:"#087F86"},body:{fontSize:15,lineHeight:23,color:"#17374C"},btn:{padding:16,borderRadius:12,backgroundColor:"#087F86",alignItems:"center"},btnText:{color:"#FFF",fontWeight:"800"},token:{padding:14,backgroundColor:"#FFF",borderColor:"#D9E7EF",borderWidth:1,borderRadius:10,color:"#17374C"},link:{color:"#087F86",fontWeight:"700"}});
