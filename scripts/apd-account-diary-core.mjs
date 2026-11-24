import {updateApplicationDiary} from './apd-application-diary.mjs';
const allowed=new Set(['postulada','en_evaluacion','adjudicada','no_adjudicada','retirada','sin_confirmar']);
const keyOk=k=>typeof k==='string'&&k.length>=1&&k.length<=160&&!/[^A-Za-z0-9_.:|-]/.test(k);
const revOk=n=>Number.isSafeInteger(n)&&n>=0;
const exact=(v,fields)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k));
export function validateDiaryRow(row){
 if(row===null)return {entries:[],revision:0};
 if(!row||!revOk(row.revision)||!row.revision||!Array.isArray(row.entries)||row.entries.length>100)throw Error('Registro inválido');
 const seen=new Set(),entries=[];
 for(const e of row.entries){
  if(!exact(e,['key','status','origin','updatedAt'])||!keyOk(e.key)||seen.has(e.key)||!allowed.has(e.status)||e.origin!=='self_reported'||typeof e.updatedAt!=='string'||e.updatedAt.length!==24||!Number.isFinite(Date.parse(e.updatedAt))||new Date(e.updatedAt).toISOString()!==e.updatedAt)throw Error('Registro inválido');
  seen.add(e.key);entries.push({key:e.key,status:e.status,origin:e.origin,updatedAt:e.updatedAt});
 }
 return {entries:entries.sort((a,b)=>a.key.localeCompare(b.key)),revision:row.revision};
}
export function validateDiaryMutation(v){
 if(!v||!['set','remove'].includes(v.action)||!exact(v,v.action==='set'?['action','key','revision','status']:['action','key','revision'])||!keyOk(v.key)||!revOk(v.revision)||v.action==='set'&&!allowed.has(v.status))throw Error('Operación inválida');
 return v;
}
async function readSmallJson(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing body');
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();return {tooLarge:true};}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};
}
export async function accountDiaryRequest(request,deps){
 const reply=(status,body)=>({status,body}),fail=(status,message)=>reply(status,{ok:false,message});
 if(!['GET','PUT'].includes(request.method))return fail(405,'Método no permitido');
 try{
  const owner=await deps.authenticate(request);if(!owner?.id)return fail(401,'No autenticado');
  if(request.method==='GET')return reply(200,{ok:true,diary:validateDiaryRow(await deps.read(owner.id))});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return fail(415,'Se requiere JSON');
  let m;try{const r=await readSmallJson(request);if(r.tooLarge)return fail(413,'Datos demasiado extensos');m=validateDiaryMutation(r.value);}catch{return fail(400,'Operación inválida');}
  if(m.action==='set'&&!(await deps.entitled(owner.id)))return fail(403,'Disponible con Insigne activo');
  const row=validateDiaryRow(await deps.read(owner.id));
  if(row.revision!==m.revision)return fail(409,'El registro cambió. Volvé a cargar.');
  if(m.action==='set'&&!row.entries.some(e=>e.key===m.key)){
   if(row.entries.length>=100)return fail(409,'Máximo 100 registros');
   if(!(await deps.knownIdentity(m.key)))return fail(422,'Oferta no identificada');
  }
  const result=updateApplicationDiary(row,m);
  if(!result.ok)return fail(409,'El registro cambió. Volvé a cargar.');
  if(!result.changed)return reply(200,{ok:true,diary:row});
  const saved=await deps.compareAndSet(owner.id,{entries:result.record.entries,revision:row.revision});
  if(saved===null)return fail(409,'El registro cambió. Volvé a cargar.');
  const confirmed=validateDiaryRow(saved);
  if(JSON.stringify(confirmed)!==JSON.stringify(result.record))throw Error('Escritura no confirmada');
  return reply(200,{ok:true,diary:confirmed});
 }catch{return fail(503,'No se pudo confirmar la operación. Volvé a consultar.');}
}
