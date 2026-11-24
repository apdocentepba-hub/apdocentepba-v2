import {parseOfferWeeklySegments} from './apd-mi-jornada-comparador.mjs';
import {estimateOfferEconomics} from './apd-offer-economics.mjs';
/** Calendar estimate only; holidays, leave, start/end dates and salary remain user inputs. */
export function estimateCalendarWorkDays(raw,month){
 if(typeof month!=='string'||!/^(20[2-9]\d)-(0[1-9]|1[0-2])$/.test(month))throw Error('Mes inválido');
 const blocks=parseOfferWeeklySegments(raw);
 if(!blocks||!blocks.length)return null;
 const days=new Set(blocks.flatMap(b=>b.days));
 if(!days.size||[...days].some(d=>!Number.isInteger(d)||d<1||d>7))return null;
 const [year,m]=month.split('-').map(Number);
 const end=new Date(Date.UTC(year,m,0)).getUTCDate();
 let total=0;
 for(let date=1;date<=end;date++)if(days.has(new Date(Date.UTC(year,m-1,date)).getUTCDay()||7))total++;
 return {month,days:total,weekdays:[...days].sort((a,b)=>a-b),scope:'calendar_before_holidays_and_leave'};
}
export function estimateCalendarEconomics({schedule,month,excludedDays=0,...amounts}={}){
 const calendar=estimateCalendarWorkDays(schedule,month);
 if(!calendar)return null;
 if(!Number.isInteger(excludedDays)||excludedDays<0||excludedDays>calendar.days)throw Error('Días excluidos inválidos');
 return {calendar,workDays:calendar.days-excludedDays,estimate:estimateOfferEconomics({...amounts,workDays:calendar.days-excludedDays})};
}
