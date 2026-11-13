/**
 * APDocentePBA / Insigne — mobility from a selected home to an ABC-verified school.
 *
 * Routes: Google Maps URLs (free, no API key), plus opt-in estimates using the
 * FOSSGIS Valhalla demo for car/bike. No silent routing queries or GPS capture.
 * Nearby bus route layers are in separate opt-in ArcGIS module, not this file.
 */
const BOUNDS={minLat:-42,maxLat:-33,minLon:-64,maxLon:-55};
const GOOGLE_DIRECTIONS='https://www.google.com/maps/dir/?';
const GOOGLE_SEARCH='https://www.google.com/maps/search/?';
const VALHALLA='https://valhalla1.openstreetmap.de/route';
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
 if(!pair||!['auto','bici','pie'].includes(mode))return null;
 const origin=safePoint(pair.origin),destination=safePoint(pair.destination);
 if(!origin||!destination)return null;
 const payload={
  locations:[origin,destination],
  costing:mode==='auto'?'auto':mode==='bici'?'bicycle':'pedestrian',
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
 const length=data?.trip?.summary?.length;
 const seconds=data?.trip?.summary?.time;
 // A zero-length journey is credible only when its two reference points
 // coincide. In particular, two different schools must never display 0 km.
 const samePoint=pair.origin.lat===pair.destination.lat&&
  pair.origin.lon===pair.destination.lon;
 // Never coerce null/false/empty provider fields into a fabricated 0 km route.
 if(typeof length!=='number'||typeof seconds!=='number'||
    !Number.isFinite(length)||!Number.isFinite(seconds)||
    length<0||length>2000||seconds<0||seconds>86400||
    (!samePoint&&(length===0||seconds===0))||
    (samePoint&&((length===0)!==(seconds===0))))
  throw Error('El proveedor no devolvió una ruta verificable');
 return Object.freeze({
  // Preserve nonzero short routes: rounding 0.03 km to 0.0 is misleading.
  mode,km:length>0&&length<0.1?length:Math.round(length*10)/10,
  minutes:samePoint&&seconds===0?0:Math.max(1,Math.round(seconds/60)),
  source:'Valhalla / OpenStreetMap',
  estimated:true,
  includesLiveTraffic:false,
  publicDemo:true
 });
}
