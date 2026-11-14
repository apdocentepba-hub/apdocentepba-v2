/**
 * Insigne decision signals: deterministic interpretation of fields ALREADY
 * produced by compareOffers(). No network calls, account reads or inference of
 * adjudication chance, legal eligibility, estimated pay or travel times.
 *
 * This is not a definitive recommendation or a ranking of teachers.
 */
export function assessOfferDecisionSignals(row){
 if(!row||typeof row!=='object'||Array.isArray(row))
  return Object.freeze({
   kind:'unknown',label:'Datos por confirmar',
   reasons:['Oferta sin datos comparables'],note:NOTE
  });
 const flags=[],positive=[],missing=[];
 if(row.pid_match_verified===false)
  flags.push('El cruce de PID figura como no coincidente; verificá tu listado en SerVaDo.');
 else if(row.pid_compatible_panel===false)
  flags.push('El panel indica que el ítem no aparece en tu PID; verificá el listado oficial.');
 else if(row.pid_match_verified===true||row.pid_compatible_panel===true)
  positive.push('El panel muestra una coincidencia PID; no certifica derecho a postularse.');
 else missing.push('Cruce PID no confirmado.');

 if(row.district_preferred===false)
  flags.push('El distrito no coincide con tu preferencia seleccionada.');
 else if(row.district_preferred===true)
  positive.push('Distrito dentro de tus preferencias.');

 if(row.turn_preferred===false)
  flags.push('El turno no coincide con tu preferencia seleccionada.');
 else if(row.turn_preferred===true)
  positive.push('Turno dentro de tus preferencias.');

 const hours=row.horas_hasta_cierre;
 if(typeof hours==='number'&&Number.isFinite(hours)&&hours>0){
  if(hours<=24)
   flags.push('El plazo de cierre indicado está próximo; confirmalo en ABC.');
  else positive.push('El cierre informado todavía no es inmediato.');
 }else missing.push('Fecha u hora de cierre sin confirmación suficiente.');

 const schedule=typeof row.horario==='string'?row.horario.trim():'';
 if(!schedule||schedule==='Horario demasiado extenso para comparar; verificá ABC')
  missing.push('Horarios laborales sin comparación verificable.');

 // Don't invent legal compatibility, road travel, wages or probability from
 // unrelated positive indicators. Warnings always take precedence.
 const kind=flags.length?'review':
  missing.length?'unknown':
  positive.length>=2?'positive':'unknown';
 const label=kind==='review'?'Revisar antes de postularte':
  kind==='positive'?'Señales favorables en los datos disponibles':
   'Datos por confirmar';
 const reasons=[...(kind==='review'?flags:positive),...missing].slice(0,5);
 return Object.freeze({kind,label,reasons:Object.freeze(reasons),note:NOTE});
}
const NOTE='Orientación informativa. No determina compatibilidad normativa, adjudicación, salario ni tiempo real de traslado. Verificá ABC/SerVaDo.';
