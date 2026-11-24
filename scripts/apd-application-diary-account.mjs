import {normalizeApplicationEntries,updateApplicationDiary} from './apd-application-diary.mjs';

const diaryMaxRevision=2147483647;

export function validateDiaryRecord(record){
 const current=record??{revision:0,entries:[]};
 if(!Number.isInteger(current.revision)||current.revision<0||current.revision>diaryMaxRevision)throw Error('Revisión inválida');
 return {revision:current.revision,entries:[...normalizeApplicationEntries(current.entries).values()]};
}

export async function diaryAccountRequest(request,{authenticate,entitled,read,compareAndSet}){
 const reply=(status,body)=>({status,body});
 if(!['GET','PUT'].includes(request.method))return reply(405,{ok:false,message:'Método no permitido'});
 try{
  const actor=await authenticate(request);
  if(!actor?.id)return reply(401,{ok:false,message:'No autenticado'});
  if(!(await entitled(actor.id)))return reply(403,{ok:false,message:'Disponible con Insigne activo'});
  if(request.method==='GET')return reply(200,{ok:true,diary:validateDiaryRecord(await read(actor.id))});
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return reply(415,{ok:false,message:'Se requiere JSON'});
  let mutation;
  try{
   const reader=request.body?.getReader();
   if(!reader)throw Error('Cuerpo vacío');
   const decoder=new TextDecoder('utf-8',{fatal:true});
   let size=0,raw='';
   for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>2048){await reader.cancel();return reply(413,{ok:false,message:'Registro demasiado extenso'});}
    raw+=decoder.decode(value,{stream:true});
   }
   mutation=JSON.parse(raw+decoder.decode());
  }catch{return reply(400,{ok:false,message:'Registro inválido'});}
  const fields=mutation?.action==='set'?['action','key','revision','status']:['action','key','revision'];
  if(!mutation||typeof mutation!=='object'||Object.keys(mutation).length!==fields.length||!fields.every(k=>Object.hasOwn(mutation,k))||
     !Number.isInteger(mutation.revision)||mutation.revision<0||mutation.revision>=diaryMaxRevision)
   return reply(400,{ok:false,message:'Registro inválido'});
  const current=validateDiaryRecord(await read(actor.id));
  let next;
  try{next=updateApplicationDiary(current,mutation);}catch{return reply(400,{ok:false,message:'Registro inválido o límite alcanzado'});}
  const conflict=()=>reply(409,{ok:false,message:'El registro cambió. Recargá antes de volver a guardar.'});
  if(!next.ok)return conflict();
  if(!next.changed)return reply(200,{ok:true,diary:current});
  const stored=await compareAndSet(actor.id,next.record);
  if(!stored)return conflict();
  const diary=validateDiaryRecord(stored);
  if(JSON.stringify(diary)!==JSON.stringify(next.record))throw Error('Guardado no confirmado');
  return reply(200,{ok:true,diary});
 }catch{return reply(503,{ok:false,message:'No se pudo confirmar la operación'});}
}
