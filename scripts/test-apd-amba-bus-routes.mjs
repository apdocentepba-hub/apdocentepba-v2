import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildAmbaBusLayerUrl,parseAmbaBusLineFeatures,fetchAmbaBusLinesNear
} from './apd-amba-bus-routes.mjs';
const point={lat:-34.601,lon:-58.4};
const response=(json,code=200)=>{
 const data=new TextEncoder().encode(JSON.stringify(json));
 return {ok:code===200,status:code,
  headers:{get:()=>String(data.length)},
  arrayBuffer:async()=>data.buffer};
};
test('AMBA bus line query is bounded to 400m, no token, all four jurisdictions',()=>{
 for(let layer=0;layer<4;layer++){
  const url=new URL(buildAmbaBusLayerUrl(point,layer));
  assert.equal(url.hostname,'services1.arcgis.com');
  assert.equal(url.pathname.endsWith('/'+layer+'/query'),true);
  assert.equal(url.searchParams.get('geometry'),'-58.4,-34.601');
  assert.equal(url.searchParams.get('distance'),'400');
  assert.equal(url.searchParams.get('units'),'esriSRUnit_Meter');
  assert.equal(url.searchParams.get('geometryType'),'esriGeometryPoint');
  assert.equal(url.searchParams.get('returnGeometry'),'false');
  assert.equal(url.searchParams.get('resultRecordCount'),'2000');
  assert.equal(url.searchParams.get('returnDistinctValues'),'true');
  assert.equal(url.searchParams.get('outFields'),'LINEA');
  assert.equal(url.searchParams.get('f'),'json');
  assert.ok(!url.searchParams.has('token'));
 }
 assert.equal(buildAmbaBusLayerUrl(point,4),null);
 assert.equal(buildAmbaBusLayerUrl({lat:60,lon:-58.4},0),null);
});
test('only explicit route numbers are surfaced; map traces are never called bus stops',()=>{
 assert.deepEqual(
  parseAmbaBusLineFeatures({features:[
   {attributes:{LINEA:33,RAMAL:1}},
   {attributes:{LINEA:33,RAMAL:2}},
   {attributes:{LINEA:0}}, // route number zero is invalid
   {attributes:{LINEA:'-4'}},
   {attributes:{linea:'85'}},
   {attributes:{linea:'unknown'}},
   {attributes:{REF:'line 55'}}
  ]},'Provincial')
  .map(x=>({line:x.line,scope:x.scope,stops:x.stopVerified})),
  [{line:'33',scope:'Provincial',stops:false},
   {line:'85',scope:'Provincial',stops:false}]
 );
 assert.throws(()=>parseAmbaBusLineFeatures({
  features:[],exceededTransferLimit:true
 },'Nacional'),/confirmar todas/);
 assert.throws(()=>parseAmbaBusLineFeatures({error:{message:'rate limited'}},'CABA'),/confirmar/);
});
test('fetch checks each AMBA jurisdiction and returns distinct route numbers, no auth',async()=>{
 const calls=[];
 const output=[
  {features:[{attributes:{linea:'33'}},{attributes:{linea:'85'}}]},
  {features:[{attributes:{LINEA:333}}]},
  {features:[{attributes:{LINEA:33}}]},
  {features:[{attributes:{LINEA:12}}]}
 ];
 const items=await fetchAmbaBusLinesNear(point,{
  fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   const layer=Number(new URL(url).pathname.match(/\/(\d+)\/query$/)?.[1]);
   return response(output[layer]);
  }
 });
 assert.equal(calls.length,4);
 assert.deepEqual(items.lines.map(x=>x.line+':'+x.scope),[
  '12:Municipal','33:CABA','33:Nacional','85:CABA','333:Provincial'
 ]);
 assert.ok(items.lines.every(x=>x.serviceVerified===false&&x.stopVerified===false));
  assert.equal(items.complete,true);
  assert.deepEqual(items.unavailableScopes,[]);
  assert.equal(items.totalLines,5);
 assert.ok(calls.every(x=>x.opts.credentials==='omit'&&x.opts.method==='GET'));
});
test('one jurisdiction outage returns partial, explicitly labelled coverage',async()=>{
  let concurrent=0,peak=0;
  const result=await fetchAmbaBusLinesNear(point,{
   fetchImpl:async(url)=>{
    concurrent++;peak=Math.max(peak,concurrent);
    await Promise.resolve();
    concurrent--;
    if(url.includes('/1/query'))throw Error('Provider unavailable');
    return response({features:[{attributes:{LINEA:'33'}}]});
   }
  });
  assert.equal(peak,4, 'independent layer calls must run in parallel');
  assert.equal(result.complete,false);
  assert.deepEqual(result.unavailableScopes,['Provincial']);
  assert.deepEqual(result.checkedScopes,['CABA','Nacional','Municipal']);
  assert.deepEqual(result.lines.map(x=>x.scope),['CABA','Municipal','Nacional']);
  assert.equal(result.totalLines,3);
});
test('do not silently lose mapped routes beyond 500 records',()=>{
 const features=Array.from({length:501},(_,i)=>({attributes:{LINEA:i+1}}));
 assert.equal(parseAmbaBusLineFeatures({features},'CABA').length,501);
});
test('bad upstream features fail closed, never assign line codes from arbitrary tags',async()=>{
 await assert.rejects(()=>fetchAmbaBusLinesNear(point,{
  fetchImpl:async()=>response({error:{code:400}})}),/capa/);
 await assert.rejects(()=>fetchAmbaBusLinesNear(point,{
  fetchImpl:async()=>response({features:[]},429)}),/HTTP 429/);
});
