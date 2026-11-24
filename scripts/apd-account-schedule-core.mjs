/** Private, versioned module schedule. No clock assumptions or user IDs in payloads. */
export function validateModuleSchedule(value){
 if(!Array.isArray(value)||value.length>77||value.some(v=>typeof v!=='string'||!/^(?:M[1-5]|T[0-5])-[1-7]$/.test(v))||new Set(value).size!==value.length)throw Error('Módulos inválidos');
 return [...value].sort();
}
export function validateScheduleWrite(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['modules','revision'].includes(k))||!Number.isSafeInteger(value.revision)||value.revision<0||value.revision>=2147483647)throw Error('Revisión inválida');
 return {modules:validateModuleSchedule(value.modules),revision:value.revision};
}
export function validateScheduleRow(row){
 if(row===null)return {modules:[],revision:0};
 const clean=validateScheduleWrite({modules:row.modules,revision:row.revision});
 if(clean.revision===0)throw Error('Invalid stored revision');
 return clean;
}
/** Dependency-injected handler. Storage write must perform an atomic CAS. */
export async function accountScheduleRequest(request, deps){
 const reply=(status,body)=>({status,body});
 if(!['GET','PUT'].includes(request.method))return reply(405,{ok:false,message:'Método no permitido'});
 try{
  const owner=await deps.authenticate(request);
  if(!owner?.id)return reply(401,{ok:false,message:'No autenticado'});
  // GET permitted for own saved data even after plan expiry; only active Insigne can change nonempty data.
  if(request.method==='GET'){
   return reply(200,{ok:true,schedule:validateScheduleRow(await deps.read(owner.id))});
  }
  if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return reply(415,{ok:false,message:'Se requiere JSON'});
  let clean;
  try{
   const raw=await request.text();
   if(raw.length>2048)return reply(413,{ok:false,message:'Datos demasiado extensos'});
   clean=validateScheduleWrite(JSON.parse(raw));
  }catch{return reply(400,{ok:false,message:'Módulos o revisión inválidos'});}
  // Empty selection is a privacy-preserving erase and can never enable a premium feature.
  if(clean.modules.length&&!(await deps.entitled(owner.id)))return reply(403,{ok:false,message:'Disponible con Insigne activo'});
  const saved=await deps.compareAndSet(owner.id,clean);
  if(saved===null)return reply(409,{ok:false,message:'Los horarios cambiaron en otro dispositivo. Volvé a cargar antes de guardar.'});
  const checked=validateScheduleRow(saved);
  if(checked.revision!==clean.revision+1||JSON.stringify(checked.modules)!==JSON.stringify(clean.modules))throw Error('Write not confirmed');
  return reply(200,{ok:true,schedule:checked});
 }catch{return reply(503,{ok:false,message:'No se pudo confirmar la operación. Volvé a consultar.'});}
}
