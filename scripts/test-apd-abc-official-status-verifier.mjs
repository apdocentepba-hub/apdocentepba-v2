import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createABCOfficialStatusVerifier} from './apd-abc-official-status-verifier.mjs';

const source='D_123456';
const acceptedFields='iddetalle,idoferta,estado,descdistrito';
function fixture(opts={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  const u=new URL(url);calls.push({u,options});
  const params=Object.fromEntries(u.searchParams);
  if(opts.echoQuery)params.q=opts.echoQuery;
  if(opts.echoFields)params.fl=opts.echoFields;
  if(opts.echoSort)params.sort=opts.echoSort;
  const state=calls.length===2&&opts.secondState?
   opts.secondState:opts.state??'Anulada';
  const doc={
   iddetalle:opts.wrongID?'9999':'123456',
   idoferta:'900001',estado:state,
   descdistrito:opts.wrongDistrict?'QUILMES':'AVELLANEDA',
   ...(opts.addPersonal?{cuil:'not-a-real-number'}:{})
  };
  const payload={
   responseHeader:{status:opts.solrStatus??0,params},
   response:{numFound:opts.found??1,start:0,
    docs:opts.found===0?[]:opts.found===2?[doc,doc]:[doc]}
  };
  if(opts.throwNetwork)throw Error('private_token_must_not_be_logged');
  if(opts.httpError)return new Response('no',{status:503,headers:{'content-type':'application/json'}});
  if(opts.html)return new Response('<html>no</html>',{headers:{'content-type':'text/html'}});
  if(opts.large)return new Response('x'.repeat(33000),{headers:{'content-type':'application/json'}});
  if(opts.garbage)return new Response('not-json',{headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
 };
 return {calls,fetchImpl};
}
const inspect=(f,more={})=>createABCOfficialStatusVerifier({
 enabled:true,fetchImpl:f.fetchImpl
}).inspect({district:'AVELLANEDA',sourceOfferKey:source,...more});

test('verifier disabled by default and cannot open network',()=>{
 let calls=0;
 assert.throws(()=>createABCOfficialStatusVerifier({
  fetchImpl:()=>{calls++;throw Error('unexpected network')}
 }),/disabled/);
 assert.equal(calls,0);
});
test('two official reads confirm one Anulada and expose no source identifiers',async()=>{
 const f=fixture();
 const out=await inspect(f);
 assert.equal(out.verified,true);
 assert.equal(out.officialState,'ANULADA');
 assert.equal(out.classification,'officially_annulled');
 assert.equal(out.checks,2);
 assert.equal(out.historicTransitionProven,false);
 assert.equal(out.notificationAllowed,false);
 assert.equal(out.recordsStored,0);
 assert.equal(out.eventsCreated,0);
 assert.equal(out.candidateOnly,true);
 assert.equal(f.calls.length,2);
 assert.equal(JSON.stringify(out).includes('123456'),false);
 for(const {u,options} of f.calls){
  assert.equal(u.origin,'https://servicios3.abc.gob.ar');
  assert.equal(u.pathname,'/valoracion.docente/api/apd.oferta.encabezado/select');
  assert.equal(u.searchParams.get('q'),'descdistrito:"AVELLANEDA" AND iddetalle:123456');
  assert.equal(u.searchParams.get('rows'),'2');
  assert.equal(u.searchParams.get('fl'),acceptedFields);
  assert.equal(u.searchParams.get('sort'),'ult_movimiento desc,iddetalle asc');
  assert.equal(u.searchParams.get('start'),'0');
  assert.equal(u.searchParams.get('wt'),'json');
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  assert.equal(options.credentials,'omit');
  assert.equal(options.cache,'no-store');
 }
});
test('official published state must NOT be classified as cancellation',async()=>{
 const out=await inspect(fixture({state:'Publicada'}));
 assert.equal(out.classification,'published');
 assert.equal(out.notificationAllowed,false);
});
test('Designada, Desierta and Renunciada are distinct, NOT Anulada',async()=>{
 for(const st of ['Designada','Desierta','Renunciada']){
  const out=await inspect(fixture({state:st}));
  assert.equal(out.classification,'other_terminal');
  assert.equal(out.officialState,st.toUpperCase());
  assert.notEqual(out.classification,'officially_annulled');
 }
});
test('O_ fallback IDs, URL injection and invalid districts fail before GET',async()=>{
 const cases=[
  {sourceOfferKey:'O_321'},
  {sourceOfferKey:'D_12 OR *:*'},
  {sourceOfferKey:'D_-12'},
  {sourceOfferKey:'D_1234567890123456789'},
  {district:'AVELLANEDA" OR *:*'},
  {district:'Avellaneda'},
  {district:'AVELLANEDA\nQUILMES'}
 ];
 for(const c of cases){
  const f=fixture();
  await assert.rejects(()=>inspect(f,c),/Unapproved district or unstable offer identity/);
  assert.equal(f.calls.length,0);
 }
});
test('missing or nonunique official detail IDs are fail closed',async()=>{
 for(const found of [0,2]){
  const f=fixture({found});
  await assert.rejects(()=>inspect(f),/missing, ambiguous or mismatched/);
  assert.equal(f.calls.length,1);
 }
});
test('wrong district, wrong ID or additional private source field are rejected',async()=>{
 for(const options of [{wrongDistrict:true},{wrongID:true},{addPersonal:true}]){
  const f=fixture(options);
  await assert.rejects(()=>inspect(f),/identity or fields invalid/);
  assert.equal(f.calls.length,1);
 }
});
test('changed status between two read passes rejects, never declares official event',async()=>{
 const f=fixture({state:'Publicada',secondState:'Anulada'});
 await assert.rejects(()=>inspect(f),/changed between reads/);
 assert.equal(f.calls.length,2);
});
test('unexpected official status is not silently treated as cancellation',async()=>{
 const f=fixture({state:'A definir'});
 await assert.rejects(()=>inspect(f),/not yet classified/);
});
test('missing field filter echo, wrong q or sort and Solr status are rejected',async()=>{
 for(const options of [
  {echoQuery:'*:*'}, {echoFields:'*'},
  {echoSort:'ult_movimiento desc'}, {solrStatus:400}
 ]){
  await assert.rejects(()=>inspect(fixture(options)),
   /missing, ambiguous or mismatched/);
 }
});
test('HTTP, MIME, invalid JSON, oversize and network failure fail safely',async()=>{
 for(const [opts,pattern] of [
  [{httpError:true},/request refused/],
  [{html:true},/not JSON/],
  [{large:true},/stream incomplete or too large/],
  [{garbage:true},/invalid JSON/],
  [{throwNetwork:true},/request failed or timed out/]
 ]){
  await assert.rejects(()=>inspect(fixture(opts)),pattern);
 }
});
test('isolated verifier contains no recipients, persistence or mail sender',()=>{
 const sourceText=readFileSync(new URL('./apd-abc-official-status-verifier.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(sourceText,/\bsupabase\b|service_role|mailto:|whatsapp|telegram|sendgrid|mailgun|nodemailer|postMessage|localStorage|websocket|smtp/i);
 assert.match(sourceText,/enabled=false/);
 assert.match(sourceText,/historicTransitionProven:false/);
 assert.match(sourceText,/notificationAllowed:false/);
});
