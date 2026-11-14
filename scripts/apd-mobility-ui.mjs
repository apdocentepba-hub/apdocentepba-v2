/**
 * Insigne route and nearby-bus UI. Browser-only, created strictly for a
 * currently authorized comparator after official ABC school lookups.
 * No GPS, user credentials, permanent storage, or background network calls.
 */
import {
 verifiedMobilityPair,mapsDirectionsUrl,nearbyStopsMapUrl,estimateRoadRoute
} from './apd-multimodal-transport.mjs?v=20261112-mobility2';
import {fetchAmbaBusLinesNear} from './apd-amba-bus-routes.mjs?v=20261112-mobility2';

const node=(tag,className,text)=>{
 const el=document.createElement(tag);
 if(className)el.className=className;
 if(text!==undefined)el.textContent=String(text);
 return el;
};
const btn=(text,callback)=>{
 const el=node('button','btn btn-secondary apd-mobility-button',text);
 el.type='button';el.addEventListener('click',callback);return el;
};
const link=(text,url)=>{
 const el=node('a','apd-mobility-map-link',text);
 el.href=url;el.target='_blank';el.rel='noopener noreferrer';
 return el;
};
function linkModes(box,pair){
 const row=node('div','apd-mobility-actions');
 for(const [mode,label] of [
  ['auto','🚗 Auto'],['bici','🚲 Bicicleta'],
  ['transporte','🚌 Transporte público'],['pie','🚶 Caminando']
 ]){
  const url=mapsDirectionsUrl(pair,mode);
  if(url)row.appendChild(link(label+' · ver recorrido, km y tiempo',url));
 }
 box.appendChild(row);
}
function transportSourceMessage(){
 return 'Los recorridos y tiempos de Google Maps se consultan allí, '+
  'con origen y destino explícitos. El transporte público puede combinar '+
  'colectivo, tren, subte y caminata; la disponibilidad y frecuencia dependen '+
  'del día y horario. Las estimaciones de auto, bicicleta y caminata, cuando estén '+
  'disponibles aquí, provienen de rutas OpenStreetMap y no incluyen tránsito en vivo.';
}
function addRoadEstimates(card,pair){
 const box=node('div','apd-mobility-road');
 const status=node('p','apd-mobility-status',
  'Kilómetros y duración por calles: calculalos a pedido (auto, bicicleta o a pie).');
 status.setAttribute('role','status');
 const actions=node('div','apd-mobility-actions');
 for(const [mode,label] of [['auto','Calcular km en auto'],['bici','Calcular km en bici'],['pie','Calcular km a pie']]){
  const control=btn(label,async()=>{
   control.disabled=true;
   status.textContent='Consultando ruta '+(mode==='auto'?'en auto':mode==='bici'?'en bicicleta':'a pie')+
    ' con OpenStreetMap/Valhalla...';
   const controller=new AbortController();
   const abort=()=>controller.abort();
   card.addEventListener('apd:remove',abort,{once:true});
   try{
    const result=await estimateRoadRoute(pair,mode,{signal:controller.signal});
    if(!card.isConnected||controller.signal.aborted)return;
    const details=node('p','apd-mobility-estimate',
     (mode==='auto'?'Auto':mode==='bici'?'Bicicleta':'Caminata')+': '+
     (result.km>0&&result.km<0.1?'menos de 0,1 km':result.km.toFixed(1)+' km')+
     ' por calles · '+result.minutes+' min aproximados. '+
     'Fuente: Valhalla / OpenStreetMap (demo comunitaria). '+ 
     'No incluye tránsito real, demoras ni cortes.');
    const existing=box.querySelector('[data-apd-route="'+mode+'"]');
    if(existing)existing.replaceWith(details);
    else box.appendChild(details);
    details.dataset.apdRoute=mode;
    status.textContent='Estimación consultada. Abrí Google Maps para el recorrido actualizado.';
   }catch(_){
    if(card.isConnected&&!controller.signal.aborted){
     status.textContent='El cálculo gratuito no está disponible ahora. '+
      'Usá el enlace de Google Maps para ver kilómetros y tiempos reales por modo.';
    }
   }finally{
    card.removeEventListener('apd:remove',abort);
    if(card.isConnected)control.disabled=false;
   }
  });
  actions.appendChild(control);
 }
 box.append(status,actions);
 card.appendChild(box);
}
function listRoutes(host,point,scope){
 const wrap=node('section','apd-mobility-stop-group');
 wrap.appendChild(node('h5','',scope));
 const status=node('p','apd-mobility-status',
  'Consultá los recorridos de colectivos que atraviesan la zona de 400 m. '+
  'No confirma que haya parada ni que el servicio esté funcionando.');
 status.setAttribute('role','status');
 const results=node('div','apd-mobility-stop-results');
 const actions=node('div','apd-mobility-actions');
 const maps=nearbyStopsMapUrl(point);
 if(maps)actions.appendChild(link('Buscar paradas cercanas en Google Maps',maps));
 const search=btn('Ver líneas de colectivo cercanas',async()=>{
  search.disabled=true;status.textContent='Consultando las capas de recorridos del AMBA...';
  try{
   const {lines,totalLines,unavailableScopes,complete}=await fetchAmbaBusLinesNear(point);
   if(!wrap.isConnected)return;
   results.replaceChildren();
   const coverage=complete?'':
    ' Cobertura incompleta: no respondieron las capas '+unavailableScopes.join(', ')+'.';
   const truncated=totalLines>lines.length?
    ' Se muestran las primeras '+lines.length+' de '+totalLines+' entradas.':'';
   status.textContent=totalLines?
    totalLines+' registros de líneas representados dentro de 400 m. '+
      'Son trazas aproximadas, NO paradas ni horarios confirmados.'+
      truncated+coverage:
    (complete?'Las capas consultadas no registran recorridos a menos de 400 m.':
      'Las capas disponibles no registran recorridos a menos de 400 m.')+
      ' Puede haber servicios no registrados; verificá Google Maps.'+coverage;
   const list=node('ul','apd-mobility-stops');
   for(const route of lines){
    const item=node('li','');
    item.appendChild(node('strong','',
     'Línea '+route.line+' · Jurisdicción '+route.scope));
    item.appendChild(node('span','',
     ' · Recorre la zona (base cartográfica, sin parada confirmada).'));
    list.appendChild(item);
   }
   if(lines.length)results.appendChild(list);
  }catch(_){
   if(wrap.isConnected)
    status.textContent='Las capas de recorridos AMBA no están disponibles ahora. '+
     'Consultá paradas y combinaciones en Google Maps.';
  }finally{
   if(wrap.isConnected)search.disabled=false;
  }
 });
 actions.prepend(search);wrap.append(status,actions,results);
 host.appendChild(wrap);
}
export function createMobilitySection({home,offers=[],verifiedBySchool={}}={}){
 const section=node('section','apd-mobility-section');
 section.appendChild(node('h3','','Cómo llegar a cada escuela'));
 section.appendChild(node('p','apd-mobility-explainer',
  'Compará recorridos en auto, bicicleta, transporte público y a pie. '+
  'Los enlaces de Google Maps muestran los kilómetros, duración y, cuando '+
  'existan, colectivos y combinaciones para el horario que elijas.'));
 // Several offers may belong to the same verified school. A route is a
 // property of its location, not of each job posting; suppress duplicates.
 const seenSchools=new Set();
 const eligible=[];
 for(const offer of Array.isArray(offers)?offers.slice(0,5):[]){
  const code=String(offer?.escuela||'').trim().toUpperCase();
  if(seenSchools.has(code))continue;
  const school=verifiedBySchool?.[code];
  const pair=verifiedMobilityPair(home,school);
  if(!pair)continue;
  seenSchools.add(code);
  eligible.push({offer,school,code,pair});
 }
 if(!eligible.length){
  section.appendChild(node('p','apd-mobility-notice',
   !home?.lat?
    'Primero confirmá la ubicación de tu domicilio en Datos personales.':
    'La ubicación oficial de estas escuelas todavía no está verificada en ABC. '+
    'Si la consulta automática no respondió, usá «Consultar distancias oficiales» '+
    'para reintentar.'));
  return section;
 }
 section.appendChild(node('p','apd-mobility-privacy',
  'Privacidad: las coordenadas guardadas se envían a Google Maps solo al abrir '+
  'un enlace. Los cálculos OpenStreetMap y las consultas de líneas solo se '+
  'realizan si pulsás el botón. No se usa el GPS del dispositivo ni se guardan '+
  'tus viajes. Fuentes: OpenStreetMap (ODbL) y capa pública de recorridos AMBA (mayo de 2026).'));
 section.appendChild(node('p','apd-mobility-explainer',transportSourceMessage()));
 const homeStops=node('details','apd-mobility-home-stops');
 const homeSummary=node('summary','','Líneas de colectivo cerca de mi domicilio');
 homeStops.appendChild(homeSummary);
 // Creating the click-only search does not itself request any data.
 listRoutes(homeStops,eligible[0].pair.origin,'Recorridos mapeados cerca de tu domicilio');
 section.appendChild(homeStops);
 for(const {offer,school,pair,code} of eligible){
  const card=node('article','apd-mobility-card');
  card.appendChild(node('h4','',(school.nombre||'Escuela')+' · '+code));
  card.appendChild(node('p','apd-mobility-meta',
   [offer.cargo,offer.distrito].filter(Boolean).join(' · ')));
  if(home?.scope&&home.scope!=='exacta')
   card.appendChild(node('p','apd-mobility-notice',
    'Tu ubicación de referencia es aproximada. Revisá el punto antes de elegir recorrido.'));
  linkModes(card,pair);
  addRoadEstimates(card,pair);
  const schoolStops=node('details','apd-mobility-school-stops');
  schoolStops.appendChild(node('summary','',
   'Líneas de colectivo cerca de esta escuela'));
  listRoutes(schoolStops,pair.destination,'Recorridos mapeados cerca de '+(school.nombre||code));
  card.appendChild(schoolStops);
  section.appendChild(card);
 }
 return section;
}
