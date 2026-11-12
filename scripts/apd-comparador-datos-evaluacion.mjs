import {parseOfferWeeklySegments,formatWeeklySchedule} from './apd-mi-jornada-comparador.mjs?v=20261112-dothour1';
/**
 * APD comparator presentation-only checks. No network, auth or persistence.
 * Prevent false highlights from superficial ABC formatting differences.
 * Never fabricate a course number when the source only reports "0" or "A".
 */
const text=v=>String(v??'').trim();
const ascii=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const unknownCourse=value=>/^(?:0|[-–—]|n\/a|s\/d|no informado|sin datos?)$/i.test(text(value));
const partialCourse=value=>{
 const v=text(value);
 // One alphabetic division or a standalone course number is not a full
 // course/division. Other composite formats remain untouched, never guessed.
 return !v||unknownCourse(v)||/^[A-ZÁÉÍÓÚÑ]$/i.test(v)||/^\d{1,2}[°ºª.]?$/.test(v);
};
function courseDisplay(value){
 const v=text(value);
 if(unknownCourse(v)||!v)return 'No informado (dato de ABC incompleto)';
 if(partialCourse(v))return 'Dato parcial: '+v;
 return v;
}

/** status: different | same | unverified */
export function assessComparatorCriterion(label,inputValues){
 const values=inputValues.map(text);
 if(label==='Días y horarios'){
  const parsed=values.map(parseOfferWeeklySegments);
  const formatted=values.map(formatWeeklySchedule);
  if(parsed.some(x=>x===null))return {status:'unverified',values:formatted};
  const blockKey=x=>x.days.join(',')+'|'+x.start+'|'+x.end;
  const key=blocks=>blocks.map(blockKey).sort().join(';');
  return {
   status:new Set(parsed.map(key)).size>1?'different':'same',
   values:formatted
  };
 }
 if(label==='Curso / división'){
  const formatted=values.map(courseDisplay);
  if(values.some(partialCourse))return {status:'unverified',values:formatted};
  return {
   status:new Set(values.map(ascii)).size>1?'different':'same',
   values:formatted
  };
 }
 return {
  status:new Set(values).size>1?'different':'same',
  values
 };
}
