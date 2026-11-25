/** Manual application diary, explicitly self-reported; no ABC writes. */
const statuses=new Set(['postulada','en_evaluacion','adjudicada','no_adjudicada','retirada','sin_confirmar']);
const validKey=k=>typeof k==='string'&&k.length>0&&k.length<=160&&!/[^A-Za-z0-9_.:|-]/.test(k);
export function normalizeApplicationEntries(entries){
 if(!Array.isArray(entries)||entries.length>100)throw Error('Historial inválido');
 const rows=new Map();
 for(const e of entries){
  if(!validKey(e?.key)||rows.has(e.key)||!statuses.has(e.status)||e.origin!=='self_reported'||typeof e.updatedAt!=='string'||!Number.isFinite(Date.parse(e.updatedAt)))throw Error('Historial inválido');
  rows.set(e.key,{key:e.key,status:e.status,origin:e.origin,updatedAt:e.updatedAt});
 }
 return rows;
}
export function updateApplicationDiary(record,mutation,now=new Date()){
 if(!record||!Number.isSafeInteger(record.revision)||record.revision<0||!mutation||typeof mutation!=='object'||!validKey(mutation.key)||!['set','remove'].includes(mutation.action)||!Number.isSafeInteger(mutation.revision)||!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('Registro inválido');
 const rows=normalizeApplicationEntries(record.entries);
 if(mutation.revision!==record.revision)return {ok:false,code:'conflict'};
 const old=rows.get(mutation.key);
 if(mutation.action==='set'){
  if(!statuses.has(mutation.status))throw Error('Estado inválido');
  if(old?.status===mutation.status)return {ok:true,record,changed:false};
  if(!old&&rows.size===100)throw Error('Límite de registros');
  rows.set(mutation.key,{key:mutation.key,status:mutation.status,origin:'self_reported',updatedAt:now.toISOString()});
 }else{
  if(!old)return {ok:true,record,changed:false};
  rows.delete(mutation.key);
 }
 if(record.revision===Number.MAX_SAFE_INTEGER)return {ok:false,code:'conflict'};
 return {ok:true,changed:true,record:{revision:record.revision+1,entries:[...rows.values()].sort((a,b)=>a.key.localeCompare(b.key))}};
}
