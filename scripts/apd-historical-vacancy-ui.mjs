import snapshot from './apd-vacancy-snapshot-20261124.mjs';
import {validateVacancySnapshot,vacancyGroups} from './apd-historical-vacancy.mjs?v=20261124-vacancy1';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const num=n=>n.toLocaleString('es-AR');
export function createVacancyRadar(){
 const data=validateVacancySnapshot(snapshot),root=el('details',undefined,'apd-vacancy-radar');
 root.append(el('summary','Radar histórico de ofertas desiertas','apd-work-summary'));
 root.append(el('p','Muestra parcial de '+num(data.total)+' ofertas únicas en seis distritos. Última captura: 02/11/2026. Corte fijo, no actualizado en tiempo real.','apd-comparator-hint'));
 root.append(el('p','El porcentaje compara desiertas con designadas. Los demás estados se muestran aparte. Mínimo 30 resultados de esos dos estados por grupo. No indica tus chances de adjudicación, ni vacantes actuales.','apd-comparator-hint'));
 const tools=el('div',undefined,'apd-history-tools'),district=el('select'),sort=el('select'),search=el('input');
 district.setAttribute('aria-label','Distrito histórico');sort.setAttribute('aria-label','Orden histórico');search.setAttribute('aria-label','Buscar cargo histórico');search.placeholder='Buscar cargo o distrito';
 function option(select,value,label){const op=el('option',label);op.value=value;select.append(op);}
 option(district,'','Comparar distritos');for(const r of data.rows.filter(r=>r.kind==='district'))option(district,r.district,r.district);
 for(const [v,t] of [['count','Más desiertas'],['share','Mayor proporción desierta'],['sample','Mayor muestra']])option(sort,v,t);
 tools.append(district,sort,search);const results=el('div',undefined,'apd-vacancy-results');results.setAttribute('aria-live','polite');root.append(tools,results);
 const render=()=>{
  const rows=vacancyGroups(snapshot,{district:district.value,query:search.value,sort:sort.value});results.replaceChildren();
  if(!rows.length)results.append(el('p','No hay grupos con muestra suficiente para esa búsqueda. No significa que no haya habido ofertas.','apd-comparator-hint'));
  for(const row of rows){
   const card=el('article',undefined,'apd-history-row');
   card.append(el('strong',row.cargo||row.district),el('p',num(row.desiertas)+' desiertas · '+num(row.designadas)+' designadas · '+num(row.other)+' otros estados'),
    el('p',row.share.toLocaleString('es-AR',{maximumFractionDigits:1})+'% desiertas entre '+num(row.n)+' resultados de esos dos estados','apd-comparator-hint'));
   const bar=el('progress');bar.max=100;bar.value=row.share;bar.setAttribute('aria-label','Proporción descriptiva de ofertas desiertas');card.append(bar);results.append(card);
  }
 };
 district.addEventListener('change',()=>{search.value='';render();});sort.addEventListener('change',render);search.addEventListener('input',render);
 render();return root;
}
