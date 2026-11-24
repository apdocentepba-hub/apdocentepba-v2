/** In-memory favorites only. No account identifiers or personal applicant information. */
import {compareOffers} from './apd-comparador-criterios.mjs?v=20261109-decision1';
const keyOk=/^[A-Za-z0-9_.:|-]{1,160}$/;
const text=v=>String(v??'').trim().slice(0,180);
export function createFavoriteOffers(){
 const saved=new Map();
 const snapshot=(offer,key)=>Object.freeze({
  source_offer_key:key,cargo:text(offer.descripcioncargo||offer.cargo),distrito:text(offer.distrito),
  escuela:text(offer.escuela),turno:text(offer.turno),estado:text(offer.estado),
  finoferta:text(offer.finoferta),finoferta_label:text(offer.finoferta_label),fecha_cierre:text(offer.fecha_cierre)
 });
 function describe(offer,now){
  const result=compareOffers({offers:[offer],now});
  const row=result.items[0];
  if(!row)return {status:'closed',label:'Cerrada o vencida',deadline:null};
  if(row.cierre_ms===null)return {status:'unknown',label:'Cierre sin verificar',deadline:null};
  const remaining=row.cierre_ms-now.getTime();
  return {status:remaining<=86400000?'soon':'future',label:remaining<=86400000?'Cierre informado dentro de 24 h':'Cierre informado futuro',deadline:row.cierre_ms};
 }
 return Object.freeze({
  has:key=>saved.has(key),
  count:()=>saved.size,
  clear:()=>saved.clear(),
  remove:key=>saved.delete(key),
  add(offer,key,now=new Date()){
   if(!offer||!keyOk.test(key)||typeof key!=='string')throw Error('Oferta sin identificación válida');
   const data=snapshot(offer,key);
   if(describe(data,now).status==='closed')throw Error('La oferta ya está cerrada o vencida');
   if(!saved.has(key)&&saved.size>=50)throw Error('Máximo 50 favoritos por sesión');
   saved.set(key,data);
  },
  refresh(offers,keyOf){
   const visible=new Set();
   for(const offer of offers){
    const key=keyOf(offer);if(!saved.has(key)||visible.has(key))continue;
    visible.add(key);
    // Never let a missing field silently replace a known closing date.
    const next=snapshot(offer,key),old=saved.get(key);
    const hasDeadline=!!(next.finoferta||next.finoferta_label||next.fecha_cierre);
    saved.set(key,Object.freeze({...next,
     cargo:next.cargo||old.cargo,distrito:next.distrito||old.distrito,
     escuela:next.escuela||old.escuela,turno:next.turno||old.turno,
     estado:next.estado||old.estado,
     ...(!hasDeadline?{finoferta:old.finoferta,finoferta_label:old.finoferta_label,fecha_cierre:old.fecha_cierre}:{})
    }));
   }
   return visible;
  },
  list(visible=new Set(),now=new Date()){
   return [...saved.values()].map(offer=>({...offer,...describe(offer,now),visible:visible.has(offer.source_offer_key)}))
    .sort((a,b)=>(a.status==='closed')-(b.status==='closed')||(a.deadline??Infinity)-(b.deadline??Infinity)||a.source_offer_key.localeCompare(b.source_offer_key));
  }
 });
}
