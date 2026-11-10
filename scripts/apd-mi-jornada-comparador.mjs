/**
 * APD: optional private weekly planner for the offer comparator.
 * Local to a browser tab. No Supabase, mail, geolocation, legal eligibility,
 * transport-time predictions or connection to the official ABC platform.
 */
import {sanitizeHomeLocation} from './apd-home-georef.mjs?v=20261110-home1';
export const WEEKDAYS=Object.freeze([
 {id:1,name:'Lunes'}, {id:2,name:'Martes'}, {id:3,name:'Miércoles'},
 {id:4,name:'Jueves'}, {id:5,name:'Viernes'}, {id:6,name:'Sábado'},
 {id:7,name:'Domingo'}
]);
export const TRAVEL_GAP_OPTIONS=Object.freeze([0,15,30,45,60,90,120]);
const names=['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const normalize=value=>String(value??'').normalize('NFKC')
 .replace(/[\u200B-\u200D\u2060\uFEFF]/g,'')
 .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[\u00a0\u202f]/g,' ').toLowerCase().trim()
 .replace(/\s+/g,' ');
const minute=str=>{
 const m=String(str??'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
 return m?Number(m[1])*60+Number(m[2]):null;
};
const hhmm=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+
 String(n%60).padStart(2,'0');
const dayIndex=name=>names.indexOf(name)+1;

// Strict weekday resolver: unsupported or ambiguous days must fail closed.
function parseDays(value){
 const text=normalize(value).replace(/\blun\b/g,'lunes')
  .replace(/\bmar\b/g,'martes').replace(/\bmie\b/g,'miercoles')
  .replace(/\bjue\b/g,'jueves').replace(/\bvie\b/g,'viernes')
  .replace(/\bsab\b/g,'sabado').replace(/\bdom\b/g,'domingo');
 const each=names.join('|');
 const range=new RegExp('^('+each+')\\s+(?:a|al|hasta)\\s+('+each+')$');
 const match=text.match(range);
 if(match){
  const from=dayIndex(match[1]),to=dayIndex(match[2]);
  return from&&to&&from<=to?Array.from({length:to-from+1},(_,i)=>from+i):null;
 }
 if(names.includes(text))return [dayIndex(text)];
 const list=text.split(/\s*(?:,|;|\by\b|\s+\+\s+)\s*/).filter(Boolean);
 if(list.length>=2&&list.every(x=>names.includes(x)))
  return [...new Set(list.map(dayIndex))].sort();
 return null;
}
function parseFromString(raw){
 const text=normalize(raw);
 if(!text||/^(?:sin datos?|no informado|n\/a)$/.test(text))return null;
 // Exactly two explicit 24-hour times; no guessing based on Turno.
 const found=[...text.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g)];
 if(found.length!==2)return null;
 const start=Number(found[0][1])*60+Number(found[0][2]);
 const end=Number(found[1][1])*60+Number(found[1][2]);
 if(start>=end)return null;
 const prefix=text.slice(0,found[0].index).replace(/\s*:\s*$/,'').trim();
 const days=parseDays(prefix);
 if(!days)return null;
 // Admit ABC "HS A", punctuation and whitespace; any other suffix is unknown.
 const inBetween=text.slice(found[0].index+found[0][0].length,found[1].index);
 const endText=text.slice(found[1].index+found[1][0].length);
 const connector=inBetween.replace(/hs?\.?(?=a|\s|$)/g,'').replace(/[\s.:\-–—]/g,'');
 const suffix=endText.replace(/hs?\.?(?=\s|$)/g,'').replace(/[\s.,;:]/g,'');
 if(connector!=='a'&&connector!=='hasta')return null;
 if(suffix)return null;
 return {days,start,end};
}
export function parseOfferWeeklySchedule(raw){return parseFromString(raw)}
// ABC may declare separate time blocks for different weekdays. Each block
// must state its own days and both times; implicit repeats are NOT inferred.
export function parseOfferWeeklySegments(raw){
 const single=parseFromString(raw);
 if(single)return [single];
 const source=String(raw??'');
 if(source.length>900||!/[;|\r\n]/.test(source))return null;
 const parts=source.split(/\s*(?:[;|]|\r?\n)\s*/);
 if(parts.length<2||parts.length>8||parts.some(part=>!part.trim()))return null;
 const segments=parts.map(parseFromString);
 return segments.every(Boolean)?segments:null;
}
export function formatWeeklySchedule(raw){
 const blocks=parseOfferWeeklySegments(raw);
 if(!blocks)return String(raw??'').trim()||'No informado';
 const ordered=[...blocks].sort((a,b)=>
  a.days[0]-b.days[0]||a.start-b.start||a.end-b.end||
  a.days.join(',').localeCompare(b.days.join(',')));
 return ordered.map(p=>{
  const days=p.days;
  const label=days.length>=2&&days.every((d,i)=>d===days[0]+i)
   ?WEEKDAYS[days[0]-1].name+' a '+WEEKDAYS[days.at(-1)-1].name.toLowerCase()
   :days.map(d=>WEEKDAYS[d-1].name).join(', ');
  return label+': '+hhmm(p.start)+' a '+hhmm(p.end);
 }).join('; ');
}
export function schedulesEquivalent(a,b){
 const x=parseOfferWeeklySegments(a),y=parseOfferWeeklySegments(b);
 if(!x||!y)return null;
 const key=v=>v.days.join(',')+'|'+v.start+'|'+v.end;
 return x.map(key).sort().join(';')===y.map(key).sort().join(';');
}
export function sanitizeWorkProfile(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Perfil inválido');
 const domicile=String(data.domicile??'').trim();
 if(domicile.length>180||/[\r\n<>]/.test(domicile))throw Error('Domicilio inválido');
 const travelGapMinutes=data.travelGapMinutes===undefined?30:data.travelGapMinutes;
 if(!TRAVEL_GAP_OPTIONS.includes(travelGapMinutes))throw Error('Margen entre clases inválido');
 const jobs=data.jobs??[];
 if(!Array.isArray(jobs)||jobs.length>5)throw Error('Máximo cinco jornadas');
 const clean=jobs.map((job,index)=>{
  if(!job||typeof job!=='object'||Array.isArray(job))throw Error('Jornada inválida');
  const school=String(job.school??'').trim();
  if(school.length<2||school.length>120||/[\r\n<>]/.test(school))
   throw Error('Revisá el nombre de la escuela '+(index+1));
  const days=job.days;
  if(!Array.isArray(days)||days.length<1||days.length>7||
     !days.every(d=>Number.isInteger(d)&&d>=1&&d<=7)||
     new Set(days).size!==days.length)throw Error('Días inválidos');
  const start=String(job.start??''),end=String(job.end??'');
  if(minute(start)===null||minute(end)===null||minute(start)>=minute(end))
   throw Error('Revisá el horario de '+school);
  return {school,days:[...days].sort((a,b)=>a-b),start,end};
 });
 const homeLocation=sanitizeHomeLocation(data.homeLocation);
 // A manually edited address can never reuse stale coordinates.
 if(homeLocation&&domicile!==homeLocation.label)
  throw Error('Elegí nuevamente la dirección para verificar su ubicación');
 return {domicile,jobs:clean,travelGapMinutes,homeLocation};
}
export function checkScheduleOverlap(rawOffer,profile){
 const blocks=parseOfferWeeklySegments(rawOffer);
 if(!blocks)return {status:'unverified',label:'Horario de oferta incompleto'};
 let clean;
 try{clean=sanitizeWorkProfile(profile??{jobs:[]})}
 catch{return {status:'unverified',label:'Jornada declarada inválida'}}
 if(!clean.jobs.length)return {status:'unverified',label:'Cargá tu jornada actual para comparar'};
 const conflicts=[],transitions=[];
 const minimum=clean.travelGapMinutes;
 for(const job of clean.jobs)for(const parsed of blocks){
  const sharedDays=parsed.days.filter(d=>job.days.includes(d));
  if(!sharedDays.length)continue;
  const start=minute(job.start),end=minute(job.end);
  const beginning=Math.max(parsed.start,start);
  const ending=Math.min(parsed.end,end);
  if(beginning<ending){
   conflicts.push({school:job.school,days:sharedDays.map(x=>WEEKDAYS[x-1].name),
    from:hhmm(beginning),to:hhmm(ending)});
   continue;
  }
  // Gap is a clock difference, not an actual route or travel estimate.
  if(minimum===0)continue;
  const jobBeforeOffer=end<=parsed.start;
  const offerBeforeJob=parsed.end<=start;
  const gap=jobBeforeOffer?parsed.start-end:offerBeforeJob?start-parsed.end:null;
  if(gap!==null&&gap<minimum){
   transitions.push({school:job.school,days:sharedDays.map(x=>WEEKDAYS[x-1].name),
    gapMinutes:gap,direction:jobBeforeOffer?'jornada-antes':'oferta-antes'});
  }
 }
 if(conflicts.length)return {status:'overlap',label:'Superposición horaria',
  conflicts,transitions,travelGapMinutes:minimum};
 if(transitions.length)return {status:'tight-transition',
  label:'Poco margen entre horarios: traslado a revisar',
  conflicts:[],transitions,travelGapMinutes:minimum};
 return {status:'no-overlap',label:'Sin superposición horaria declarada',
  conflicts:[],transitions:[],travelGapMinutes:minimum};
}

/**
 * Pairwise, read-only comparison between selected ABC offers.
 * Detects clock intersections independently of a teacher's private work profile.
 * A simultaneous appointment, legal compatibility or eligibility is NEVER inferred.
 */
function parseCivilDate(value){
 const raw=String(value??'').trim();
 const iso=raw.match(/^(20\d{2})-(\d{2})-(\d{2})(?:T.*)?$/);
 const local=raw.match(/^(\d{2})\/(\d{2})\/(20\d{2})$/);
 if(!iso&&!local)return null;
 const [year,month,day]=(iso?[iso[1],iso[2],iso[3]]:
  [local[3],local[2],local[1]]).map(Number);
 const ms=Date.UTC(year,month-1,day);
 const check=new Date(ms);
 return check.getUTCFullYear()===year&&check.getUTCMonth()+1===month&&
  check.getUTCDate()===day?ms:null;
}
function offerPeriod(offer){
 const start=parseCivilDate(offer?.supl_desde);
 const end=parseCivilDate(offer?.supl_hasta);
 return start!==null&&end!==null&&start<=end?{start,end}:null;
}
export function compareSelectedOfferSchedules(offers){
 if(!Array.isArray(offers)||offers.length<2||offers.length>5)
  throw Error('Se requieren de dos a cinco ofertas');
 const comparisons=[];
 for(let i=0;i<offers.length;i++)for(let j=i+1;j<offers.length;j++){
  const a=offers[i],b=offers[j];
  const blocksA=parseOfferWeeklySegments(a?.horario);
  const blocksB=parseOfferWeeklySegments(b?.horario);
  const base={firstOffer:i+1,secondOffer:j+1};
  if(!blocksA||!blocksB){
   comparisons.push({...base,status:'unverified',
    label:'Horarios insuficientes para evaluar'});
   continue;
  }
  const periodA=offerPeriod(a),periodB=offerPeriod(b);
  const candidates=[];
  for(const first of blocksA)for(const second of blocksB){
   const days=first.days.filter(d=>second.days.includes(d));
   const from=Math.max(first.start,second.start);
   const to=Math.min(first.end,second.end);
   if(!days.length||from>=to)continue;
   const common={...base,days:days.map(d=>WEEKDAYS[d-1].name),
    from:hhmm(from),to:hhmm(to)};
   if(periodA&&periodB&&
     (periodA.end<periodB.start||periodB.end<periodA.start)){
    candidates.push({...common,status:'separate-periods',
     label:'Horarios coincidentes, pero las vigencias informadas no se cruzan'});
   }else if(periodA&&periodB){
    const start=Math.max(periodA.start,periodB.start);
    const end=Math.min(periodA.end,periodB.end);
    const weekday=new Date(start).getUTCDay()||7;
    const dayMilliseconds=86400000;
    const matchingDates=days.filter(day=>
     start+((day-weekday+7)%7)*dayMilliseconds<=end);
    if(matchingDates.length){
     candidates.push({...common,days:matchingDates.map(d=>WEEKDAYS[d-1].name),
      status:'overlap',label:'Cruce de días, horas y vigencias informadas'});
    }else{
     candidates.push({...common,status:'no-shared-date',
      label:'Los períodos coinciden, pero no incluyen un día semanal común'});
    }
   }else{
    candidates.push({...common,status:'possible-overlap',
     label:'Cruce horario potencial; fechas de vigencia incompletas'});
   }
  }
  if(!candidates.length){
   comparisons.push({...base,status:'no-time-overlap',
    label:'Sin cruces de días y horas declarados'});
   continue;
  }
  const severity={overlap:0,'possible-overlap':1,'no-shared-date':2,
   'separate-periods':3};
  candidates.sort((x,y)=>
   severity[x.status]-severity[y.status]||x.from.localeCompare(y.from));
  const winner=candidates[0];
  // Preserve all intersections, not only the first one in a multi-block
  // timetable. The UI shows each interval and any unverified-period warning.
  const matches=candidates.filter(x=>
   x.status==='overlap'||x.status==='possible-overlap').map(x=>({
    days:x.days,from:x.from,to:x.to,status:x.status
   }));
  comparisons.push({...winner,matches});
 }
 return comparisons;
}
