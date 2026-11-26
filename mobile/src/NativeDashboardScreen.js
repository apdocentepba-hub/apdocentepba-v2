import React,{useEffect,useMemo,useRef,useState} from "react";
import {View,Text,Pressable,TextInput,StyleSheet,ActivityIndicator} from "react-native";
const {createOfflineDashboard}=require("./native-dashboard-fixture.js");
function Action({label,onPress,disabled=false,secondary=false}){
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled}
 onPress={onPress} style={[s.action,secondary&&s.secondary,disabled&&{opacity:.5}]}>
 <Text style={[s.actionText,secondary&&{color:"#087F86"}]}>{label}</Text></Pressable>;
}
export default function NativeDashboardScreen(){
 const harness=useMemo(()=>createOfflineDashboard(),[]);
 const [view,setView]=useState(()=>harness.dashboard.snapshot());
 const [query,setQuery]=useState("");
 const [busy,setBusy]=useState(false);
 const live=useRef(true),lock=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;harness.dashboard.dispose();};},[harness]);
 const run=async op=>{
  if(lock.current)return;lock.current=true;setBusy(true);
  try{await op();}catch{}finally{
   lock.current=false;if(live.current){setBusy(false);setView(harness.dashboard.snapshot());}
  }
 };
 const search=query.trim().toLowerCase();
 const offers=view.offers.filter(o=>[o.cargo,o.escuela,o.distrito,o.turno].join(" ").toLowerCase().includes(search));
 return <View style={s.card}>
  <Text style={s.eyebrow}>PILOTO NATIVO · SIMULACIÓN SIN CONEXIÓN</Text>
  <Text style={s.title}>{view.account?"Tus oportunidades":"Ingresá a tu panel"}</Text>
  <Text style={s.help}>Cuenta y ofertas ficticias. Esta pantalla prueba la misma lógica de sesión y consulta que usará la aplicación. No ingreses tus credenciales reales.</Text>
  {view.error?<Text accessibilityLiveRegion="polite" style={s.warning}>{view.error}</Text>:null}
  {busy?<ActivityIndicator accessibilityLabel="Procesando" color="#087F86"/>:null}
  {!view.account?<Action label="Ingresar con cuenta de prueba" disabled={busy} onPress={()=>run(harness.loginDemo)}/>:<>
   <Text style={s.name}>{view.account.name}</Text>
   <View style={s.info}><Text style={s.strong}>Preferencias de la cuenta</Text><Text style={s.help}>{view.preferences?.district||"Sin preferencias confirmadas"}</Text><Text style={s.help}>{view.preferences?.roles?.join(" · ")||""}</Text></View>
   <Action label="Actualizar ofertas" disabled={busy} onPress={()=>run(harness.dashboard.refresh)}/>
   <TextInput accessibilityLabel="Buscar ofertas de prueba" value={query} onChangeText={setQuery} placeholder="Cargo, escuela, distrito o turno" style={s.input}/>
   <Text style={s.strong}>{busy?"Actualizando…":offers.length+" oportunidades de ejemplo"}</Text>
   {!busy&&offers.map(o=><View key={o.key} style={s.offer}>
    <Text style={[s.tag,o.revista==="Provisional"&&s.provisional]}>{o.revista||"Sin revista informada"}</Text>
    <Text style={s.name}>{o.cargo}</Text><Text style={s.help}>{o.escuela} · {o.distrito}</Text>
    <Text style={s.strong}>{o.turno}</Text><Text style={s.help}>{o.horario}</Text>
    <Text style={s.help}>Cierre de ejemplo: {o.cierre}</Text>
   </View>)}
   {!busy&&!offers.length?<Text style={s.help}>No hay ofertas de ejemplo verificables para esta búsqueda.</Text>:null}
   <View style={s.info}><Text style={s.strong}>Notificaciones push</Text><Text style={s.help}>Pendiente de conexión con el proveedor real. No se registran dispositivos desde esta simulación.</Text></View>
   <Action label="Cerrar sesión de prueba" secondary disabled={busy} onPress={()=>{setQuery("");run(harness.dashboard.logout);}}/>
  </>}
 </View>;
}
const s=StyleSheet.create({
 card:{backgroundColor:"#FFF",padding:18,borderRadius:18,borderColor:"#D9E7EF",borderWidth:1,gap:12},
 eyebrow:{color:"#B76B21",fontSize:10,fontWeight:"900",letterSpacing:.5},
 title:{fontSize:23,fontWeight:"900",color:"#082C43"},
 name:{fontSize:17,fontWeight:"800",color:"#082C43"},
 help:{fontSize:13,lineHeight:20,color:"#657A8B"},
 strong:{fontSize:14,fontWeight:"800",color:"#17374C"},
 warning:{color:"#963A1C",fontSize:13},
 info:{backgroundColor:"#F1F6FB",padding:14,borderRadius:12,gap:5},
 input:{borderColor:"#D9E7EF",borderWidth:1,borderRadius:10,padding:12,color:"#17374C"},
 offer:{borderColor:"#D9E7EF",borderWidth:1,borderRadius:14,padding:14,gap:6},
 tag:{alignSelf:"flex-start",backgroundColor:"#C8F4E5",color:"#075E56",padding:5,borderRadius:5,fontSize:11,fontWeight:"800"},
 provisional:{backgroundColor:"#DDEBFF",color:"#17468A"},
 action:{backgroundColor:"#087F86",borderRadius:11,padding:13,alignItems:"center"},
 secondary:{backgroundColor:"#FFF",borderColor:"#087F86",borderWidth:1},
 actionText:{color:"#FFF",fontWeight:"800",fontSize:14}
});
