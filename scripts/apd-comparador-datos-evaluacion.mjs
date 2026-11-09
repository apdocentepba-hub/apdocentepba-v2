/**
 * APD comparator presentation-only checks. No network, auth or persistence.
 * Prevent false highlights from superficial ABC formatting differences.
 * Never fabricate a course number when the source only reports "0" or "A".
 */
const text=v=>String(v??'').trim();
const ascii=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const TIME=/(\d{1,2}):([0-5]\d)/g;

function scheduleParts(value){
 const normalized=ascii(value)
  // ABC variants: "7:20HSA 11:50HS" / "7:20 HS a 11:50 HS".
  .replace(/(\d{1,2}:[0-5]\d)\s*hs\.?\s*a(?=\s*\d{1,2}:)/g,'$1 a ')
  .replace(/(\d{1,2}:[0-5]\d)\s*hs\.?(?=\s|$)/g,'$1')
  .replace(TIME,(_,h,m)=>String(Number(h)).padStart(2,'0')+':'+m)
  .replace(/\s+/g,' ').trim();
 return normalized;
}
function scheduleDisplay(value){
 const key=scheduleParts(value);
 const m=key.match(/^lunes a viernes:\s*(\d{2}:\d{2}) a (\d{2}:\d{2})$/);
 return m?'Lunes a viernes: '+m[1]+' a '+m[2]:text(value);
}
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
  const normalized=values.map(scheduleParts);
  if(normalized.some(v=>!v||/^(no informado|sin datos?|n\/a)$/.test(v)))
   return {status:'unverified',values:values.map(v=>v||'No informado')};
  return {
   status:new Set(normalized).size>1?'different':'same',
   values:values.map(scheduleDisplay)
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
