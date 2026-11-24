import {validateFavoriteKey} from './apd-account-favorites-core.mjs';
import {parseClosure} from './apd-comparador-criterios.mjs';
const closed=new Set(['ANULADA','ANULADO','CANCELADA','CANCELADO','DESIERTA','DESIERTO','DESIGNADA','DESIGNADO','CERRADA','CERRADO','FINALIZADA','FINALIZADO','NO VIGENTE','VENCIDA','VENCIDO']);
/** Only the authoritative indexed identity is accepted. Missing does not mean closed.
 * This index is a historical mirror, not live ABC: an unexpired record is still unknown.
 */
export function createFavoriteResolver({select,now=()=>Date.now()}){
 return async key=>{
  validateFavoriteKey(key);
  const rows=await select('apd_ofertas_global_current?source_offer_key=eq.'+encodeURIComponent(key)+'&select=source_offer_key,estado,finoferta&limit=2');
  if(!Array.isArray(rows)||rows.length>1)throw Error('Ambiguous offer identity');
  if(!rows.length)return null;
  const row=rows[0];
  if(row?.source_offer_key!==key)throw Error('Offer identity mismatch');
  const state=String(row.estado??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const deadline=parseClosure(row.finoferta,{abcWallTime:true});
  return {key,status:closed.has(state)||(deadline!==null&&deadline<=now())?'closed':'unknown'};
 };
}
