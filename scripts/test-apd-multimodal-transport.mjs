import test from 'node:test';
import assert from 'node:assert/strict';
import {
 verifiedMobilityPair,mapsDirectionsUrl,nearbyStopsMapUrl,
 valhallaRouteRequest,estimateRoadRoute
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
test('Google Maps route links use both exact points and all four supported modes',()=>{
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
});
test('Valhalla car, bike and walking estimates require numeric provider fields',async()=>{
 for(const [mode,costing] of [['auto','auto'],['bici','bicycle'],['pie','pedestrian']]){
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
 for(const invalid of [null,false,'', '0']){
  await assert.rejects(()=>estimateRoadRoute(pair,'pie',{
   fetchImpl:async()=>response({trip:{summary:{length:invalid,time:600}}})
  }),/ruta verificable/);
 }
 await assert.rejects(()=>estimateRoadRoute(pair,'auto',{
  fetchImpl:async()=>response({error:'rate limited'},{status:429})}),/no disponible/);
 assert.equal(valhallaRouteRequest(null,'auto'),null);
 assert.equal(valhallaRouteRequest(pair,'transporte'),null,
  'transit route has no supported free GTFS engine; use Google Maps');
 assert.ok(valhallaRouteRequest(pair,'pie'), 'pedestrian route has its own Valhalla costing');
});
