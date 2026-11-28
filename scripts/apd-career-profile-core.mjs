/** Career profile candidate; no storage, network, or inferred salary values.
 * Exact clock blocks and salary quantity are deliberately independent.
 * Existing checked modules remain intact until a confirmed account migration.
 */
import {validateModuleSchedule} from './apd-account-schedule-core.mjs';
const safeText=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max&&!/[<>\x00-\x1f]/.test(s)?s.trim():null;
const clock=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
const key=s=>typeof s==='string'&&/^[0-9]{4}[A-Z]{2}[0-9]{4}$/.test(s);
const kinds=['cargo','modulo','hora_catedra'];
const statuses=['titular','provisional','suplente','otro'];
export function validateCareerProfile(input){
 if(!input||typeof input!=='object'||input.schema!==1||!Number.isInteger(input.seniorityYears)||input.seniorityYears<0||input.seniorityYears>80||!Array.isArray(input.positions)||input.positions.length>42)throw Error('Perfil profesional inválido');
 const ids=new Set(),owners=new Map();
 const positions=input.positions.map(p=>{
  if(!p||typeof p!=='object'||!safeText(p.id,80)||ids.has(p.id)||!key(p.schoolKey)||!safeText(p.school,120)||!safeText(p.role,100)||!safeText(p.level,80)||!kinds.includes(p.kind)||!statuses.includes(p.status)||!Number.isInteger(p.quantity)||p.quantity<1||p.quantity>77||(p.kind==='cargo'&&p.quantity!==1)||!Array.isArray(p.blocks)||p.blocks.length<1||p.blocks.length>42)throw Error('Cargo inválido');
  ids.add(p.id);
  const modules=validateModuleSchedule(p.modules);
  for(const m of modules){if(owners.has(m))throw Error('Un módulo tiene más de un cargo asignado');owners.set(m,p.id);}
  const blocks=p.blocks.map(x=>{
   if(!x||!Number.isInteger(x.day)||x.day<1||x.day>7||clock(x.start)===null||clock(x.end)===null||clock(x.start)>=clock(x.end))throw Error('Horario reloj inválido');
   return {day:x.day,start:x.start,end:x.end};
  });
  // No user-entered school name or classification confers verified rurality.
  return {id:p.id,schoolKey:p.schoolKey,school:p.school.trim(),role:p.role.trim(),level:p.level.trim(),kind:p.kind,status:p.status,quantity:p.quantity,modules,blocks};
 });
 return {schema:1,seniorityYears:input.seniorityYears,positions};
}
export function projectCareerSchedule(profile,legacyModules){
 const clean=validateCareerProfile(profile),legacy=validateModuleSchedule(legacyModules);
 const assigned=new Set(clean.positions.flatMap(p=>p.modules));
 return {modules:validateModuleSchedule([...new Set([...legacy,...assigned])]),unassignedModules:legacy.filter(m=>!assigned.has(m)),
  jobs:clean.positions.flatMap(p=>p.blocks.map(b=>({school:p.school,schoolKey:p.schoolKey,days:[b.day],start:b.start,end:b.end})))};
}
/** Exact match, date-labelled public evidence; never turn missing data into zero. */
export function lookupSchoolClassification(schoolKey,rows){
 if(!key(schoolKey)||!Array.isArray(rows))return {status:'unknown'};
 const found=rows.filter(r=>r?.schoolKey===schoolKey);
 if(found.length!==1)return {status:'unknown'};
 const r=found[0];if(!safeText(r.classification,60)||!/^20\d{2}-\d{2}-\d{2}$/.test(r.asOf||'')||r.source!=='DGCYE_PBA')return {status:'unknown'};
 const d=new Date(r.asOf+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==r.asOf)return {status:'unknown'};
 return {status:'reported',classification:r.classification.trim(),asOf:r.asOf,source:r.source};
}
/** Marginal comparison using two whole-payroll estimates with comparable provenance. */
export function marginalPay(before,after){
 for(const v of [before,after])if(!v||!['FEB','SUTEBA','RECIBO_MANUAL'].includes(v.source)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v.period||'')||!Number.isSafeInteger(v.netCentavos)||v.netCentavos<0)throw Error('Liquidación inválida');
 if(before.period!==after.period||before.source!==after.source)throw Error('Compará el mismo período y método');
 return {currentCentavos:before.netCentavos,combinedCentavos:after.netCentavos,deltaCentavos:after.netCentavos-before.netCentavos,period:before.period,source:before.source};
}

/** Confirmed career supplements the legacy timetable in memory, never replaces it on disk.
 * Retain every old occupancy marker until its exact mapping has been independently resolved.
 */
export function mergeConfirmedCareerPlanner(base,record,{normalizeSchoolKey=()=>null}={}){
 if(!record||record.revision===0&&record.profile===null)return base;
 if(!Number.isSafeInteger(record.revision)||record.revision<1)throw Error('Revisión inválida');
 const projection=projectCareerSchedule(record.profile,base.moduleSchedule||[]);
 const jobs=[],seen=new Set();
 for(const job of [...(base.jobs||[]),...projection.jobs]){
  const key=normalizeSchoolKey(job.schoolKey),clean={...job};
  if(key)clean.schoolKey=key;else delete clean.schoolKey;
  const sig=JSON.stringify([clean.schoolKey||clean.school,clean.days,clean.start,clean.end]);
  if(!seen.has(sig)){seen.add(sig);jobs.push(clean);}
 }
 // Existing work-profile validation rejects >42 blocks; do not truncate and
 // accidentally treat an occupied period as free.
 return {...base,jobs,moduleSchedule:projection.modules};
}
