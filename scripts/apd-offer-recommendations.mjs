/** Deterministic decision support for already-visible offers. No network, storage or hiring probabilities. */
import {compareOffers} from './apd-comparador-criterios.mjs?v=20261109-decision1';
import {checkScheduleOverlap} from './apd-mi-jornada-comparador.mjs?v=20261124-modulos';
import {straightLineHomeSchoolKm} from './apd-home-georef.mjs?v=20261110-home4';
const groupOrder={observed:0,review:1,conflict:2};
const orderNumber=(a,b)=>(a??Infinity)===(b??Infinity)?0:(a??Infinity)<(b??Infinity)?-1:1;
export function recommendOffers({offers=[],profile,now=new Date(),preferredDistricts=[],preferredTurns=[],verifiedGeoByKey={},sort='cierre',applicantSummaries={}}={}){
 if(!Array.isArray(offers)||!['cierre','distancia'].includes(sort))throw Error('Entrada inválida');
 const seen=new Set(),items=[],excluded=[];
 // compareOffers accepts at most five; the recommendation intentionally evaluates the full visible set, not just selected offers.
 for(const offer of offers){
  const key=String(offer?.source_offer_key??'');
  if(!key||seen.has(key))continue;
  seen.add(key);
  const compared=compareOffers({offers:[offer],now,preferredDistricts,preferredTurns,applicantSummaries});
  const row=compared.items[0];
  if(!row){excluded.push(...compared.excluded);continue;}
  const timing=checkScheduleOverlap(row.horario,profile);
  const pidBad=row.pid_match_verified===false||row.pid_compatible_panel===false;
  const pidGood=!pidBad&&(row.pid_match_verified===true||row.pid_compatible_panel===true);
  const mismatch=row.district_preferred===false||row.turn_preferred===false;
  const group=pidBad||timing.status==='overlap'?'conflict':
   timing.status==='no-overlap'&&pidGood&&row.cierre_ms!==null&&!mismatch?'observed':'review';
  const reasons=[timing.label,pidBad?'PID no coincidente según datos del panel':pidGood?'Coincidencia PID observada (no certifica elegibilidad)':'PID sin confirmar'];
  if(row.cierre_ms===null)reasons.push('Cierre sin verificar');
  if(row.district_preferred===false)reasons.push('Fuera del distrito elegido');
  if(row.turn_preferred===false)reasons.push('Fuera del turno elegido');
  if(row.district_preferred===true)reasons.push('Distrito elegido');
  if(row.turn_preferred===true)reasons.push('Turno elegido');
  const geoKey=row.escuela.toUpperCase(),geo=Object.hasOwn(verifiedGeoByKey,geoKey)?verifiedGeoByKey[geoKey]:null;
  const km=geo?.clave===geoKey&&profile?.homeLocation?.scope==='exacta'?straightLineHomeSchoolKm(profile.homeLocation,geo):null;
  items.push({...row,group,reasons,km,
   preferenceCount:Number(row.district_preferred===true)+Number(row.turn_preferred===true)});
 }
 items.sort((a,b)=>groupOrder[a.group]-groupOrder[b.group]||b.preferenceCount-a.preferenceCount||
  (sort==='distancia'?orderNumber(a.km,b.km):0)||orderNumber(a.cierre_ms,b.cierre_ms)||
  a.source_offer_key.localeCompare(b.source_offer_key,'es'));
 return {items,excluded,counts:Object.fromEntries(Object.keys(groupOrder).map(g=>[g,items.filter(r=>r.group===g).length]))};
}
