/* APDocentePBA — comparador opt-in; isolated browser-only UI.
 * No credentials, user data storage, outbound fetches or mutations.
 */
import {compareOffers} from './scripts/apd-comparador-criterios.mjs';
import {
 fetchSelectedSchools,pairSchoolDistances,verifiedSchoolKey
} from './scripts/apd-school-geodistance.mjs';

const state={
 available:[],selected:new Set(),index:0,current:null,enabled:false,
 sort:'cierre',district:'',turn:'',
 geoByKey:Object.create(null),geoRequested:false,geoWorking:false,
 geoStatus:'',geoRunId:0,geoAbort:null,geoSignature:'',anchor:''
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
   if(state.selected.has(key)){state.selected.delete(key);invalidateGeo();}
   else {
    if(state.selected.size>=max){
     const status=root?.querySelector('#apd-comparator-status');
     if(status)status.textContent='Podés comparar hasta cinco ofertas. Quitá una para continuar.';
     return;
    }
    state.selected.add(key);invalidateGeo();
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
function selectedSchoolKeys(){
 return [...new Set(selectedOffers().map(x=>verifiedSchoolKey(x.escuela)).filter(Boolean))];
}
function invalidateGeo(){
 state.geoRunId++;
 state.geoAbort?.abort();
 state.geoAbort=null;state.geoWorking=false;state.geoRequested=false;
 state.geoStatus='';state.geoByKey=Object.create(null);state.anchor='';
 state.geoSignature='';
 if(state.sort==='distancia')state.sort='cierre';
}
async function verifySchoolDistances(){
 if(!state.enabled||state.geoWorking)return;
 const codes=selectedSchoolKeys();
 if(codes.length<2){
  state.geoStatus='Seleccioná al menos dos escuelas con claves provinciales válidas.';
  render();return;
 }
 invalidateGeo();
 const run=state.geoRunId;
 const controller=new AbortController();
 state.geoAbort=controller;
 state.geoRequested=true;state.geoWorking=true;
 state.geoStatus='Consultando el Mapa Escolar ABC...';
 state.geoSignature=JSON.stringify(codes);
 render();
 try{
  // At most five anonymous, read-only GETs, on explicit click only.
  const response=await fetchSelectedSchools(codes,{signal:controller.signal});
  if(run!==state.geoRunId||!state.enabled||controller.signal.aborted)return;
  state.geoByKey=response.verified;
  const count=Object.keys(response.verified).length;
  state.anchor=codes.find(key=>response.verified[key])||'';
  state.geoStatus=count+' de '+codes.length+
   ' escuelas con ubicación exacta verificada en ABC.';
  if(count>=2)state.sort='distancia';
 }catch(_){
  if(run===state.geoRunId)state.geoStatus='No se pudieron verificar las escuelas.';
 }finally{
  if(run===state.geoRunId){
   state.geoWorking=false;state.geoAbort=null;render();
  }
 }
}
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
  const selected=selectedOffers();
  const codes=selectedSchoolKeys();
  const verifiedCount=Object.keys(state.geoByKey).length;
  const tools=node('div','apd-comparator-tools');
  const sortOptions=[['cierre','Próximo cierre'],['preferencias','Distrito y turno']];
  if(verifiedCount>=2)sortOptions.push(['distancia','Distancia desde escuela elegida']);
  tools.appendChild(makeSelect('Ordenar por',sortOptions,state.sort,
    value=>{state.sort=value;render()}));
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
  if(verifiedCount>=2){
   tools.appendChild(makeSelect('Escuela de referencia',codes
     .filter(key=>!!state.geoByKey[key])
     .map(key=>[key,(state.geoByKey[key].nombre||key)+' · '+key]),state.anchor,
     value=>{state.anchor=value;render()}));
  }
  root.appendChild(tools);
  if(codes.length>=2){
   const geoButton=button(state.geoWorking?'Consultando ABC...':
     state.geoRequested?'Actualizar ubicaciones oficiales':'Consultar distancias oficiales',
     ()=>{void verifySchoolDistances()},'btn btn-secondary apd-comparator-geobutton');
   geoButton.disabled=state.geoWorking;
   root.appendChild(geoButton);
  }
  if(state.geoStatus){
   const hint=node('p','apd-comparator-geo-status',state.geoStatus);
   hint.setAttribute('role','status');root.appendChild(hint);
  }
  root.appendChild(button('Limpiar selección',()=>{
    state.selected.clear();invalidateGeo();syncCurrentButton();render()
  },'apd-comparator-clear'));
  const origin=state.geoByKey[state.anchor]||null;
  const result=compareOffers({
   offers:selected,sortBy:state.sort,
   preferredDistricts:state.district?[state.district]:[],
   preferredTurns:state.turn?[state.turn]:[],
   referenceLocation:origin,verifiedGeoByKey:state.geoByKey
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
   if(state.geoRequested){
    const verified=state.geoByKey[row.escuela.toUpperCase()];
    const distance=state.anchor && verified && origin ?
      row.distancia_km : null;
    const geographic=distance===null?
     'Ubicación sin verificar o escuela sin clave válida':
     'A '+distance+' km en línea recta de '+state.anchor;
    entry.appendChild(node('p','apd-comparator-distance',geographic));
    if(verified){
     entry.appendChild(node('p','apd-comparator-geo-detail',
      [verified.domicilio,verified.cue?'CUE '+verified.cue:'']
       .filter(Boolean).join(' · ')));
    }
   }
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
    state.selected.delete(row.source_offer_key);invalidateGeo();
    syncCurrentButton();render();
   },'apd-comparator-remove'));
   list.appendChild(entry);
  }
  root.appendChild(list);
  if(verifiedCount>=2){
   const pairs=pairSchoolDistances(state.geoByKey,codes);
   if(pairs.length){
    const section=node('section','apd-comparator-pairs');
    section.appendChild(node('h4','','Distancias entre escuelas verificadas'));
    const pairing=node('ul','');
    for(const pair of pairs)pairing.appendChild(node('li','',
     pair.escuela_a+' ↔ '+pair.escuela_b+
     ': '+pair.km_linea_recta+' km en línea recta'));
    section.appendChild(pairing);root.appendChild(section);
   }
  }
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
  'Orientativo. Las distancias son en línea recta entre escuelas verificadas por ABC; no son tiempo de viaje. Verificá condiciones y postulación en ABC. No se usa la ubicación del celular.'));
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
 let removed=false;
 for(const key of state.selected){
  if(!valid.has(key)){state.selected.delete(key);removed=true;}
 }
 if(removed)invalidateGeo();
 if(state.geoRequested&&
   JSON.stringify(selectedSchoolKeys())!==state.geoSignature)invalidateGeo();
 syncCurrentButton();
 render();
}
function reset() {
 invalidateGeo();
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
