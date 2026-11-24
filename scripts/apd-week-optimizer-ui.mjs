/** DOM-only optimizer, explicitly selected offers, no persistence or network. */
import {optimizeWeeklyOffers} from './apd-week-optimizer.mjs';
const reasons={closed:'Oferta cerrada o vencida','deadline-unverified':'Cierre sin verificar','schedule-unverified':'Horario incompleto',overlap:'Cruce con tu jornada','tight-transition':'Margen de traslado insuficiente',unverified:'Jornada u horario sin verificar'};
export function createWeekOptimizerSection({offers,loadProfile,isCurrent=()=>false}){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const section=el('details');section.className='apd-week-optimizer';
 const summary=el('summary','Optimizar varias ofertas');summary.className='apd-work-summary';section.append(summary);
 section.append(el('p','Elegí hasta 12 ofertas visibles. Se calcula una combinación orientativa por horarios y margen entre clases; no verifica adjudicación, disponibilidad real ni traslado.'));
 const form=el('form'),choices=el('fieldset');choices.append(el('legend','Ofertas a evaluar'));
 const objective=el('select');objective.name='objective';for(const [value,label] of [['count','Mayor cantidad de cargos'],['minutes','Mayor cantidad de horas']]){const option=el('option',label);option.value=value;objective.append(option);}
 const objectiveLabel=el('label','Objetivo: ');objectiveLabel.append(objective);form.append(objectiveLabel);
 const status=el('p');status.setAttribute('role','status');const results=el('div');results.className='apd-optimizer-results';
 const list=Array.isArray(offers)?offers:[];
 const byKey=new Map(list.map(o=>[o.source_offer_key,o]));
 const checks=[];
 for(const [key,o] of byKey){
  const label=el('label'),input=el('input');input.type='checkbox';input.value=key;input.name='offer';
  const title=[o.descripcioncargo||o.cargo||'Oferta',o.escuela,o.distrito].filter(Boolean).join(' · ');
  label.append(input,document.createTextNode(' '+title));label.style.display='block';choices.append(label);checks.push(input);
 }
 const submit=el('button','Calcular mejor combinación');submit.type='submit';submit.className='btn btn-secondary';submit.disabled=true;
 function clear(){results.replaceChildren();const n=checks.filter(c=>c.checked).length;status.textContent=n+' de 12 seleccionadas';submit.disabled=n===0||n>12;for(const c of checks)c.disabled=!c.checked&&n>=12;}
 form.addEventListener('change',clear);
 form.addEventListener('submit',e=>{
  e.preventDefault();results.replaceChildren();
  if(!section.isConnected||!isCurrent())return;
  try{
   const selected=checks.filter(c=>c.checked).map(c=>byKey.get(c.value));
   if(!selected.length||selected.length>12)return;
   const data=optimizeWeeklyOffers({offers:selected,profile:loadProfile(),objective:objective.value});
   results.append(el('strong',data.best.keys.length+' cargos · '+Math.round(data.best.minutes/60*100)/100+' horas semanales'));
   const ul=el('ul');for(const key of data.best.keys){const o=byKey.get(key);ul.append(el('li',[o.descripcioncargo||o.cargo||key,o.escuela,o.distrito].filter(Boolean).join(' · ')));}results.append(ul);
   if(data.excluded.length){results.append(el('p','Ofertas excluidas:'));const rejected=el('ul');for(const x of data.excluded){const o=byKey.get(x.key);rejected.append(el('li',(o.descripcioncargo||o.cargo||x.key)+' — '+(reasons[x.reason]||'Revisar datos')));}results.append(rejected);}
   if(!data.best.keys.length)results.append(el('p','No se encontró una combinación con los datos verificados.'));
   results.append(el('p',data.disclaimer));
  }catch{status.textContent='No se pudo evaluar. Revisá la jornada y las ofertas.';}
 });
 form.append(choices,submit,status,results);section.append(form);clear();return section;
}
