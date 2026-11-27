import React,{useState,useRef} from "react";
import {View,Text,Pressable} from "react-native";
import {fetch as expoFetch} from "expo/fetch";
const {runNativeConnectionProbe}=require("./native-connection-probe.js");
export default function NativeConnectionProbe(){
 const [result,setResult]=useState(null),[busy,setBusy]=useState(false);
 const lock=useRef(false);
 const check=async()=>{
  if(lock.current)return;
  lock.current=true;setBusy(true);setResult(null);
  try{setResult(await runNativeConnectionProbe({fetchImpl:expoFetch,enabled:true}));}
  catch{setResult({ok:false,checks:[]});}
  finally{lock.current=false;setBusy(false);}
 };
 return <View style={{backgroundColor:"#F1F6FB",borderRadius:12,padding:14,gap:8}}>
  <Text style={{fontWeight:"800",color:"#082C43"}}>Diagnóstico de conexión</Text>
  <Text style={{color:"#657A8B"}}>Comprueba la conexión con AlertasAPD y el rechazo de accesos sin sesión. No envía credenciales ni consulta tus datos.</Text>
  <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={check} style={{backgroundColor:"#087F86",padding:12,borderRadius:10}}>
   <Text style={{color:"#FFF",fontWeight:"700",textAlign:"center"}}>{busy?"Comprobando…":"Comprobar conexión sin iniciar sesión"}</Text>
  </Pressable>
  {result?<><Text accessibilityLiveRegion="polite" style={{fontWeight:"700",color:result.ok?"#087F86":"#963A1C"}}>{result.ok?"Conexión y protección sin sesión verificadas":"Conexión no confirmada"}</Text>
  {result.checks.map(c=><Text key={c.path} style={{color:"#17374C"}}>{c.ok?"OK":"ERROR"} · {c.path} · {c.status??"sin respuesta"}</Text>)}
  <Text style={{color:"#657A8B"}}>El ingreso real sigue deshabilitado. Esta prueba no certifica el bloqueo de redirecciones.</Text></>:null}
 </View>;
}
