/* APDocentePBA — comparador opt-in; isolated browser-only UI.
 * No credentials, user data storage, outbound fetches or mutations.
 */
import {compareOffers} from './scripts/apd-comparador-criterios.mjs';

const state={
 available:[],selected:new Set(),index:0,current:null,enabled:false,
 sort:'cierre',district:'',turn:''
};
const root=document.getElementById('apd-comparador-panel');
const max=5;
const safeKey=key=>/^[A-Za-z0-9_.:|-]{1,160}$/.test(key);
const codePattern=/^[0-9]{4}[A-Z]{2}[0-9]{4}$/;

function offerKey(offer) {
 const declared=String(offer?.source_offer_key||'').trim();
 if(safeKey(declared))return declared;
 const id=String(offer?.iddetalle??'').trim();
 return /^[0-9]{1,14}$/.test(id)?'D_'+id:null;
}
function selectedOffers() {
 return state.available.filter(x=>state.selected.has(offerKey(x)))
  .map(x=>({...x,source_offer_key:offerKey(x)}));
}
function node(tag,classes,text) {
 const el=document.createElement(tag);
 if(classes)el.className=classes;
 if(text!==undefined)el.textContent=String(text);
 return el;
}
function button(label,onClick,classes='btn btn-secondary') {
 const el=node('button',classes,label);
 el.type='button';
 el.addEventListener('click',onClick);
 return el;
}
function titleFor(offer) {
 return [String(offer?.descripcioncargo||offer?.cargo||'Cargo sin descripción').trim(),
  String(offer?.distrito||'').trim()].filter(Boolean).join(' · ');
}
function syncCurrentButton() {
 const actions=document.querySelector('#panel-alertas .alerta-main-card .alerta-actions');
 if(!actions)return;
 const existing=actions.querySelector('#apd-comparar-oferta');
 if(existing)existing.remove();
 if(!state.enabled||!state.available.length)return;
 const item=state.current;
 const key=offerKey(item);
 const selected=key&&state.selected.has(key);
 const btn=button(!key?'Comparación no disponible (sin ID)':
  selected?'Quitar de comparación':'Comparar esta oferta',
  ()=>{
   if(!key)return;
   if(state.selected.has(key))state.selected.delete(key);
   else {
    if(state.selected.size>=max){
     const status=root?.querySelector('#apd-comparator-status');
     if(status)status.textContent='Podés comparar hasta cinco ofertas. Quitá una para continuar.';
     return;
    }
    state.selected.add(key);
   }
   syncCurrentButton();
   render();
  });
 btn.id='apd-comparar-oferta';
 btn.disabled=!key;
 btn.setAttribute('aria-pressed',String(!!selected));
 btn.setAttribute('aria-controls','apd-comparador-panel');
 actions.appendChild(btn);
}
function makeSelect(labelText,options,value,change){
 const container=node('label','apd-comparator-label');
 container.appendChild(node('span','',labelText));
 const select=node('select','apd-comparator-select');
 for(const [v,t] of options) {
  const option=document.createElement('option');
  option.value=v;option.textContent=t;
  select.appendChild(option);
 }
 select.value=value;
 select.addEventListener('change',()=>change(select.value));
 container.appendChild(select);
 return container;
}
function countLabel(n) {return n+' de '+max+' ofertas seleccionadas';}
function render(){
 if(!root)return;
 root.replaceChildren();
 root.hidden=!state.enabled||!state.available.length;
 if(root.hidden)return;
 const head=node('div','apd-comparator-head');
 const heading=node('h3','', 'Comparar ofertas');
 const count=node('span','apd-comparator-count',countLabel(state.selected.size));
 head.append(heading,count);
 root.appendChild(head);
 const hint=node('p','apd-comparator-hint',
  'Elegí ofertas del carrusel. Solo se comparan datos visibles de tu sesión; no se guardan selecciones ni se calculan chances de adjudicación.');
 root.appendChild(hint);
 if(state.selected.size){
  const tools=node('div','apd-comparator-tools');
  tools.appendChild(makeSelect('Ordenar por',[
   ['cierre','Próximo cierre'],['preferencias','Distrito y turno']
  ],state.sort,value=>{state.sort=value;render()}));
  const selected=selectedOffers();
  const districts=[...new Set(selected.map(x=>String(x.distrito||'').trim()).filter(Boolean))].sort();
  tools.appendChild(makeSelect('Distrito preferido',[
   ['','Sin preferencia'],...districts.map(d=>[d,d])
  ],districts.includes(state.district)?state.district:'',
  value=>{state.district=value;render()}));
  const turns=[...new Set(selected.map(x=>String(x.turno||'').trim()).filter(Boolean))].sort();
  tools.appendChild(makeSelect('Turno preferido',[
   ['','Sin preferencia'],...turns.map(t=>[t,t])
  ],turns.includes(state.turn)?state.turn:'',
  value=>{state.turn=value;render()}));
  root.appendChild(tools);
  root.appendChild(button('Limpiar selección',()=>{state.selected.clear();syncCurrentButton();render()},'apd-comparator-clear'));
  const result=compareOffers({
   offers:selected,sortBy:state.sort,
   preferredDistricts:state.district?[state.district]:[],
   preferredTurns:state.turn?[state.turn]:[]
  });
  const list=node('ol','apd-comparator-results');
  for(const row of result.items){
   const entry=node('li','apd-comparator-item');
   const heading=node('strong','',[
    row.cargo||'Cargo sin descripción',
    row.distrito||'Distrito no informado'
   ].join(' · '));
   entry.appendChild(heading);
   const meta=node('p','',[
    row.escuela||'Escuela sin clave',
    row.turno||'Turno sin confirmar',
    row.horas_hasta_cierre!==null?
     'Cierra en '+row.horas_hasta_cierre+' h':'Cierre por verificar'
   ].join(' · '));
   entry.appendChild(meta);
   const explanation=node('p','apd-comparator-reasons',row.explicacion.join(' · '));
   entry.appendChild(explanation);
   // This link only appears after the verified-key map implementation (#255)
   // is present. A comparator-only release must not open the old generic map.
   if(window.APD_offerSchoolMapReady===true && codePattern.test(row.escuela.toUpperCase())){
    // Official school-key map integration is maintained separately in PR #255.
    const link=node('a','apd-comparator-map-link','Ver escuela en mapa');
    const params=new URLSearchParams({clave:row.escuela.toUpperCase(),distrito:row.distrito});
    link.href='./mapa-escuelas-pba.html?'+params.toString();
    link.target='_blank';link.rel='noopener noreferrer';
    entry.appendChild(link);
   }
   entry.appendChild(button('Quitar',()=>{
    state.selected.delete(row.source_offer_key);
    syncCurrentButton();render();
   },'apd-comparator-remove'));
   list.appendChild(entry);
  }
  root.appendChild(list);
  if(result.excluded.length){
   root.appendChild(node('p','apd-comparator-warning',
    result.excluded.length+' oferta(s) excluida(s): vencidas, cerradas o sin identificador válido.'));
  }
 }else{
  root.appendChild(node('p','apd-comparator-empty',
   'Tocá «Comparar esta oferta» en al menos dos ofertas para verlas juntas.'));
 }
 const status=node('div','apd-comparator-status');
 status.id='apd-comparator-status';status.setAttribute('role','status');
 root.appendChild(status);
 root.appendChild(node('p','apd-comparator-disclaimer',
  'Orientativo. Verificá condiciones, horarios, fecha de cierre y postulación en ABC. La distancia se incorporará cuando haya coordenadas verificadas.'));
}
function refresh({offers=[],index=0,enabled=false}={}) {
 state.enabled=enabled===true;
 if(!state.enabled){
  reset();return;
 }
 const unique=new Map();
 for(const item of Array.isArray(offers)?offers:[]){
  const key=offerKey(item);
  if(key&&!unique.has(key))unique.set(key,item);
 }
 state.available=[...unique.values()];
 state.index=Number.isInteger(index)&&index>=0&&index<offers.length?index:0;
 state.current=Array.isArray(offers)?offers[state.index]:null;
 // The current card may have an invalid key: preserve its physical index only
 // when identity keys were not removed. Otherwise find its matching source key.
 const current=offers?.[index];
 const currentKey=offerKey(current);
 const matched=state.available.findIndex(x=>offerKey(x)===currentKey);
 if(matched>=0)state.index=matched;
 const valid=new Set(state.available.map(offerKey));
 for(const key of state.selected)if(!valid.has(key))state.selected.delete(key);
 syncCurrentButton();
 render();
}
function reset() {
 state.enabled=false;state.available=[];state.current=null;state.selected.clear();
 state.sort='cierre';state.district='';state.turn='';
 const control=document.querySelector('#apd-comparar-oferta');
 control?.remove();
 if(root){root.hidden=true;root.replaceChildren();}
}
window.APD_comparatorRefresh=refresh;
window.APD_comparatorReset=reset;
// Core app may have rendered before module import was completed.
if(root){root.hidden=true;}
