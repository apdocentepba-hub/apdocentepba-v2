/** Candidate native client for the existing Worker contract. No network at import.
 * Memory-only sessions. No fallback to legacy user UUID, no direct Supabase,
 * no automatic retry of login. Transport supplied by the application.
 */
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const bearer=v=>typeof v==="string"&&/^[a-f0-9]{64}$/i.test(v);
const text=(v,max=200)=>typeof v==="string"?v.trim().slice(0,max):"";
const closed=new Set(["CERRADA","FINALIZADA","FINALIZADO","VENCIDA","VENCIDO","ANULADA","ANULADO","DESIERTA","DESIERTO","DESIGNADA","DESIGNADO","CESE","CESADA","NO VIGENTE"]);
function abcClosingTime(raw){
 // ABC wall-clock convention in Argentina, independent of phone timezone.
 // Unknown/date-only values fail closed, not assumed open until midnight.
 const m=typeof raw==="string"&&raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?$/);
 const d=typeof raw==="string"&&raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ ,]+(\d{2}):(\d{2})(?::(\d{2}))?$/);
 const parts=m?m.slice(1):d?[d[3],d[2],d[1],d[4],d[5],d[6]]:null;
 if(!parts)return null;
 const [y,mo,day,h,mi,se="0"]=parts.map((v,i)=>i===5?(v||"0"):v);
 const a=[y,mo,day,h,mi,se].map(Number);
 if(a[0]<2000||a[0]>2099||a[1]<1||a[1]>12||a[2]<1||a[2]>31||a[3]>23||a[4]>59||a[5]>59)return null;
 const wall=new Date(Date.UTC(a[0],a[1]-1,a[2],a[3],a[4],a[5]));
 if(wall.getUTCFullYear()!==a[0]||wall.getUTCMonth()!==a[1]-1||wall.getUTCDate()!==a[2])return null;
 return wall.getTime()+3*3600000;
}
function normalizeAlerts(data,now){
 // The pinned live Worker returns items:[] for expired subscription, not resultados.
 // Never interpret an unexpected non-empty items array as active offers.
 if(data?.ok===true&&data.resultados===undefined&&Array.isArray(data.items)&&data.items.length===0&&typeof data.message==="string"&&data.message.startsWith("Tu plan está vencido.")&&Object.hasOwn(data,"plan")&&Object.hasOwn(data,"subscription"))return {items:[],excluded:0,accessRestricted:true};
 if(!Array.isArray(data?.resultados)||data.resultados.length>10000)throw Error("alerts_unverified");
 const items=[],keys=new Set();let excluded=0;
 for(const row of data.resultados){
  const key=text(row?.source_offer_key,160);
  const expires=abcClosingTime(row?.finoferta);
  const states=[row?.estado,row?.estado_oferta,row?.estado_actual,row?.raw?.estado,row?.raw?.estado_oferta,row?.raw?.estado_actual].filter(v=>typeof v==="string").map(v=>v.trim().toUpperCase());
  if(!key||!row?.cargo||expires===null||expires<=now||states.some(v=>closed.has(v))||keys.has(key)){excluded++;continue;}
  keys.add(key);
  items.push({key,cargo:text(row.cargo),escuela:text(row.escuela),distrito:text(row.distrito),turno:text(row.turno),nivel:text(row.nivel),revista:text(row.revista),horario:text(row.dias_horarios,500),cierre:text(row.finoferta_label||row.finoferta),expiresAt:expires});
 }
 return {items,excluded};
}
function createNativeAccountClient({request,now=Date.now}={}){
 if(typeof request!=="function")throw Error("invalid_transport");
 let session=null,generation=0,loginBusy=false;
 const reset=()=>{generation++;session=null;};
 const publicAccount=()=>session?{userId:session.userId,name:session.name}:null;
 async function call(path,{method="GET",body,token,epoch}={}){
  let r;
  try{r=await request({path,method,...(body?{body}:{}),...(token?{bearer:token}:{})});}
  catch{throw Error("connection_failed");}
  if(epoch!==generation)throw Error("session_changed");
  if(r?.status===401){reset();throw Error("session_expired");}
  if(!r||r.status<200||r.status>=300||r.data?.ok!==true)throw Error("request_unconfirmed");
  return r.data;
 }
 const capture=()=>{if(!session)throw Error("session_required");return {token:session.bearer,epoch:generation,userId:session.userId};};
 return Object.freeze({
  account:publicAccount,
  getSession:()=>session?{userId:session.userId,bearer:session.bearer}:null,
  async login(email,password){
   if(loginBusy||session)throw Error("login_busy_or_active");
   if(typeof email!=="string"||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())||email.length>254||typeof password!=="string"||!password||password.length>1024)throw Error("invalid_credentials");
   loginBusy=true;const epoch=++generation;
   try{
    const data=await call("/api/login",{method:"POST",body:{email:email.trim().toLowerCase(),password},epoch});
    const id=data.user?.id,token=data.session_token;
    if(!uuid(id)||!bearer(token))throw Error("invalid_session");
    const verified=await call("/api/account/profile",{token,epoch});
    if(verified.user?.id!==id||verified.user?.activo!==true)throw Error("identity_unconfirmed");
    session={userId:id,bearer:token,name:text(verified.user.nombre)};
    return publicAccount();
   }finally{loginBusy=false;}
  },
  logoutLocal(){reset();},
  async logoutRemote(){
   const s=capture();
   // A generic 401 cannot prove a successful revocation. Keep the session
   // on ambiguous failures so the user may explicitly retry the idempotent RPC.
   let response;
   try{response=await request({path:"/api/account/logout",method:"POST",body:{},bearer:s.token});}
   catch{throw Error("logout_unconfirmed");}
   if(s.epoch!==generation)throw Error("session_changed");
   if(response?.status!==200||response.data?.ok!==true||response.data?.revoked!==true)throw Error("logout_unconfirmed");
   reset();return {revoked:true};
  },
  async alerts(){
   const s=capture(),data=await call("/api/mis-alertas",s);
   const timestamp=now();if(!Number.isFinite(timestamp))throw Error("invalid_clock");
   return normalizeAlerts(data,timestamp);
  },
  async preferences(){
   const s=capture(),data=await call("/api/account/preferences",s),p=data.preferences;
   if(p===null)return null;
   if(!p||p.user_id!==s.userId)throw Error("identity_unconfirmed");
   const list=k=>Array.isArray(p[k])?p[k].filter(v=>typeof v==="string").slice(0,100).map(v=>text(v)): [];
   return {district:text(p.distrito_principal),districts:list("otros_distritos"),roles:list("cargos"),subjects:list("materias"),levels:list("niveles"),shifts:list("turnos"),enabled:p.alertas_activas===true};
  }
 });
}
module.exports={createNativeAccountClient,abcClosingTime,normalizeAlerts};
