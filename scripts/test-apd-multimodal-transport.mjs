import test from 'node:test';
import assert from 'node:assert/strict';
import {
 verifiedMobilityPair,mapsDirectionsUrl,nearbyStopsMapUrl,walkingToStopUrl,
 valhallaRouteRequest,estimateRoadRoute,nearbyStopsQuery,parseMappedBusStops,
 fetchNearbyBusStops,approxStopMeters
} from './apd-multimodal-transport.mjs';

const home={source:'GEOREF_AR_V2',lat:-34.601,lon:-58.41,
 label:'Calle Ficticia, Argentina',scope:'partido',reviewed:true};
const school={source:'ABC_WFS',exact_key_match:true,
 clave:'0005MS0002',lat:-34.619,lon:-58.422,nombre:'Escuela Ficticia'};
const pair=verifiedMobilityPair(home,school);
const response=(obj,{status=200,contentLength=0}={})=>{
 const raw=new TextEncoder().encode(JSON.stringify(obj));
 return {ok:status===200,status,
  headers:{get:key=>key==='content-length'?String(contentLength):null},
  arrayBuffer:async()=>raw.buffer};
};
test('only reviewed Georef home + exact ABC school may create real route links',()=>{
 assert.deepEqual(pair?.origin,{lat:-34.601,lon:-58.41});
 assert.deepEqual(pair?.destination,{lat:-34.619,lon:-58.422});
 assert.equal(verifiedMobilityPair({...home,reviewed:false},school),null);
 assert.equal(verifiedMobilityPair({...home,source:'DEVICE_GPS'},school),null);
 assert.equal(verifiedMobilityPair(home,{...school,exact_key_match:false}),null);
 assert.equal(verifiedMobilityPair(home,{...school,clave:'0005MSXXX'}),null);
 assert.equal(verifiedMobilityPair(home,{...school,lat:999}),null);
});
test('Google Maps links contain exact endpoints and all four supported modes',()=>{
 for(const [mode,expected] of Object.entries({
  auto:'driving',bici:'bicycling',transporte:'transit',pie:'walking'
 })){
  const value=mapsDirectionsUrl(pair,mode);
  const url=new URL(value);
  assert.equal(url.hostname,'www.google.com');
  assert.equal(url.pathname,'/maps/dir/');
  assert.equal(url.searchParams.get('api'),'1');
  assert.equal(url.searchParams.get('travelmode'),expected);
  assert.equal(url.searchParams.get('origin'),'-34.601,-58.41');
  assert.equal(url.searchParams.get('destination'),'-34.619,-58.422');
 }
 assert.equal(mapsDirectionsUrl(pair,'flying'),null);
 assert.equal(mapsDirectionsUrl(null,'auto'),null);
 const stop=new URL(nearbyStopsMapUrl(pair.origin));
 assert.equal(stop.pathname,'/maps/search/');
 assert.match(stop.searchParams.get('query'),/paradas de colectivo/);
 assert.equal(new URL(walkingToStopUrl(pair.origin,pair.destination))
  .searchParams.get('travelmode'),'walking');
});
test('Valhalla car and bike requests never invent distance or duration',async()=>{
 for(const [mode,costing] of [['auto','auto'],['bici','bicycle']]){
  const req=new URL(valhallaRouteRequest(pair,mode));
  assert.equal(req.hostname,'valhalla1.openstreetmap.de');
  assert.equal(JSON.parse(req.searchParams.get('json')).costing,costing);
  const calls=[];
  const result=await estimateRoadRoute(pair,mode,{fetchImpl:async(url,options)=>{
   calls.push({url,options});
   return response({trip:{summary:{length:9.37,time:1035}}});
  }});
  assert.equal(result.km,9.4);
  assert.equal(result.minutes,17);
  assert.equal(result.includesLiveTraffic,false);
  assert.equal(result.publicDemo,true);
  assert.equal(calls[0].options.headers['X-Client-Id'],'alertasapd.com.ar');
  assert.equal(calls[0].options.credentials,'omit');
 }
 await assert.rejects(()=>estimateRoadRoute(pair,'auto',{
  fetchImpl:async()=>response({trip:{summary:{}}})}),/ruta verificable/);
 await assert.rejects(()=>estimateRoadRoute(pair,'auto',{
  fetchImpl:async()=>response({error:'rate limited'},{status:429})}),/no disponible/);
});
test('nearby bus parsing only accepts tagged actual mapped stops within 400m',()=>{
 const data={elements:[
  {type:'node',id:1,lat:-34.601,lon:-58.411,
   tags:{highway:'bus_stop',name:'Parada Uno',route_ref:'17; 85 ;X99'}},
  {type:'node',id:2,lat:-34.601,lon:-58.411,
   tags:{highway:'bus_stop',route_ref:'17'}},
  {type:'node',id:3,lat:-34.601,lon:-58.4101,
   tags:{highway:'bus_stop',ref:'9999',name:'Sin línea mapeada'}},
  {type:'node',id:4,lat:-34.601,lon:-58.418,
   tags:{highway:'bus_stop',route_ref:'10'}},
  {type:'node',id:5,lat:-34.601,lon:-58.4102,
   tags:{highway:'residential',route_ref:'10'}}
 ]};
 const stops=parseMappedBusStops(data,home);
 assert.deepEqual(stops.map(s=>s.id),[3,1]);
 assert.deepEqual(stops[1].lines,['17','85']);
 assert.deepEqual(stops[0].lines,[],'stop ref is not a bus line');
 assert.ok(stops.every(s=>s.meters<=400));
 assert.ok(approxStopMeters(home,home)===0);
});
test('stop queries are bounded and opt-in; malformed provider data rejected',async()=>{
 const query=nearbyStopsQuery(home);
 assert.ok(query.includes('around:400,'));
 assert.ok(query.includes('[timeout:12]'));
 let request;
 const stops=await fetchNearbyBusStops(home,{fetchImpl:async(url,opt)=>{
  request={url,opt};
  return response({elements:[{
   type:'node',id:21,lat:-34.601,lon:-58.41,
   tags:{highway:'bus_stop',route_ref:'33'}
  }]});
 }});
 assert.equal(stops.length,1);
 assert.deepEqual(stops[0].lines,['33']);
 assert.ok(new URL(request.url).searchParams.get('data').includes('node(around:400'));
 assert.equal(request.opt.credentials,'omit');
 await assert.rejects(()=>fetchNearbyBusStops(home,{
  fetchImpl:async()=>response({elements:[]},{status:503})}),/no disponible/);
 assert.equal(nearbyStopsQuery(null),null);
});
