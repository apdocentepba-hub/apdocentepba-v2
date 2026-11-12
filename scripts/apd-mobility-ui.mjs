/**
 * Insigne route and nearby-bus UI. Browser-only, created strictly for a
 * currently authorized comparator after official ABC school lookups.
 * No GPS, user credentials, permanent storage, or background network calls.
 */
import {
 verifiedMobilityPair,mapsDirectionsUrl,nearbyStopsMapUrl,
 walkingToStopUrl,estimateRoadRoute,fetchNearbyBusStops
} from './apd-multimodal-transport.mjs?v=20261112-mobility1';

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
  'del día y horario. Las estimaciones de auto y bicicleta, cuando estén '+
  'disponibles aquí, provienen de rutas OpenStreetMap y no incluyen tránsito en vivo.';
}
function addRoadEstimates(card,pair){
 const box=node('div','apd-mobility-road');
 const status=node('p','apd-mobility-status',
  'Kilómetros y duración por calles: calculalos a pedido (auto o bicicleta).');
 status.setAttribute('role','status');
 const actions=node('div','apd-mobility-actions');
 for(const [mode,label] of [['auto','Calcular km en auto'],['bici','Calcular km en bici']]){
  const control=btn(label,async()=>{
   control.disabled=true;
   status.textContent='Consultando ruta '+(mode==='auto'?'en auto':'en bicicleta')+
    ' con OpenStreetMap/Valhalla...';
   const controller=new AbortController();
   const abort=()=>controller.abort();
   card.addEventListener('apd:remove',abort,{once:true});
   try{
    const result=await estimateRoadRoute(pair,mode,{signal:controller.signal});
    if(!card.isConnected||controller.signal.aborted)return;
    const details=node('p','apd-mobility-estimate',
     (mode==='auto'?'Auto':'Bicicleta')+': '+result.km.toFixed(1)+
     ' km por calles · '+result.minutes+' min aproximados. '+
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
function listStops(host,point,scope){
 const wrap=node('section','apd-mobility-stop-group');
 wrap.appendChild(node('h5','',scope));
 const status=node('p','apd-mobility-status',
  'Consultá paradas registradas en OpenStreetMap dentro de 400 metros. '+
  'No implica que haya servicio vigente ni conexión directa a la escuela.');
 status.setAttribute('role','status');
 const results=node('div','apd-mobility-stop-results');
 const actions=node('div','apd-mobility-actions');
 const maps=nearbyStopsMapUrl(point);
 if(maps)actions.appendChild(link('Ver paradas en Google Maps',maps));
 const search=btn('Consultar paradas y líneas cercanas',async()=>{
  search.disabled=true;status.textContent='Buscando paradas mapeadas (hasta 400 m)...';
  const controller=new AbortController();
  const abort=()=>controller.abort();
  wrap.addEventListener('apd:remove',abort,{once:true});
  try{
   const stops=await fetchNearbyBusStops(point,{signal:controller.signal});
   if(!wrap.isConnected||controller.signal.aborted)return;
   results.replaceChildren();
   status.textContent=stops.length?
    stops.length+' paradas registradas cerca de este punto. '+
     'Distancias en línea recta, no caminando por calles.':
    'No se encontraron paradas mapeadas en el área. '+
     'Podría haber otras sin registrar; comprobalo en Maps.';
   const list=node('ul','apd-mobility-stops');
   for(const stop of stops){
    const item=node('li','');
    item.appendChild(node('span','',
     stop.name+' · aprox. '+stop.meters+' m'+
     (stop.lines.length?' · Líneas indicadas en OSM: '+stop.lines.join(', '):
      ' · Línea no informada en OSM')));
    const walk=walkingToStopUrl(point,stop);
    if(walk)item.appendChild(link('Cómo llegar caminando',walk));
    list.appendChild(item);
   }
   if(stops.length)results.appendChild(list);
  }catch(_){
   if(wrap.isConnected&&!controller.signal.aborted){
    status.textContent='Paradas no disponibles desde OpenStreetMap ahora. '+
     'Abrí Google Maps para consultar alternativas.';
   }
  }finally{
   wrap.removeEventListener('apd:remove',abort);
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
 const eligible=Array.isArray(offers)?offers.slice(0,5).map(o=>{
  const code=String(o?.escuela||'').trim().toUpperCase();
  return {offer:o,school:verifiedBySchool?.[code],code};
 }).map(x=>({...x,pair:verifiedMobilityPair(home,x.school)})).filter(x=>x.pair):[];
 if(!eligible.length){
  section.appendChild(node('p','apd-mobility-notice',
   !home?.lat?
    'Primero confirmá la ubicación de tu domicilio en Datos personales.':
    'Para ver recorridos necesitás confirmar el domicilio y pulsar «Consultar ABC» '+
    'para verificar la ubicación oficial de las escuelas.'));
  return section;
 }
 section.appendChild(node('p','apd-mobility-privacy',
  'Privacidad: las coordenadas guardadas se envían a Google Maps solo al abrir '+
  'un enlace. Los cálculos OpenStreetMap y las consultas de paradas solo se '+
  'realizan si pulsás el botón. No se usa el GPS del dispositivo ni se guardan '+
  'tus viajes. Fuente OSM: © colaboradores de OpenStreetMap, licencia ODbL.'));
 section.appendChild(node('p','apd-mobility-explainer',transportSourceMessage()));
 const homeStops=node('details','apd-mobility-home-stops');
 const homeSummary=node('summary','','Paradas de colectivo cercanas a mi domicilio');
 homeStops.appendChild(homeSummary);
 // Creating the click-only search does not itself request any data.
 listStops(homeStops,eligible[0].pair.origin,'Cerca de tu domicilio');
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
   'Paradas de colectivo cerca de esta escuela'));
  listStops(schoolStops,pair.destination,'Cerca de '+(school.nombre||code));
  card.appendChild(schoolStops);
  section.appendChild(card);
 }
 return section;
}
