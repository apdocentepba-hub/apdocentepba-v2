/** Read-only weekly what-if. No persistent writes, no legal or hiring inference. */
import {WEEKDAYS,parseOfferWeeklySegments,sanitizeWorkProfile,checkScheduleOverlap} from './apd-mi-jornada-comparador.mjs?v=20261124-modulos';
const clock=s=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
export function mergeIntervals(intervals){
 const result=[];
 for(const v of intervals.map(x=>[...x]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])){
  const last=result.at(-1);
  if(last&&v[0]<=last[1])last[1]=Math.max(last[1],v[1]);
  else result.push(v);
 }
 return result;
}
const duration=intervals=>mergeIntervals(intervals).reduce((sum,[a,b])=>sum+b-a,0);
const hhmm=v=>String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0');
export const intervalText=intervals=>intervals.length?intervals.map(([a,b])=>hhmm(a)+'–'+hhmm(b)).join(' · '):'—';
export function simulateWeek(rawOffer,profile){
 const proposed=parseOfferWeeklySegments(rawOffer);
 let clean;
 try{clean=sanitizeWorkProfile(profile??{jobs:[]});}
 catch{return {status:'unverified',reason:'Tu jornada actual no se pudo interpretar.',days:[],totals:null};}
 if(!proposed)return {status:'unverified',reason:'La oferta no informa un horario semanal verificable.',days:[],totals:null};
 const declared=clean.jobs.length>0||Array.isArray(clean.moduleSchedule);
 const days=WEEKDAYS.map(day=>{
  const modules=(clean.moduleSchedule||[]).filter(v=>Number(v[3])===day.id);
  const morning=modules.filter(v=>v[0]==='M').map(v=>{const a=440+(Number(v[1])-1)*60;return [a,a+60]});
  const afternoon=modules.filter(v=>v[0]==='T').map(v=>v[1]==='0'?'Prehora':v[1]);
  const exact=clean.jobs.filter(v=>v.days.includes(day.id)).map(v=>[clock(v.start),clock(v.end)]);
  const offer=mergeIntervals(proposed.filter(v=>v.days.includes(day.id)).map(v=>[v.start,v.end]));
  const current=mergeIntervals([...exact,...morning]);
  const combined=mergeIntervals([...current,...offer]);
  const overlaps=mergeIntervals(current.flatMap(([a,b])=>offer.flatMap(([c,d])=>Math.max(a,c)<Math.min(b,d)?[[Math.max(a,c),Math.min(b,d)]]:[])));
  return {id:day.id,name:day.name,current,offer,combined,overlaps,afternoon,referenceMorning:morning.length>0,complete:declared&&!afternoon.length};
 });
 const complete=days.every(d=>d.complete);
 const sum=key=>days.reduce((n,d)=>n+duration(d[key]),0);
 const verified=checkScheduleOverlap(rawOffer,clean);
 return {status:verified.status,reason:verified.label,days,declared,
  referenceMorning:days.some(d=>d.referenceMorning),
  totals:{offerMinutes:sum('offer'),currentMinutes:complete?sum('current'):null,
   combinedMinutes:complete?sum('combined'):null,overlapMinutes:sum('overlaps')}};
}
