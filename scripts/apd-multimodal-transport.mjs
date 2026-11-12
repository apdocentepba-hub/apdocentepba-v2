/**
 * APDocentePBA / Insigne — mobility from a selected home to an ABC-verified school.
 *
 * Routes: Google Maps URLs (free, no API key), plus opt-in estimates using the
 * FOSSGIS Valhalla demo for car/bike. No silent routing queries or GPS capture.
 * Nearby stops: opt-in, bounded OSM Overpass lookup. OSM line references are
 * map annotations, NOT certified timetables, guaranteed service or rides.
 */
const BOUNDS={minLat:-42,maxLat:-33,minLon:-64,maxLon:-55};
const GOOGLE_DIRECTIONS='https://www.google.com/maps/dir/?';
const GOOGLE_SEARCH='https://www.google.com/maps/search/?';
const VALHALLA='https://valhalla1.openstreetmap.de/route';
const OVERPASS='https://overpass-api.de/api/interpreter';
const RADIUS=400;
const CLIENT_ID='alertasapd.com.ar';
const MODES=Object.freeze({
 auto:'driving',bici:'bicycling',transporte:'transit',pie:'walking'
});
const safePoint=p=>{
 const lat=Number(p?.lat),lon=Number(p?.lon);
 return Number.isFinite(lat)&&Number.isFinite(lon)&&
  lat>=BOUNDS.minLat&&lat<=BOUNDS.maxLat&&
  lon>=BOUNDS.minLon&&lon<=BOUNDS.maxLon?{lat,lon}:null;
};
export function verifiedMobilityPair(home,school){
 const origin=safePoint(home),destination=safePoint(school);
 if(!origin||!destination||
  home?.source!=='GEOREF_AR_V2'||
  (!home.reviewed&&home.scope!=='exacta')||
  school?.source!=='ABC_WFS'||school.exact_key_match!==true||
  typeof school.clave!=='string'||!/^[0-9]{4}[A-Z]{2}[0-9]{4}$/.test(school.clave))
  return null;
 return {origin,destination,schoolKey:school.clave};
}
export function mapsDirectionsUrl(pair,mode){
 if(!pair||!Object.hasOwn(MODES,mode))return null;
 const origin=safePoint(pair.origin),destination=safePoint(pair.destination);
 if(!origin||!destination)return null;
 const query=new URLSearchParams({
  api:'1',
  origin:origin.lat+','+origin.lon,
  destination:destination.lat+','+destination.lon,
  travelmode:MODES[mode]
 });
 return GOOGLE_DIRECTIONS+query.toString();
}
export function nearbyStopsMapUrl(point){
 const p=safePoint(point);
 if(!p)return null;
 return GOOGLE_SEARCH+new URLSearchParams({
  api:'1',query:'paradas de colectivo cerca de '+p.lat+','+p.lon
 }).toString();
}
export function walkingToStopUrl(point,stop){
 const a=safePoint(point),b=safePoint(stop);
 if(!a||!b)return null;
 return mapsDirectionsUrl({origin:a,destination:b},'pie');
}
export function approxStopMeters(a,b){
 const x=safePoint(a),y=safePoint(b);
 if(!x||!y)return null;
 const rad=z=>z*Math.PI/180;
 const dx=rad(y.lon-x.lon),dy=rad(y.lat-x.lat);
 const c=2*Math.asin(Math.min(1,Math.sqrt(
  Math.sin(dy/2)**2+
  Math.cos(rad(x.lat))*Math.cos(rad(y.lat))*Math.sin(dx/2)**2
 )));
 return Math.round(6371008.8*c);
}
function boundedSignal(external,ms){
 const timeout=AbortSignal.timeout(ms);
 return external?AbortSignal.any([external,timeout]):timeout;
}
const cappedJson=async(res,max)=>{
 if(!res?.ok)throw Error('Servicio no disponible (HTTP '+String(res?.status||0)+')');
 const reported=Number(res.headers?.get?.('content-length')||0);
 if(!Number.isFinite(reported)||reported>max)throw Error('Respuesta demasiado grande');
 const bytes=await res.arrayBuffer();
 if(bytes.byteLength>max)throw Error('Respuesta demasiado grande');
 return JSON.parse(new TextDecoder().decode(bytes));
};
export function valhallaRouteRequest(pair,mode){
 if(!pair||!['auto','bici'].includes(mode))return null;
 const origin=safePoint(pair.origin),destination=safePoint(pair.destination);
 if(!origin||!destination)return null;
 const payload={
  locations:[origin,destination],
  costing:mode==='auto'?'auto':'bicycle',
  units:'kilometers',language:'es-ES'
 };
 return VALHALLA+'?json='+encodeURIComponent(JSON.stringify(payload));
}
export async function estimateRoadRoute(pair,mode,{fetchImpl=fetch,signal}={}){
 const url=valhallaRouteRequest(pair,mode);
 if(!url)throw Error('Ubicación o modo no verificados');
 const response=await fetchImpl(url,{
  method:'GET',mode:'cors',credentials:'omit',redirect:'error',
  headers:{Accept:'application/json','X-Client-Id':CLIENT_ID},
  signal:boundedSignal(signal,16000)
 });
 const data=await cappedJson(response,450_000);
 const length=Number(data?.trip?.summary?.length);
 const seconds=Number(data?.trip?.summary?.time);
 if(!Number.isFinite(length)||!Number.isFinite(seconds)||
    length<0||length>2000||seconds<0||seconds>86400)
  throw Error('El proveedor no devolvió una ruta verificable');
 return Object.freeze({
  mode,km:Math.round(length*10)/10,
  minutes:Math.max(1,Math.round(seconds/60)),
  source:'Valhalla / OpenStreetMap',
  estimated:true,
  includesLiveTraffic:false,
  publicDemo:true
 });
}
export function nearbyStopsQuery(point){
 const p=safePoint(point);
 if(!p)return null;
 const lat=p.lat,lon=p.lon;
 return '[out:json][timeout:12];('+
  'node(around:'+RADIUS+','+lat+','+lon+')["highway"="bus_stop"];'+
  'node(around:'+RADIUS+','+lat+','+lon+')["public_transport"="platform"]["bus"="yes"];'+
  ');out body 100;';
}
export function parseMappedBusStops(data,point){
 const center=safePoint(point);
 if(!center||!Array.isArray(data?.elements))return [];
 const linesOf=tags=>{
  // "ref" by itself is frequently a stop ID, NOT a bus route number.
  const refs=[tags.route_ref,tags.lines,tags.bus_lines]
   .filter(x=>typeof x==='string')
   .flatMap(x=>x.split(/[,;|]/))
   .map(x=>x.trim()).filter(x=>/^[0-9]{1,3}[A-Z]?$/.test(x));
  return [...new Set(refs)].slice(0,12);
 };
 const seen=new Set(),result=[];
 for(const item of data.elements.slice(0,300)){
  if(item?.type!=='node'||!Number.isSafeInteger(item.id)||seen.has(item.id))
   continue;
  const p=safePoint(item);
  if(!p)continue;
  const meters=approxStopMeters(center,p);
  if(meters===null||meters>RADIUS+25)continue;
  const tags=item.tags||{};
  if(tags.highway!=='bus_stop'&&!(tags.public_transport==='platform'&&tags.bus==='yes'))
   continue;
  seen.add(item.id);
  result.push({
   id:item.id,lat:p.lat,lon:p.lon,meters,
   name:String(tags.name||tags.local_ref||'Parada sin nombre').slice(0,85),
   lines:linesOf(tags)
  });
 }
 return result.sort((a,b)=>a.meters-b.meters).slice(0,12);
}
export async function fetchNearbyBusStops(point,{fetchImpl=fetch,signal}={}){
 const query=nearbyStopsQuery(point);
 if(!query)throw Error('Ubicación no validada');
 const response=await fetchImpl(OVERPASS+'?data='+encodeURIComponent(query),{
  method:'GET',mode:'cors',credentials:'omit',redirect:'error',
  headers:{Accept:'application/json'},
  signal:boundedSignal(signal,16000)
 });
 const json=await cappedJson(response,350_000);
 return parseMappedBusStops(json,point);
}
