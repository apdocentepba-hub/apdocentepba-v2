/** Offline contract; owner derived only from a verified server session. */
import {validateCareerProfile,projectCareerSchedule} from './apd-career-profile-core.mjs';
const MAX_REV=2147483647;
const empty=()=>({schema:1,seniorityYears:0,positions:[]});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function cleanCareer(value){
 if(!exact(value,['schema','seniorityYears','positions'])||!Array.isArray(value.positions))throw Error('Perfil inválido');
 let count=0;
 for(const p of value.positions){
  if(!exact(p,['id','schoolKey','school','role','level','kind','status','quantity','modules','blocks'])||!Array.isArray(p.blocks)||p.blocks.some(b=>!exact(b,['day','start','end'])))throw Error('Cargo inválido');
  count+=p.blocks.length;
 }
 if(count>42)throw Error('Máximo 42 bloques semanales');
 return validateCareerProfile(value);
}
export function validateCareerRecord(row){
 if(row===null)return {profile:null,revision:0};
 if(!exact(row,['profile','revision'])||!Number.isSafeInteger(row.revision)||row.revision<1||row.revision>MAX_REV)throw Error('Revisión inválida');
 return {profile:cleanCareer(row.profile),revision:row.revision};
}
export async function careerAccountRequest(request,deps){
 const reply=(status,body)=>({status,body});
 if(!['GET','PUT'].includes(request.method))return reply(405,{ok:false,message:'Método no permitido'});
 try{
  const actor=await deps.authenticate(request);
  if(!actor?.id)return reply(401,{ok:false,message:'No autenticado'});
  if(request.method==='GET'){
   const record=validateCareerRecord(await deps.read(actor.id));
   return reply(200,{ok:true,career:record});
  }
  if(!(await deps.entitled(actor.id)))return reply(403,{ok:false,message:'Disponible con Completo o prueba vigente'});
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return reply(415,{ok:false,message:'Se requiere JSON'});
  let data,profile;
  try{
   const reader=request.body?.getReader();if(!reader)throw Error('Cuerpo vacío');
   let size=0;const decoder=new TextDecoder('utf-8',{fatal:true});let raw='';
   while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>65536){await reader.cancel();return reply(413,{ok:false,message:'Perfil demasiado extenso'});}raw+=decoder.decode(r.value,{stream:true});}
   raw+=decoder.decode();data=JSON.parse(raw);
   if(!exact(data,['profile','revision'])||!Number.isSafeInteger(data.revision)||data.revision<0||data.revision>=MAX_REV)throw Error('Revisión inválida');
   profile=cleanCareer(data.profile);
  }catch{return reply(400,{ok:false,message:'Perfil o revisión inválidos'});}
  const saved=await deps.compareAndSet(actor.id,{profile,revision:data.revision});
  if(saved===null)return reply(409,{ok:false,message:'Tu carrera cambió en otro dispositivo. Recuperá la versión actual.'});
  const record=validateCareerRecord(saved);
  if(record.revision!==data.revision+1||JSON.stringify(record.profile)!==JSON.stringify(profile))throw Error('Guardado no confirmado');
  return reply(200,{ok:true,career:record});
 }catch{return reply(503,{ok:false,message:'No se pudo confirmar la operación'});}
}
/** Existing schedule is read only; never persist a derived projection automatically. */
export function combineCareerWithSchedule(profile,modules){
 if(profile===null)return {modules:[...modules],unassignedModules:[...modules],jobs:[]};
 return projectCareerSchedule(cleanCareer(profile),modules);
}
