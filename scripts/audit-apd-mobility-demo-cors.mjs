/**
 * External demo services availability probe with synthetic Buenos Aires points.
 * No user address, credentials, GPS, token, mutations, route recording or auto-repeat.
 * Browser access is confirmed by CORS preflight, not a Node GET alone.
 */
import {
 verifiedMobilityPair,valhallaRouteRequest
} from './apd-multimodal-transport.mjs';
const origin={source:'GEOREF_AR_V2',lat:-34.604,lon:-58.386,
 scope:'exacta',reviewed:true};
const school={source:'ABC_WFS',exact_key_match:true,clave:'0005MS0002',
 lat:-34.612,lon:-58.401};
const pair=verifiedMobilityPair(origin,school);
if(!pair)throw Error('Synthetic pair validation failed');
const originHeader='https://alertasapd.com.ar';
const services=[
 {name:'VALHALLA',url:valhallaRouteRequest(pair,'auto'),headers:'x-client-id'}
];
for(const item of services){
 try{
  const res=await fetch(item.url,{
   method:'OPTIONS',
   headers:{
    Origin:originHeader,
    'Access-Control-Request-Method':'GET',
    ...(item.headers?{'Access-Control-Request-Headers':item.headers}:{})
   },
   signal:AbortSignal.timeout(16000)
  });
  const allow=res.headers.get('access-control-allow-origin');
  const h=res.headers.get('access-control-allow-headers')||'';
  console.log('APD_MOBILITY_DEMO_CORS '+JSON.stringify({
   service:item.name,options_status:res.status,
   allow_origin:allow,
   allow_headers:h.slice(0,140),
   allows_browser_origin:allow==='*'||allow===originHeader,
   allows_identifier_header:!item.headers||
    h.toLowerCase().includes('x-client-id')||h.includes('*')
  }));
  await res.body?.cancel();
 }catch(error){
  console.log('APD_MOBILITY_DEMO_CORS '+JSON.stringify({
   service:item.name,available:false,reason:String(error?.name||'network_error')
  }));
 }
}
// Informational only: demo availability must never become an uptime dependency
// for APDocentePBA core authenticated comparator or alerts.

for(const item of services){
 try{
  const res=await fetch(item.url,{
   method:'GET',
   headers:{Origin:originHeader,Accept:'application/json',
    ...(item.name==='VALHALLA'?{'X-Client-Id':'alertasapd.com.ar'}:{})},
   signal:AbortSignal.timeout(20000)
  });
  const acao=res.headers.get('access-control-allow-origin');
  const data=res.ok?await res.json():null;
  const usable=item.name==='VALHALLA'?
   Number.isFinite(Number(data?.trip?.summary?.length))&&
    Number.isFinite(Number(data?.trip?.summary?.time)):
   Array.isArray(data?.elements);
  console.log('APD_MOBILITY_DEMO_GET '+JSON.stringify({
   service:item.name,status:res.status,
   browser_origin_allowed:acao==='*'||acao===originHeader,
   valid_route_or_stops:usable,
   note:'synthetic_coordinates_only'
  }));
 }catch(error){
  console.log('APD_MOBILITY_DEMO_GET '+JSON.stringify({
   service:item.name,available:false,error:String(error?.name||'network_error')
  }));
 }
}


const {buildAmbaBusLayerUrl,parseAmbaBusLineFeatures}=await import('./apd-amba-bus-routes.mjs');
for(let layer=0;layer<4;layer++){
 try{
  const url=buildAmbaBusLayerUrl(origin,layer);
  const response=await fetch(url,{
   method:'GET',headers:{Origin:originHeader,Accept:'application/json'},
   signal:AbortSignal.timeout(16000)
  });
  const acao=response.headers.get('access-control-allow-origin');
  const j=response.ok?await response.json():null;
  const valid=j&&!j.error&&Array.isArray(j.features);
  const scope=['CABA','Provincial','Nacional','Municipal'][layer];
  const lines=valid?parseAmbaBusLineFeatures(j,scope):[];
  console.log('APD_AMBA_BUS_LAYER '+JSON.stringify({
   layer,scope,status:response.status,
   browser_origin_allowed:acao==='*'||acao===originHeader,
   valid:!!valid,features:j?.features?.length||0,lines:lines.length,
   synthetic_coordinates_only:true
  }));
 }catch(error){
  console.log('APD_AMBA_BUS_LAYER '+JSON.stringify({
   layer,available:false,reason:String(error?.message||error).slice(0,120)
  }));
 }
}
