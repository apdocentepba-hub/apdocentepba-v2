/**
 * APDocentePBA — offline-only Expo demonstration.
 * NO AUTH, NO ABC/WORKER NETWORK, NO REMOTE PUSH DELIVERY.
 * Local notification demonstration ONLY on explicit tap + OS permission.
 * All offers below are explicitly fictional. No production features implied.
 */
import React, {useEffect, useMemo, useState} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import {
 View, Text, TextInput, Pressable, ScrollView, StyleSheet,
 StatusBar, Platform
} from "react-native";
const {
 DEMO_OFFERS, DISTRICTS, SHIFTS, filterDemoOffers, toggleSaved, demoCounters
} = require("./src/demo-state.js");
const {
 createDemoInboxStore,emptyInbox,inboxCounters
} = require("./src/demo-inbox.js");

// Nothing is sent to FCM/APNs/Expo Push. This handler displays local demo notices.
Notifications.setNotificationHandler({
 handleNotification: async () => ({
  shouldShowBanner: true, shouldShowList: true,
  shouldPlaySound: true, shouldSetBadge: false
 })
});

const COLORS={
 navy:"#082C43",navyDark:"#061D2E",blue:"#3178F5",teal:"#087F86",
 mint:"#C8F4E5",surface:"#FFFFFF",canvas:"#F1F6FB",text:"#17374C",
 muted:"#657A8B",line:"#D9E7EF",orange:"#B76B21",orangeBg:"#FFF2DD"
};
const TABS=[
 {id:"inicio",label:"Inicio",emoji:"⌂"},
 {id:"alertas",label:"Alertas",emoji:"◈"},
 {id:"filtros",label:"Filtros",emoji:"≡"},
 {id:"cuenta",label:"Cuenta",emoji:"◉"}
];

function Pill({label,selected,onPress}){
 return (
  <Pressable
   onPress={onPress}
   accessibilityRole="button"
   accessibilityState={{selected:!!selected}}
   style={[styles.chip,selected&&styles.chipOn]}
  >
   <Text style={[styles.chipText,selected&&styles.chipTextOn]}>{label}</Text>
  </Pressable>
 );
}
function SectionHeading({title,sub}){
 return <View style={styles.sectionTitle}>
  <Text style={styles.heading}>{title}</Text>
  {sub?<Text style={styles.help}>{sub}</Text>:null}
 </View>;
}
function DemoNotice(){
 return (
  <View style={styles.demoNotice} accessibilityRole="text">
   <Text style={styles.demoNoticeTitle}>MODO DEMOSTRACIÓN · SIN DATOS REALES</Text>
   <Text style={styles.demoNoticeBody}>
    Las ofertas que ves son ficticias. La cuenta, ABC y las notificaciones
    remotas aún no están conectadas. Solo hay avisos locales de prueba.
   </Text>
  </View>
 );
}
function Metric({number,label}){
 return <View style={styles.metric}>
  <Text style={styles.metricNumber}>{number}</Text>
  <Text style={styles.metricLabel}>{label}</Text>
 </View>;
}
function OfferCard({item,saved,onToggle}){
 return (
  <View style={styles.offer}>
   <View style={styles.offerTop}>
    <View style={styles.offerLabel}><Text style={styles.offerLabelText}>EJEMPLO</Text></View>
    <Text style={styles.offerShift}>{item.turno}</Text>
   </View>
   <Text style={styles.offerTitle}>{item.cargo}</Text>
   <Text style={styles.offerSchool}>{item.escuela}</Text>
   <Text style={styles.offerMeta}>{item.distrito}  ·  {item.nivel}</Text>
   <View style={styles.offerFooter}>
    <Text style={styles.offerId}>{item.id}</Text>
    <Pressable onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={saved?"Quitar ejemplo guardado":"Guardar ejemplo local"}
      style={[styles.saveButton,saved&&styles.saveActive]}>
      <Text style={[styles.saveText,saved&&styles.saveTextOn]}>
       {saved?"✓ Guardado":"＋ Guardar"}
      </Text>
    </Pressable>
   </View>
  </View>
 );
}
function PrimaryButton({label,onPress,secondary=false,disabled=false}){
 return <Pressable onPress={onPress} disabled={disabled}
  accessibilityRole="button" accessibilityState={{disabled}}
  style={[styles.primaryButton,secondary&&styles.secondaryButton,
   disabled&&styles.disabledButton]}>
  <Text style={[styles.primaryText,secondary&&styles.secondaryText]}>{label}</Text>
 </Pressable>;
}
function DemoInboxCard({notice,onRead,disabled=false}){
 const offer=DEMO_OFFERS.find(o=>o.id===notice.offerId);
 const cancelled=notice.status==="cancelled";
 return <View style={styles.inboxCard}>
  <View style={styles.inboxTop}>
   <Text style={styles.inboxTitle}>AVISO FICTICIO</Text>
   <Text style={[styles.inboxStatus,cancelled&&styles.inboxCancelled]}>
    {cancelled?"Cancelado":notice.read?"Leído":"Sin leer"}
   </Text>
  </View>
  <Text style={styles.inboxOffer}>
   {offer?offer.cargo:"Ejemplo no disponible"}
  </Text>
  <Text style={styles.help}>
   {offer?offer.distrito+" · "+offer.escuela:"Solo demostración"} · Sin vínculo con ABC
  </Text>
  {cancelled?
   <Text style={styles.inboxExplanation}>
    El aviso cancelado se conserva como registro. No vuelve a activarse.
   </Text>:
  !notice.read?
   <Pressable accessibilityRole="button" disabled={disabled}
    accessibilityLabel="Marcar aviso ficticio como leído"
    accessibilityState={{disabled}}
    style={styles.inboxReadButton} onPress={()=>onRead(notice.id)}>
    <Text style={styles.inboxReadText}>Marcar como leído</Text>
   </Pressable>:
   <Text style={styles.help}>Ya lo marcaste como leído en este equipo.</Text>}
 </View>;
}
export default function App(){
 const [tab,setTab]=useState("inicio");
 const [district,setDistrict]=useState("Todos");
 const [shift,setShift]=useState("Todos");
 const [query,setQuery]=useState("");
 const [saved,setSaved]=useState([]);
 const inboxStore=useMemo(()=>createDemoInboxStore({storage:AsyncStorage}),[]);
 const [inbox,setInbox]=useState(emptyInbox);
 const [inboxReady,setInboxReady]=useState(false);
 const [inboxLocked,setInboxLocked]=useState(false);
 const [inboxNote,setInboxNote]=useState("Recuperando avisos ficticios de este equipo…");
 const [notificationStatus,setNotificationStatus]=useState("Aún no se hizo ninguna prueba local.");
 useEffect(()=>{
  let active=true;
  inboxStore.load().then(result=>{
   if(!active)return;
   setInbox(result.state);
   setInboxReady(true);
   setInboxLocked(result.locked);
   setInboxNote(result.locked?
    "Los datos de la bandeja no son legibles. No se sobrescribieron: podés reiniciar la demostración manualmente.":
    result.recovered?
     "Bandeja ficticia recuperada del almacenamiento local.":
     "Bandeja lista. No hay avisos simulados todavía.");
  }).catch(()=>{
   if(!active)return;
   setInboxReady(true);setInboxLocked(true);
   setInboxNote("No se puede leer la bandeja local. Reiniciá la demostración para empezar de cero.");
  });
  return ()=>{active=false;};
 },[inboxStore]);
 const runInboxAction=async(action,done,empty)=>{
  if(!inboxReady||inboxLocked)return;
  try{
   const result=await action();
   setInbox(result.state||result);
   setInboxNote(result.applied===false?empty:done);
  }catch{
   setInboxNote("No se pudo guardar el cambio en este equipo. Los avisos anteriores se conservaron.");
  }
 };
 const simulateInboxArrival=()=>runInboxAction(
  ()=>inboxStore.simulate("arrival"),
  "Se agregó un aviso ficticio. No se envió ni recibió ningún push remoto.",
  "Ya están los cuatro avisos de ejemplo; no hay nuevos.");
 const simulateInboxCancellation=()=>runInboxAction(
  ()=>inboxStore.simulate("cancellation"),
  "Se canceló un aviso ficticio. No se puede reactivar con una actualización atrasada.",
  "No quedan avisos activos de ejemplo para cancelar.");
 const markInboxRead=id=>runInboxAction(
  ()=>inboxStore.markRead(id),
  "Aviso de ejemplo marcado como leído y guardado localmente.",
  "Ese aviso de ejemplo ya estaba leído.");
 const tryLocalNotification=async()=>{
  try {
   if(Platform.OS==="android") {
    await Notifications.setNotificationChannelAsync("apd-laboratorio",{
     name:"Avisos de laboratorio",importance:Notifications.AndroidImportance.HIGH
    });
   }
   const before=await Notifications.getPermissionsAsync();
   const permission=before.granted?before:await Notifications.requestPermissionsAsync();
   if(!permission.granted){
    setNotificationStatus("El sistema no autorizó notificaciones. Podés habilitarlas desde Ajustes.");
    return;
   }
   await Notifications.scheduleNotificationAsync({
    content:{
     title:"APDocentePBA · Prueba local",
     body:"Este aviso es de demostración. No representa una oferta de ABC.",
     channelId:"apd-laboratorio"
    },
    trigger:null
   });
   setNotificationStatus("Aviso local solicitado al sistema Android. No se envió un push remoto.");
  }catch(_){
   setNotificationStatus("No se pudo mostrar el aviso local en este dispositivo.");
  }
 };
 const offers=useMemo(()=>filterDemoOffers(DEMO_OFFERS,{district,shift,query}),
  [district,shift,query]);
 const counters=demoCounters(offers,saved);
 const inboxCounts=inboxCounters(inbox);
 const reset=async()=>{
  try{
   const restored=await inboxStore.reset();
   setInbox(restored);setInboxReady(true);setInboxLocked(false);
   setInboxNote("Se reiniciaron los avisos ficticios de este equipo.");
   setDistrict("Todos");setShift("Todos");setQuery("");setSaved([]);setTab("inicio");
  }catch{
   setInboxNote("No se pudo borrar la demostración local. Los datos anteriores siguen intactos.");
  }
 };
 return (
  <View style={styles.root}>
   <StatusBar barStyle="light-content" backgroundColor={COLORS.navyDark}/>
   <View style={styles.header}>
    <View style={styles.brandLine}>
     <View style={styles.brandIcon}><Text style={styles.brandGlyph}>A</Text></View>
     <View style={styles.brandText}>
      <Text style={styles.brand}>APDocentePBA</Text>
      <Text style={styles.brandSubtitle}>Alertas de actos públicos digitales</Text>
     </View>
    </View>
    <View style={styles.headerBottom}>
     <Text style={styles.headerTitle}>
      {tab==="inicio"?"Tu panel docente":tab==="alertas"?"Ofertas de ejemplo":
       tab==="filtros"?"Preferencias de ejemplo":"Tu cuenta"}
     </Text>
     <Text style={styles.headerHelp}>Vista de laboratorio · Sin sesión iniciada</Text>
    </View>
   </View>
   <ScrollView style={styles.scroller}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={styles.content}>
    <DemoNotice/>
    {tab==="inicio"?
     <>
      <SectionHeading title="Todo en un solo lugar"
       sub="Una vista previa de cómo vas a seguir tus oportunidades docentes."/>
      <View style={styles.metricsRow}>
       <Metric number={String(counters.matching)} label="Ofertas de ejemplo"/>
       <Metric number={String(counters.saved)} label="Guardadas en esta sesión"/>
       <Metric number="0" label="Push recibidos"/>
      </View>
      <View style={styles.featurePanel}>
       <Text style={styles.featureEyebrow}>PRÓXIMAMENTE</Text>
       <Text style={styles.featureTitle}>Que las alertas te encuentren a vos</Text>
       <Text style={styles.featureDescription}>
        La versión final buscará ofertas compatibles con tus preferencias y podrá
        avisarte por notificación. Esta pantalla todavía no envía avisos.
       </Text>
       <PrimaryButton label="Explorar la demostración" onPress={()=>setTab("alertas")}/>
      </View>
      <SectionHeading title="Cómo funcionará"
       sub="Una misma cuenta y filtros compartidos con la web."/>
      <View style={styles.steps}>
       <Text style={styles.stepText}>01   Ingresás con tu cuenta APDocentePBA.</Text>
       <Text style={styles.stepText}>02   Elegís distritos, cargos, niveles y turnos.</Text>
       <Text style={styles.stepText}>03   Consultás ofertas compatibles y sus detalles.</Text>
       <Text style={styles.stepText}>04   Activás push solo cuando lo autorizás.</Text>
      </View>
     </>:
    tab==="alertas"?
     <>
      <SectionHeading title="Bandeja ficticia recuperable"
       sub="Los avisos son simulados, nunca push reales. Se conservan al cerrar y abrir la app."/>
      <View style={styles.summaryBox}>
       <Text style={styles.summaryTitle}>
        {inboxCounts.demoAlerts} avisos · {inboxCounts.demoUnread} sin leer · {inboxCounts.demoCancelled} cancelados
       </Text>
       <Text style={styles.help} accessibilityRole="text">{inboxNote}</Text>
       <PrimaryButton label="Simular llegada de aviso" disabled={!inboxReady||inboxLocked}
        onPress={simulateInboxArrival}/>
       <PrimaryButton label="Simular cancelación" secondary
        disabled={!inboxReady||inboxLocked||!inbox.items.some(x=>x.status==="active")}
        onPress={simulateInboxCancellation}/>
      </View>
      {inbox.items.map(item=><DemoInboxCard
       key={item.id} notice={item}
       disabled={!inboxReady||inboxLocked} onRead={markInboxRead}/>)}
      <SectionHeading title="Explorar ofertas ficticias"
       sub="Filtrá los ejemplos locales. No son vacantes de ABC."/>
      <TextInput
       style={styles.search} placeholder="Buscar cargo, distrito o escuela"
       placeholderTextColor={COLORS.muted} value={query}
       onChangeText={setQuery} autoCapitalize="none"
       accessibilityLabel="Buscar entre las ofertas ficticias"/>
      <View style={styles.resultsLine}>
       <Text style={styles.resultsCount}>{offers.length} resultados de ejemplo</Text>
       <Pressable onPress={()=>setTab("filtros")} accessibilityRole="button">
        <Text style={styles.link}>Configurar filtros</Text>
       </Pressable>
      </View>
      {offers.length?offers.map(offer=><OfferCard key={offer.id} item={offer}
       saved={saved.includes(offer.id)}
       onToggle={()=>setSaved(current=>toggleSaved(current,offer.id))}/>):
       <View style={styles.empty}><Text style={styles.emptyTitle}>Sin ejemplos para esos filtros</Text>
        <Text style={styles.help}>Probá otro distrito, turno o texto de búsqueda.</Text>
        <PrimaryButton label="Limpiar filtros" onPress={()=>{
         setQuery("");setDistrict("Todos");setShift("Todos");
        }} secondary/></View>}
      <Text style={styles.bottomNote}>
       La aplicación terminada abrirá el enlace oficial de ABC solo después de verificar
       identidad, plan y disponibilidad de la oferta.
      </Text>
     </>:
    tab==="filtros"?
     <>
      <SectionHeading title="Tus filtros de prueba"
       sub="Por ahora solo afectan a los ejemplos de esta pantalla."/>
      <Text style={styles.filterLabel}>Distrito</Text>
      <View style={styles.chipList}>{DISTRICTS.map(x=><Pill key={x} label={x}
       selected={x===district} onPress={()=>setDistrict(x)}/>)}</View>
      <Text style={styles.filterLabel}>Turno</Text>
      <View style={styles.chipList}>{SHIFTS.map(x=><Pill key={x} label={x}
       selected={x===shift} onPress={()=>setShift(x)}/>)}</View>
      <View style={styles.summaryBox}>
       <Text style={styles.summaryTitle}>Vista previa de compatibilidad</Text>
       <Text style={styles.summaryText}>{offers.length} ofertas ficticias coinciden
        con los filtros de ejemplo.</Text>
       <Text style={styles.help}>La versión final reutilizará los filtros reales de la web
        y verificará la cuenta antes de mostrar resultados.</Text>
      </View>
      <PrimaryButton label="Ver resultados filtrados" onPress={()=>setTab("alertas")}/>
      <PrimaryButton label="Restablecer filtros de ejemplo" secondary
       onPress={()=>{setDistrict("Todos");setShift("Todos");setQuery("");}}/>
     </>:
     <>
      <SectionHeading title="Cuenta y notificaciones"
       sub="La autenticación segura y los avisos reales todavía no están activados."/>
      <View style={styles.statusCard}>
       <Text style={styles.statusHeading}>Cuenta APDocentePBA</Text>
       <Text style={styles.statusValue}>No conectada</Text>
       <Text style={styles.help}>No guardamos usuario, contraseña ni datos de ABC.</Text>
      </View>
      <View style={styles.statusCard}>
       <Text style={styles.statusHeading}>Notificaciones en Android · laboratorio</Text>
       <Text style={styles.statusValue}>Avisos locales disponibles para probar</Text>
       <Text style={styles.help}>Solo al tocar el botón pedimos permiso y solicitamos
        al sistema un aviso de prueba. No registramos tokens ni recibimos push remoto.</Text>
       <PrimaryButton label="Probar notificación local" onPress={tryLocalNotification}/>
       <Text style={styles.help} accessibilityRole="text">{notificationStatus}</Text>
      </View>
      <View style={styles.statusCard}>
       <Text style={styles.statusHeading}>Privacidad</Text>
       <Text style={styles.help}>Los avisos futuros mostrarán un texto genérico y
        abrirán los detalles solo después de verificar la sesión.</Text>
       <Text style={styles.help}>
        La bandeja ficticia conserva solo IDs de ejemplo y estados locales
        sin cifrar. No guarda contraseñas, tokens ni ofertas reales.
       </Text>
      </View>
      <PrimaryButton label="Reiniciar demostración y bandeja" secondary
       disabled={!inboxReady} onPress={reset}/>
     </>}
    <Text style={styles.foot}>APDocentePBA · Prototipo Android/iOS · Sin datos reales</Text>
   </ScrollView>
   <View style={styles.tabs}>
    {TABS.map(x=><Pressable key={x.id} style={[styles.tab,tab===x.id&&styles.tabActive]}
     onPress={()=>setTab(x.id)} accessibilityRole="tab" accessibilityState={{selected:tab===x.id}}>
      <Text style={[styles.tabGlyph,tab===x.id&&styles.tabTextActive]}>{x.emoji}</Text>
      <Text style={[styles.tabText,tab===x.id&&styles.tabTextActive]}>{x.label}</Text>
     </Pressable>)}
   </View>
  </View>
 );
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:COLORS.canvas},
 header:{backgroundColor:COLORS.navy,paddingHorizontal:20,paddingTop:Platform.OS==="android"?42:54,paddingBottom:23},
 brandLine:{flexDirection:"row",alignItems:"center",gap:12},
 brandIcon:{width:42,height:42,backgroundColor:COLORS.teal,borderRadius:13,alignItems:"center",justifyContent:"center"},
 brandGlyph:{fontWeight:"900",color:"#FFF",fontSize:25},
 brandText:{flex:1},
 brand:{fontSize:18,fontWeight:"900",color:"#FFF",letterSpacing:-0.5},
 brandSubtitle:{fontSize:11,color:"#C2DFE9",marginTop:3},
 headerBottom:{paddingTop:25},
 headerTitle:{fontSize:27,color:"#FFF",fontWeight:"800",letterSpacing:-0.8},
 headerHelp:{color:"#BBD5DF",fontSize:12,marginTop:6},
 scroller:{flex:1},
 content:{padding:18,paddingBottom:40,gap:18},
 demoNotice:{borderRadius:14,padding:15,backgroundColor:COLORS.orangeBg,borderWidth:1,borderColor:"#F0DBB6"},
 demoNoticeTitle:{fontSize:11,fontWeight:"900",letterSpacing:0.5,color:COLORS.orange},
 demoNoticeBody:{fontSize:12,lineHeight:19,color:"#735526",marginTop:5},
 sectionTitle:{gap:5},
 heading:{fontSize:20,fontWeight:"800",letterSpacing:-0.5,color:COLORS.text},
 help:{fontSize:12,color:COLORS.muted,lineHeight:19},
 metricsRow:{flexDirection:"row",gap:8},
 metric:{flex:1,backgroundColor:COLORS.surface,borderRadius:14,paddingVertical:18,paddingHorizontal:10,borderWidth:1,borderColor:COLORS.line},
 metricNumber:{fontSize:25,fontWeight:"900",color:COLORS.teal},
 metricLabel:{fontSize:10,lineHeight:15,color:COLORS.muted,marginTop:7},
 featurePanel:{backgroundColor:COLORS.navy,borderRadius:20,padding:21,gap:13},
 featureEyebrow:{fontSize:10,color:COLORS.mint,fontWeight:"900",letterSpacing:1},
 featureTitle:{color:"#FFF",fontSize:24,fontWeight:"900",letterSpacing:-0.6},
 featureDescription:{fontSize:12,color:"#C8DBE6",lineHeight:20},
 primaryButton:{paddingHorizontal:17,paddingVertical:15,backgroundColor:COLORS.teal,borderRadius:13,alignItems:"center",justifyContent:"center"},
 primaryText:{color:"#FFF",fontSize:13,fontWeight:"800"},
 secondaryButton:{backgroundColor:"#FFF",borderColor:COLORS.line,borderWidth:1,marginTop:7},
 secondaryText:{color:COLORS.teal},
 steps:{borderRadius:15,backgroundColor:"#FFF",padding:18,gap:16,borderWidth:1,borderColor:COLORS.line},
 stepText:{fontSize:13,color:COLORS.text,lineHeight:20},
 search:{backgroundColor:"#FFF",borderWidth:1,borderColor:COLORS.line,borderRadius:13,padding:15,fontSize:14,color:COLORS.text},
 resultsLine:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 resultsCount:{color:COLORS.muted,fontSize:12},
 link:{color:COLORS.teal,fontWeight:"800",fontSize:12},
 offer:{backgroundColor:"#FFF",borderRadius:17,padding:17,borderWidth:1,borderColor:COLORS.line,gap:8},
 offerTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 offerLabel:{backgroundColor:COLORS.mint,borderRadius:7,paddingHorizontal:9,paddingVertical:5},
 offerLabelText:{fontSize:10,fontWeight:"900",color:COLORS.navy},
 offerShift:{fontSize:11,color:COLORS.muted},
 offerTitle:{fontSize:18,fontWeight:"800",color:COLORS.text},
 offerSchool:{fontSize:13,color:COLORS.text},
 offerMeta:{color:COLORS.muted,fontSize:12},
 offerFooter:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingTop:9,borderTopWidth:1,borderTopColor:COLORS.line},
 offerId:{fontSize:10,color:COLORS.muted},
 saveButton:{borderColor:COLORS.teal,borderWidth:1,borderRadius:9,paddingVertical:8,paddingHorizontal:12},
 saveText:{color:COLORS.teal,fontSize:12,fontWeight:"800"},
 saveActive:{backgroundColor:COLORS.teal},
 saveTextOn:{color:"#FFF"},
 empty:{backgroundColor:"#FFF",padding:20,borderRadius:16,gap:12,borderWidth:1,borderColor:COLORS.line},
 emptyTitle:{fontSize:16,color:COLORS.text,fontWeight:"800"},
 bottomNote:{color:COLORS.muted,fontSize:11,lineHeight:18},
 filterLabel:{fontWeight:"800",color:COLORS.text,fontSize:14},
 chipList:{flexDirection:"row",flexWrap:"wrap",gap:8},
 chip:{borderWidth:1,borderColor:COLORS.line,backgroundColor:"#FFF",paddingVertical:10,paddingHorizontal:14,borderRadius:30},
 chipOn:{backgroundColor:COLORS.teal,borderColor:COLORS.teal},
 chipText:{color:COLORS.text,fontSize:12,fontWeight:"700"},
 chipTextOn:{color:"#FFF"},
 summaryBox:{backgroundColor:"#E7F5F5",borderRadius:15,padding:17,gap:9},
 summaryTitle:{color:COLORS.navy,fontWeight:"800",fontSize:14},
 summaryText:{fontSize:13,color:COLORS.text,lineHeight:20},
 inboxCard:{backgroundColor:"#FFF",borderRadius:14,borderWidth:1,
  borderColor:COLORS.line,padding:15,gap:8},
 inboxTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
 inboxTitle:{fontSize:10,fontWeight:"900",color:COLORS.teal,letterSpacing:0.4},
 inboxStatus:{fontSize:11,color:COLORS.teal,fontWeight:"800"},
 inboxCancelled:{color:COLORS.orange},
 inboxOffer:{fontSize:16,fontWeight:"800",color:COLORS.text},
 inboxExplanation:{fontSize:12,color:COLORS.orange,lineHeight:18},
 inboxReadButton:{padding:11,borderRadius:9,backgroundColor:COLORS.mint,
  alignSelf:"flex-start"},
 inboxReadText:{fontSize:12,fontWeight:"800",color:COLORS.navy},
 disabledButton:{opacity:0.5},
 statusCard:{backgroundColor:"#FFF",padding:18,borderRadius:15,borderWidth:1,borderColor:COLORS.line,gap:8},
 statusHeading:{fontSize:15,color:COLORS.text,fontWeight:"800"},
 statusValue:{fontSize:13,color:COLORS.orange,fontWeight:"800"},
 foot:{color:COLORS.muted,textAlign:"center",fontSize:10,marginTop:12},
 tabs:{flexDirection:"row",backgroundColor:"#FFF",borderTopColor:COLORS.line,borderTopWidth:1,paddingBottom:Platform.OS==="ios"?20:7,paddingTop:6},
 tab:{flex:1,paddingVertical:9,alignItems:"center",gap:4},
 tabActive:{borderTopColor:COLORS.teal,borderTopWidth:2,marginTop:-7,paddingTop:14},
 tabGlyph:{fontSize:21,color:COLORS.muted},
 tabText:{fontSize:10,fontWeight:"700",color:COLORS.muted},
 tabTextActive:{color:COLORS.teal}
});
