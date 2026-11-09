/**
 * APD: optional private weekly planner for the offer comparator.
 * Local to a browser tab. No Supabase, mail, geolocation, legal eligibility,
 * transport-time predictions or connection to the official ABC platform.
 */
export const WEEKDAYS=Object.freeze([
 {id:1,name:'Lunes'}, {id:2,name:'Martes'}, {id:3,name:'Miércoles'},
 {id:4,name:'Jueves'}, {id:5,name:'Viernes'}, {id:6,name:'Sábado'},
 {id:7,name:'Domingo'}
]);
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
 const connector=inBetween.replace(/\bhs?\.?\b/g,'').replace(/[\s.:\-–—]/g,'');
 const suffix=endText.replace(/\bhs?\.?\b/g,'').replace(/[\s.,;:]/g,'');
 if(connector!=='a'&&connector!=='hasta')return null;
 if(suffix)return null;
 return {days,start,end};
}
export function parseOfferWeeklySchedule(raw){return parseFromString(raw)}
export function formatWeeklySchedule(raw){
 const p=parseFromString(raw);
 if(!p)return String(raw??'').trim()||'No informado';
 const days=p.days;
 const label=days.length>=2&&days.every((d,i)=>d===days[0]+i)
  ?WEEKDAYS[days[0]-1].name+' a '+WEEKDAYS[days.at(-1)-1].name
  :days.map(d=>WEEKDAYS[d-1].name).join(', ');
 return label+': '+hhmm(p.start)+' a '+hhmm(p.end);
}
export function schedulesEquivalent(a,b){
 const x=parseFromString(a),y=parseFromString(b);
 if(!x||!y)return null;
 return x.start===y.start&&x.end===y.end&&
  x.days.length===y.days.length&&x.days.every((d,i)=>d===y.days[i]);
}
export function sanitizeWorkProfile(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Perfil inválido');
 const domicile=String(data.domicile??'').trim();
 if(domicile.length>180||/[\r\n<>]/.test(domicile))throw Error('Domicilio inválido');
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
 return {domicile,jobs:clean};
}
export function checkScheduleOverlap(rawOffer,profile){
 const parsed=parseFromString(rawOffer);
 if(!parsed)return {status:'unverified',label:'Horario de oferta incompleto'};
 const jobs=profile?.jobs||[];
 if(!jobs.length)return {status:'unverified',label:'Cargá tu jornada actual para comparar'};
 const conflicts=[];
 for(const job of jobs){
  const overlap=parsed.days.filter(d=>job.days.includes(d));
  const beginning=Math.max(parsed.start,minute(job.start));
  const ending=Math.min(parsed.end,minute(job.end));
  if(overlap.length&&beginning<ending){
   conflicts.push({school:job.school,days:overlap.map(x=>WEEKDAYS[x-1].name),
    from:hhmm(beginning),to:hhmm(ending)});
  }
 }
 if(conflicts.length)return {status:'overlap',label:'Superposición horaria',conflicts};
 return {status:'no-overlap',label:'Sin superposición horaria declarada',conflicts:[]};
}
