/** Private manual estimate, never a payroll quote. Currency ARS. No persistence. */
export const officialPaySource=Object.freeze({
 period:'2026-11',
 index:'https://www.gba.gob.ar/node/50792',
 status:'official_index_verified_pdf_unavailable',
 agreement:'https://gba.gob.ar/economia/noticias/la_provincia_acord%C3%B3_con_gremios_docentes_y_de_la_ley_10430_un_aumento_salarial_del',
 checked:'2026-11-24'
});
function amount(value,max=100000000){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw Error('Importe inválido');
 return Math.round(value*100);
}
export function estimateOfferEconomics({monthlyNet,workDays,dailyRoundTrip,otherMonthly,roundTripMinutes}={}){
 const net=amount(monthlyNet),daily=amount(dailyRoundTrip),other=amount(otherMonthly);
 if(!Number.isInteger(workDays)||workDays<0||workDays>31)throw Error('Días inválidos');
 if(workDays===0&&daily!==0)throw Error('Indica días de asistencia para calcular viajes');
 if(roundTripMinutes!==null&&(!Number.isInteger(roundTripMinutes)||roundTripMinutes<0||roundTripMinutes>1440))throw Error('Tiempo de traslado inválido');
 const transport=daily*workDays,remaining=net-transport-other;
 return Object.freeze({monthlyNet:net/100,transport:transport/100,otherMonthly:other/100,
  totalCost:(transport+other)/100,remaining:remaining/100,
  travelHours:roundTripMinutes===null?null:Math.round(workDays*roundTripMinutes/60*100)/100,
  costShare:net===0?null:Math.round((transport+other)/net*10000)/100});
}
