import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
 SCHOOL_WFS_LAYERS,verifiedSchoolKey,fetchVerifiedSchool,fetchSelectedSchools,
 distanceBetweenSchools,pairSchoolDistances,workToOfferSchoolDistances
} from './apd-school-geodistance.mjs';

const code='0005MS0004',tcode='0005MT0006';
const feature=(clave,lat=-34.6900,lon=-58.3300)=>({
 type:'Feature',properties:{
  clave,latitud:lat,longitud:lon,nombre:'Escuela <script>alert(1)</script>',
  cue:'061002000',calle:'Calle Test',nro:'123',
 },geometry:{type:'Point',coordinates:[lon,lat]}
});
const response=features=>{
 const bytes=new TextEncoder().encode(JSON.stringify({type:'FeatureCollection',features}));
 return {ok:true,headers:{get:()=>String(bytes.byteLength)},arrayBuffer:async()=>bytes.buffer};
};
const fixture=(features,observed=[])=>async (url,settings)=>{
 const u=new URL(url);
 observed.push({url:u,settings});
 return response(features);
};
test('exact keys whitelist selected official WFS modalities',()=>{
 for(const t of ['0005MS0004','0005MT0006','0005MA0003','0005PP0060',
  '0005JI0917','0005EE0503','0085IS0024']){
  assert.equal(verifiedSchoolKey(t.toLowerCase()),t);
 }
 for(const value of ['0005AP0004','0005MS0004<script>','0005MS0004 OR 1=1',
  '0005MS000','0005MS00044','','0005ZZ0004']){
  assert.equal(verifiedSchoolKey(value),null,value);
 }
});
test('WFS layer mapping remains identical to map page',()=>{
 const html=fs.readFileSync(new URL('../mapa-escuelas-pba.html',import.meta.url),'utf8');
 const from=html.indexOf('const WFS_LAYERS=Object.freeze(');
 const to=html.indexOf('\nfunction capaWfsParaClave(',from);
 assert.ok(from>0&&to>from);
 const mapping=vm.runInNewContext(html.slice(from,to)+'; JSON.stringify(WFS_LAYERS)');
 assert.equal(mapping,JSON.stringify(SCHOOL_WFS_LAYERS));
});
test('single official key uses bounded anonymous GET with no credentials or GPS',async()=>{
 const observed=[];
 const result=await fetchVerifiedSchool(code,{
  fetchImpl:fixture([feature(code)],observed)
 });
 assert.equal(observed.length,1);
 assert.equal(observed[0].url.origin,'https://mapaescolar.abc.gob.ar');
 assert.equal(observed[0].url.pathname,'/me/wfs');
 assert.equal(observed[0].url.searchParams.get('CQL_FILTER'),"clave='0005MS0004'");
 assert.equal(observed[0].url.searchParams.get('typeNames'),SCHOOL_WFS_LAYERS.MS);
 assert.equal(observed[0].url.searchParams.get('count'),'5');
 assert.equal(observed[0].settings.credentials,'omit');
 assert.equal(observed[0].settings.mode,'cors');
 assert.equal(observed[0].settings.redirect,'error');
 assert.equal(observed[0].settings.method,'GET');
 assert.equal(result.clave,code);assert.equal(result.source,'ABC_WFS');
 assert.equal(result.cue,'061002000');assert.equal(result.domicilio,'Calle Test 123');
});
test('mismatch, duplicate school and empty responses return no verified coordinate',async()=>{
 for(const features of [[feature('0005MS0005')],[feature(code),feature(code)],[]]){
  assert.equal(await fetchVerifiedSchool(code,{fetchImpl:fixture(features)}),null);
 }
});
test('invalid coordinates and malformed upstream content fail closed',async()=>{
 for(const [lat,lon] of [[0,0],[-34,-70],[90,-58],['abc',-58],[null,null]]){
  assert.equal(await fetchVerifiedSchool(code,{fetchImpl:fixture([feature(code,lat,lon)])}),null);
 }
 assert.equal(await fetchVerifiedSchool(code,{fetchImpl:async()=>({
  ok:true,headers:{get:()=>0},arrayBuffer:async()=>new TextEncoder().encode('bad json').buffer
 })}),null);
});
test('provider errors and oversized payloads never create a marker',async()=>{
 for(const mock of [
  async()=>{throw Error('network');},
  async()=>({ok:false}),
  async()=>({ok:true,headers:{get:()=>400000}})
 ]){
  assert.equal(await fetchVerifiedSchool(code,{fetchImpl:mock}),null);
 }
});
test('at most five unique provincial keys are queried on explicit call',async()=>{
 const observed=[];
 const result=await fetchSelectedSchools([code,code,tcode,'0005AP0004'],{
  fetchImpl:async (url,opts)=>{
   observed.push(new URL(url).searchParams.get('CQL_FILTER'));
   const key=String(new URL(url).searchParams.get('CQL_FILTER')).slice(7,-1);
   return response([feature(key)]);
  }
 });
 assert.equal(observed.length,2);
 assert.deepEqual(result.attempted,[code,tcode]);
 assert.equal(result.unverified.length,0);
 assert.equal(Object.keys(result.verified).length,2);
 await assert.rejects(fetchSelectedSchools(Array(6).fill(code)),/max_five/);
});
test('partial outage yields unknown for a school, never a fake distance',async()=>{
 const result=await fetchSelectedSchools([code,tcode],{
  fetchImpl:async url=>String(url).includes('MT')?{ok:false}:response([feature(code)])
 });
 assert.equal(Object.keys(result.verified).length,1);
 assert.deepEqual(result.unverified,[tcode]);
 assert.deepEqual(pairSchoolDistances(result.verified,[code,tcode]),[]);
});
test('pairwise distances in straight line for two trusted school markers',()=>{
 const a={source:'ABC_WFS',exact_key_match:true,clave:code,lat:-34.69,lon:-58.33};
 const b={source:'ABC_WFS',exact_key_match:true,clave:tcode,lat:-34.70,lon:-58.34};
 const distance=distanceBetweenSchools(a,b);
 assert.ok(distance>0 && distance<3);
 assert.equal(distanceBetweenSchools(a,a),0);
 assert.deepEqual(pairSchoolDistances({[code]:a,[tcode]:b},[code,tcode,code]),
  [{escuela_a:code,escuela_b:tcode,km_linea_recta:distance}]);
});
test('current job to offer distance requires independently ABC verified school keys',()=>{
 const current={source:'ABC_WFS',exact_key_match:true,clave:'0005MS0099',lat:-34.68,lon:-58.31,nombre:'Nombre oficial ABC'};
 const offered={source:'ABC_WFS',exact_key_match:true,clave:code,lat:-34.69,lon:-58.33};
 const jobs=[{school:'Escuela actual A',schoolKey:'0005MS0099'},
  {school:'Escuela actual B sin clave'},
  {school:'Escuela duplicada',schoolKey:'0005MS0099'}];
 const valid=workToOfferSchoolDistances(jobs,code,{'0005MS0099':current,[code]:offered});
 assert.equal(valid.length,1);
 assert.equal(valid[0].school,'Nombre oficial ABC','Do not trust teacher-entered school label as official');
 assert.ok(valid[0].km_linea_recta>0&&valid[0].km_linea_recta<4);
 assert.deepEqual(workToOfferSchoolDistances(jobs,code,{'0005MS0099':current}),[]);
 assert.deepEqual(workToOfferSchoolDistances(jobs,code,{[code]:offered}),[]);
 assert.deepEqual(workToOfferSchoolDistances(jobs,'invalid',{'0005MS0099':current,[code]:offered}),[]);
 assert.deepEqual(workToOfferSchoolDistances(jobs,code,{
  '0005MS0099':{...current,exact_key_match:false},[code]:offered}),[]);
 assert.deepEqual(workToOfferSchoolDistances(jobs,code,{
  '0005MS0099':{...current,clave:'0005MS0098'},[code]:offered}),[],
  'Wrong keyed school must never yield a distance');
 assert.deepEqual(workToOfferSchoolDistances(jobs,code,{
  '0005MS0099':current,[code]:{...offered,clave:'0005MS0008'}}),[],
  'Wrong offered school marker must never yield a distance');
 assert.deepEqual(workToOfferSchoolDistances(Array(6).fill(jobs[0]),code,{
  '0005MS0099':current,[code]:offered}),[]);
});
test('forged location flags cannot become a trusted geo pair',()=>{
 const a={source:'ABC_WFS',exact_key_match:true,clave:code,lat:-34.69,lon:-58.33};
 const forged={...a,clave:tcode,source:'user'};
 assert.equal(distanceBetweenSchools(a,forged),null);
 const wrong={...forged,source:'ABC_WFS',exact_key_match:false};
 assert.equal(distanceBetweenSchools(a,wrong),null);
 const bad={...a,clave:tcode,lat:0,lon:0};
 assert.equal(distanceBetweenSchools(a,bad),null);
});
test('prevents personal geolocation and browser persistence in official resolver',()=>{
 const source=fs.readFileSync(new URL('./apd-school-geodistance.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/navigator\.geolocation|getCurrentPosition|watchPosition|localStorage|sessionStorage|indexedDB|supabase/i);
 assert.ok(!source.includes('token='));
});
