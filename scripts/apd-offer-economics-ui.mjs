import {estimateOfferEconomics,officialPaySource} from './apd-offer-economics.mjs?v=20261124-economics1';
const node=(tag,text,cls='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const currency=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2});
export function createOfferEconomics(){
 const root=node('details',undefined,'apd-economics');
 root.append(node('summary','Ingresos y gastos de esta oferta','apd-work-summary'));
 root.append(node('p','Estimación manual por mes completo. Ingresá el importe de bolsillo estimado para esta oferta, no tu sueldo total. No se calcula automáticamente la liquidación ni se guardan datos.','apd-comparator-hint'));
 const source=node('a','Consultar escala salarial oficial · noviembre 2026');
 source.href=officialPaySource.index;source.target='_blank';source.rel='noopener noreferrer';root.append(source);
 root.append(node('p','Importes oficiales pendientes de verificación. No se incluyen valores predeterminados.','apd-comparator-hint'));
 const form=node('form',undefined,'apd-economics-form'),output=node('div',undefined,'apd-economics-output');output.setAttribute('role','status');
 const fields={};
 for(const [key,label,max,step,optional] of [
  ['monthlyNet','Ingreso mensual de bolsillo estimado ($)',100000000,'0.01',false],
  ['workDays','Días de asistencia al mes',31,'1',false],
  ['dailyRoundTrip','Gasto de ida y vuelta por día ($)',100000000,'0.01',false],
  ['otherMonthly','Otros gastos mensuales ($)',100000000,'0.01',false],
  ['roundTripMinutes','Minutos de ida y vuelta por día (opcional)',1440,'1',true]]){
  const row=node('label',undefined,'apd-work-field');row.append(node('span',label));
  const input=node('input',undefined,'apd-work-input');input.type='number';input.min='0';input.max=String(max);input.step=step;input.required=!optional;
  input.name=key;fields[key]=input;row.append(input);form.append(row);
 }
 const button=node('button','Calcular ingreso después de gastos','btn btn-primary');button.type='submit';form.append(button,output);
 form.addEventListener('input',()=>output.replaceChildren());
 form.addEventListener('submit',event=>{
  event.preventDefault();output.replaceChildren();
  if(!form.reportValidity())return;
  try{
   const values=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value===''?null:v.valueAsNumber]));
   const r=estimateOfferEconomics(values);
   for(const [label,value] of [['Ingreso indicado',r.monthlyNet],['Transporte mensual',r.transport],['Otros gastos',r.otherMonthly],['Ingreso después de gastos',r.remaining]]){
    const row=node('p',undefined,'apd-economics-result');row.append(node('span',label),node('strong',currency.format(value)));output.append(row);
   }
   if(r.travelHours!==null)output.append(node('p','Traslado estimado: '+r.travelHours.toLocaleString('es-AR')+' h mensuales, según lo que ingresaste.'));
   output.append(node('p','No incluye cambios en bonificaciones, topes, impuestos, antigüedad, licencias ni liquidación proporcional. Confirmá con tu recibo o escala vigente.','apd-comparator-hint'));
  }catch(error){output.append(node('p',error.message));}
 });
 root.append(form);return root;
}
