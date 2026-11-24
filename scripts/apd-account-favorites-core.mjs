/** Candidate only: private favorite identity set; no browser-supplied offer metadata. */
export const FAVORITE_LIMIT=50;
export function validateFavoriteKey(key){
 if(typeof key!=='string'||key.length<1||key.length>160||/[^A-Za-z0-9_.:|-]/.test(key))throw Error('Identificador inválido');
 return key;
}
function validRevision(n){return Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;}
export function validateFavoriteRow(row){
 if(row===null)return {keys:[],revision:0};
 if(!row||!validRevision(row.revision)||row.revision===0||!Array.isArray(row.keys)||row.keys.length>FAVORITE_LIMIT)throw Error('Registro inválido');
 const keys=row.keys.map(validateFavoriteKey);
 if(new Set(keys).size!==keys.length)throw Error('Registro duplicado');
 return {keys:keys.sort(),revision:row.revision};
}
export function validateFavoriteMutation(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==3||
 Object.keys(p).some(k=>!['action','key','revision'].includes(k))||
 !['add','remove'].includes(p.action)||!validRevision(p.revision))throw Error('Operación inválida');
 return {action:p.action,key:validateFavoriteKey(p.key),revision:p.revision};
}
/** Adapter contracts: authenticate from session, resolve official identity and status,
 * compareAndSet atomically by owner + revision (null on conflict).
 * Resolver must never treat missing records as closed or accept client metadata.
 */
export async function accountFavoritesRequest(request,deps){
 const reply=(status,body)=>({status,body});
 const fail=(status,message)=>reply(status,{ok:false,message});
 if(!['GET','PUT'].includes(request.method))return fail(405,'Método no permitido');
 try{
  const owner=await deps.authenticate(request);
  if(!owner?.id)return fail(401,'No autenticado');
  if(request.method==='GET')return reply(200,{ok:true,favorites:validateFavoriteRow(await deps.read(owner.id))});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return fail(415,'Se requiere JSON');
  let input;
  try{
   const raw=await request.text();
   if(raw.length>1024)return fail(413,'Datos demasiado extensos');
   input=validateFavoriteMutation(JSON.parse(raw));
  }catch{return fail(400,'Operación inválida');}
  if(input.action==='add'&&!(await deps.entitled(owner.id)))return fail(403,'Disponible con Insigne activo');
  const row=validateFavoriteRow(await deps.read(owner.id));
  if(row.revision!==input.revision)return fail(409,'Los favoritos cambiaron. Volvé a cargar.');
  const keys=new Set(row.keys);
  if(input.action==='add'){
   if(keys.has(input.key))return reply(200,{ok:true,favorites:row});
   if(keys.size>=FAVORITE_LIMIT)return fail(409,'Máximo 50 favoritos por cuenta');
   const offer=await deps.resolveOffer(input.key);
   if(!offer||offer.key!==input.key||!['open','unknown'].includes(offer.status))return fail(422,'Oferta no verificable o cerrada');
   keys.add(input.key);
  }else{
   if(!keys.delete(input.key))return reply(200,{ok:true,favorites:row});
  }
  if(row.revision===Number.MAX_SAFE_INTEGER)return fail(409,'Revisión agotada; contactá soporte');
  const next=[...keys].sort();
  const saved=await deps.compareAndSet(owner.id,{keys:next,revision:row.revision});
  if(saved===null)return fail(409,'Los favoritos cambiaron. Volvé a cargar.');
  const confirmed=validateFavoriteRow(saved);
  if(confirmed.revision!==row.revision+1||JSON.stringify(confirmed.keys)!==JSON.stringify(next))throw Error('Escritura no confirmada');
  return reply(200,{ok:true,favorites:confirmed});
 }catch{return fail(503,'No se pudo confirmar la operación. Volvé a consultar.');}
}
