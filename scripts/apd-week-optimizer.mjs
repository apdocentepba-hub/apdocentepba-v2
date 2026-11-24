/** Exact search over up to 12 explicitly selected offers, offline only. */
import {extractOfferSchedule,parseClosure} from './apd-comparador-criterios.mjs';
import {parseOfferWeeklySegments,sanitizeWorkProfile,checkScheduleOverlap} from './apd-mi-jornada-comparador.mjs';
const closed=new Set(['ANULADA','ANULADO','CANCELADA','CANCELADO','DESIERTA','DESIERTO','DESIGNADA','DESIGNADO','CERRADA','CERRADO','FINALIZADA','FINALIZADO','NO VIGENTE','VENCIDA','VENCIDO']);
const minutes=blocks=>blocks.reduce((sum,b)=>sum+b.days.length*(b.end-b.start),0);
function compatible(a,b,gap){
 for(const x of a)for(const y of b){
  if(!x.days.some(d=>y.days.includes(d)))continue;
  if(x.start<y.end&&y.start<x.end)return false;
  if(Math.max(y.start-x.end,x.start-y.end)<gap)return false;
 }
 return true;
}
function uniqueBlocks(blocks){
 const expanded=blocks.flatMap(b=>b.days.map(d=>({days:[d],start:b.start,end:b.end})));
 return expanded.every((a,i)=>expanded.slice(i+1).every(b=>compatible([a],[b],0)));
}
export function optimizeWeeklyOffers({offers,profile,now=new Date(),objective='count'}={}){
 if(!Array.isArray(offers)||offers.length>12||!['count','minutes'].includes(objective)||!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('Datos de optimización inválidos');
 const p=sanitizeWorkProfile(profile??{jobs:[]}),eligible=[],excluded=[];
 const ids=new Set();
 for(const offer of offers){
  const key=offer?.source_offer_key;
  if(typeof key!=='string'||key.length<1||key.length>160||/[^A-Za-z0-9_.:|-]/.test(key)||ids.has(key))throw Error('Identidad inválida o duplicada');
  ids.add(key);
  const state=String(offer.estado??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const abc=String(offer.finoferta??'').trim(),deadline=parseClosure(abc||offer.finoferta_label||offer.fecha_cierre,{abcWallTime:!!abc});
  const raw=extractOfferSchedule(offer),blocks=parseOfferWeeklySegments(raw);
  let reason=null;
  if(closed.has(state)||deadline!==null&&deadline<=now.getTime())reason='closed';
  else if(deadline===null)reason='deadline-unverified';
  else if(!blocks||!uniqueBlocks(blocks))reason='schedule-unverified';
  else {
   const status=checkScheduleOverlap(raw,p).status;
   if(status!=='no-overlap')reason=status;
  }
  if(reason){excluded.push({key,reason});continue;}
  eligible.push({key,blocks,minutes:minutes(blocks)});
 }
 eligible.sort((a,b)=>a.key.localeCompare(b.key));
 let best={keys:[],minutes:0};
 const better=c=>objective==='count'?c.keys.length>best.keys.length||c.keys.length===best.keys.length&&c.minutes>best.minutes:c.minutes>best.minutes||c.minutes===best.minutes&&c.keys.length>best.keys.length;
 function walk(start,selected,total){
  const candidate={keys:selected.map(x=>x.key),minutes:total};
  if(better(candidate))best=candidate;
  for(let j=start;j<eligible.length;j++){
   const next=eligible[j];
   if(selected.every(x=>compatible(x.blocks,next.blocks,p.travelGapMinutes)))walk(j+1,[...selected,next],total+next.minutes);
  }
 }
 walk(0,[],0);
 return {objective,best,eligible:eligible.map(({key,minutes})=>({key,minutes})),excluded,limit:12,disclaimer:'Combinación horaria orientativa según datos informados; vigencia, traslado real y requisitos deben verificarse en ABC.'};
}
