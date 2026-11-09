import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createAPDABCPublicPageReader} from './apd-abc-public-reader.mjs';
import {createAPDScannerCompactAdapter,ABC_PUBLIC_FIELDS}
 from './apd-scanner-compact-adapter.mjs';

const publicRows=[
 {iddetalle:1000,idoferta:500,descdistrito:'AVELLANEDA',
  estado:'Publicada',finoferta:'2026-11-12T07:30:00Z',
  turno:'M',escuela:'0005MS0001',cargo:'PRECEPTOR'},
 {iddetalle:1001,idoferta:501,descdistrito:'AVELLANEDA',
  estado:'Publicada',finoferta:'2026-11-12T07:30:00Z',
  turno:'T',escuela:'0005MS0002',cargo:'PRECEPTOR'}
];
const approved=new Set(ABC_PUBLIC_FIELDS);
const makeFetch=(changes={})=>{
 const calls=[];
 const fn=async (requested,options)=>{
  const u=new URL(requested);
  calls.push({u,options});
  const pass=calls.length>2?2:1;
  const start=Number(u.searchParams.get('start'));
  const rows=Number(u.searchParams.get('rows'));
  const params=Object.fromEntries(u.searchParams.entries());
  if(changes.badEcho)params.fl='*';
  let docs=publicRows.slice(start,start+rows);
  if(changes.extraPersonal&&start===0)docs=docs.map(x=>({...x,cuilautor:'REDACTED'}));
  if(changes.drift&&pass===2&&start===1)docs=docs.map(x=>({...x,turno:'N'}));
  const payload={responseHeader:{status:0,params},response:{
   numFound:2,start,docs
  }};
  if(changes.badStatus)return new Response('no',{status:429,headers:{'content-type':'text/plain'}});
  if(changes.badMime)return new Response('<html>bad</html>',{
   status:200,headers:{'content-type':'text/html'}});
  if(changes.hugeBody)return new Response('x'.repeat(1024*1024+1),{
   status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify(payload),{
   status:200,headers:{'content-type':'application/json'}});
 };
 return {fn,calls};
};
const probe=async f=>{
 const reader=createAPDABCPublicPageReader({enabled:true,fetchImpl:f});
 const adapter=createAPDScannerCompactAdapter({
  enabled:true,readPage:reader,
  readScanState:()=>{throw Error('INSPECT_MUST_NOT_REQUIRE_SCANNER');},
  pageSize:1
 });
 return adapter.inspect({district:'AVELLANEDA'});
};
test('public reader defaults OFF and does not invoke fetch',()=>{
 let calls=0;
 assert.throws(()=>createAPDABCPublicPageReader({fetchImpl:()=>{calls++;}}),/disabled/);
 assert.equal(calls,0);
});
test('public probe restricts official host, privacy fields and request count',async()=>{
 const f=makeFetch();
 const result=await probe(f.fn);
 assert.equal(result.sourceTotal,2);
 assert.equal(result.stableAcrossTwoPasses,true);
 assert.equal(result.certifiedScannerCapture,false);
 assert.equal(result.capturesSaved,0);
 assert.equal(result.eventsCreated,0);
 assert.equal(result.notificationsSent,0);
 assert.equal(result.authorizedForProduction,false);
 assert.equal(f.calls.length,4);
 for(const {u,options} of f.calls){
  assert.equal(u.origin,'https://servicios3.abc.gob.ar');
  assert.equal(u.pathname,'/valoracion.docente/api/apd.oferta.encabezado/select');
  assert.equal(u.searchParams.get('q'),
   'descdistrito:"AVELLANEDA" AND estado:"Publicada"');
  assert.equal(u.searchParams.get('fl'),ABC_PUBLIC_FIELDS.join(','));
  assert.equal(u.searchParams.get('sort'),'ult_movimiento desc,iddetalle asc');
  assert.equal(u.searchParams.get('wt'),'json');
  assert.equal(options.method,'GET');
  assert.equal(options.credentials,'omit');
  assert.equal(options.redirect,'error');
  assert.equal(options.cache,'no-store');
  assert.deepEqual(Object.keys(options.headers),['Accept']);
 }
 assert.equal(ABC_PUBLIC_FIELDS.length,18);
 for(const field of ABC_PUBLIC_FIELDS){
  assert.ok(approved.has(field));
  assert.doesNotMatch(field,/cuil|ape.?nom|domicilio|observaciones|reemp_/i);
 }
 assert.equal(Object.hasOwn(result,'rows'),false);
 assert.equal(Object.hasOwn(result,'capture'),false);
 assert.equal(JSON.stringify(result).includes('1000'),false);
});
test('wrong fl response echo or extra PII fails without saving a capture',async()=>{
 await assert.rejects(()=>probe(makeFetch({badEcho:true}).fn),/query not verified/);
 await assert.rejects(()=>probe(makeFetch({extraPersonal:true}).fn),/unapproved field/);
});
test('source changes between the two passes stop the public inspection',async()=>{
 await assert.rejects(()=>probe(makeFetch({drift:true}).fn),/contents shifted/);
});
test('HTTP failures, HTML response and oversized payload fail closed',async()=>{
 await assert.rejects(()=>probe(makeFetch({badStatus:true}).fn),/refused by origin/);
 await assert.rejects(()=>probe(makeFetch({badMime:true}).fn),/unexpected content type/);
 await assert.rejects(()=>probe(makeFetch({hugeBody:true}).fn),/over size limit/);
});
test('wrong source query, mode, district and field set reject before GET',async()=>{
 const f=makeFetch(),read=createAPDABCPublicPageReader({enabled:true,fetchImpl:f.fn});
 const base={district:'AVELLANEDA',query:'descdistrito:"AVELLANEDA" AND estado:"Publicada"',
  sort:'ult_movimiento desc,iddetalle asc',fields:ABC_PUBLIC_FIELDS.join(','),
  mode:'current_published',start:0,rows:1};
 for(const delta of [
  {district:'BAD" OR *:*'},
  {query:'descdistrito:"AVELLANEDA"'},
  {fields:'*'},
  {mode:'all'},
  {rows:501},{start:-1}
 ])await assert.rejects(()=>read({...base,...delta}),/Unapproved ABC public query/);
 assert.equal(f.calls.length,0);
});
test('manual probe has two OFF switches and never executes on an accidental CLI run',()=>{
 const cli=fileURLToPath(new URL('./apd-abc-public-probe.mjs',import.meta.url));
 const env={...process.env,APD_ABC_READONLY_PROBE:''};
 for(const args of [
  [],['--district=AVELLANEDA'],
  ['--read-only','--district=AVELLANEDA']
 ]){
  const p=spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:5000});
  assert.equal(p.status,2);
  assert.match(p.stderr,/PROBE_DISABLED/);
  assert.equal(p.stdout,'');
 }
});
