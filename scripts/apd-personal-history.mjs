/** Read-only projection of the existing authenticated historical summary. Never a live feed. */
import {compareOffers} from './apd-comparador-criterios.mjs?v=20261109-decision1';
export const HISTORY_WINDOWS=Object.freeze([7,30,90,120]);
const text=v=>typeof v==='string'?v.trim().slice(0,180):'';
const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const instant=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))?v:null;
export function projectPersonalHistory(data,days,now=new Date()){
 if(!HISTORY_WINDOWS.includes(days)||!data||data.ok!==true||data.ventana_dias!==days||typeof data.empty!=='boolean')throw Error('Respuesta histórica incompleta');
 const total=count(data.ofertas_unicas);
 if(total===null||(data.empty&&total!==0)||(!data.empty&&total===0)||!Array.isArray(data.ultimas_ofertas))throw Error('Resumen histórico inválido');
 const rows=[],seen=new Set();
 for(const source of data.ultimas_ofertas.slice(0,6)){
  if(!source||typeof source!=='object')continue;
  const id=String(source.iddetalle??'').trim(),idOffer=String(source.idoferta??'').trim();
  const key=/^\d{1,14}$/.test(id)?'D_'+id:/^\d{1,14}$/.test(idOffer)?'O_'+idOffer:null;
  if(!key||seen.has(key))continue;
  seen.add(key);
  const capturedAt=instant(source.captured_at);
  const compared=compareOffers({offers:[{source_offer_key:key,estado:text(source.estado),finoferta:text(source.finoferta)}],now});
  const reason=compared.excluded[0]?.reason;
  const status=reason==='official_status_closed'?'Estado cerrado en captura':
   reason==='confirmed_deadline_passed'?'Vencida según cierre informado':
   compared.items[0]?.cierre_ms!=null?'Cierre informado futuro; vigencia actual no comprobada':'Vigencia no comprobada';
  rows.push({key,cargo:text(source.cargo),area:text(source.area),district:text(source.distrito),school:text(source.escuela),turn:text(source.turno),capturedState:text(source.estado),capturedAt,status});
 }
 return {days,total,empty:data.empty,latest:instant(data.ultima_captura),captures:count(data.capturas_filtradas),rows,
 message:data.empty?text(data.message):'',partial:true};
}
