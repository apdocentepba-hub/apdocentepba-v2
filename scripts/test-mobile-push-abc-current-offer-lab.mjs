import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {
 createAbcCurrentOfferVerifierLab,parseAbcCloseInstantLab
} from './mobile-push-abc-current-offer-lab.mjs';
import {createMobilePushServerRepositoryLab} from './mobile-push-server-repository-lab.mjs';
import {createWorkerMobilePushDryRunLab} from './mobile-push-worker-webcrypto-lab.mjs';

const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const DEVICE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEASE='77777777-7777-4777-8777-777777777777';
const SECRET='FAKE_SERVER_ONLY_SECRET_FOR_TESTS_DO_NOT_REUSE_123456789';
const NOW=Date.parse('2026-11-08T10:00:00Z');
const iso=x=>new Date(x).toISOString();
const plainDoc=()=>({
 id:'SOLR-999',iddetalle:'123',idoferta:'567',estado:'Publicada',
 finoferta:'08/11/2026 09:00',descdistrito:'AVELLANEDA',
 descripcioncargo:'PRECEPTOR',descripcionarea:'',turno:'M',
 descnivelmodalidad:'SECUNDARIA'
});
const abcJSON=(total,docs,extra={})=>new Response(JSON.stringify({
 responseHeader:{status:0,...extra},response:{numFound:total,docs}
}),{status:200,headers:{'content-type':'application/json; charset=iso-8859-1'}});
function fixture({
 key='D_123',doc=plainDoc(),replies=null,
 status=200,type='application/json',badJson=false,oversize=false,
 fail=false,prefEnabled=true,prefUser=USER,match=true,
 matcherUnknown=false,missingPreferences=false,clock=()=>NOW
}={}){
 const queries=[],counts={source:0,prefs:0,match:0};
 const get=async(url,options)=>{
  const u=new URL(url);
  counts.source++;
  queries.push(u);
  assert.equal(u.origin,'https://servicios3.abc.gob.ar');
  assert.equal(u.pathname,
   '/valoracion.docente/api/apd.oferta.encabezado/select');
  assert.equal(u.searchParams.get('rows'),'2');
  assert.equal(u.searchParams.get('wt'),'json');
  assert.ok(u.searchParams.get('fl').includes('finoferta'));
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'manual');
  assert.equal(options.credentials,'omit');
  assert.equal(options.cache,'no-store');
  assert.equal(options.referrerPolicy,'no-referrer');
  assert.ok(options.signal);
  if(fail)throw Error('FICTITIOUS_SOURCE_CREDENTIAL_MUST_NOT_BE_EXPOSED');
  if(status!==200)return new Response('broken',{status});
  if(type!=='application/json')
   return new Response('hello',{status:200,headers:{'content-type':type}});
  if(badJson)return new Response('{invalid',{status:200,headers:{'content-type':type}});
  if(oversize)return new Response('x'.repeat(50_000),{
   status:200,headers:{'content-type':type}
  });
  if(replies){
   const response=replies[counts.source-1];
   if(!response)throw Error('unexpected_extra_source_request');
   return response;
  }
  return abcJSON(1,[doc]);
 };
 const prefs={async getForUser({userId}){
  counts.prefs++;
  assert.equal(userId,USER);
  if(missingPreferences)return null;
  return {user_id:prefUser,alertas_activas:prefEnabled,
   distrito_principal:'AVELLANEDA',cargos:['PRECEPTOR'],
   personal_email:'MUST_NOT_LEAVE_SOURCE'};
 }};
 const matches=async({offer,preferences,userId})=>{
  counts.match++;
  assert.equal(userId,USER);
  assert.equal(offer.descripcioncargo,'PRECEPTOR');
  assert.equal(preferences.distrito_principal,'AVELLANEDA');
  return matcherUnknown?{match:'maybe'}:{match};
 };
 const verifier=createAbcCurrentOfferVerifierLab({
  fetchImpl:get,preferences:prefs,
  matchWithCurrentPreferences:matches,now:clock
 });
 return {verifier,queries,counts};
}

test('real worker.js source identity function matches D_/O_ assertions',()=>{
 const worker=readFileSync('worker.js','utf8');
 const names=['norm','sanitizeSolrNumber','sanitizeKeyText','buildSourceOfferKeyFromOferta'];
 const extracted=names.map(name=>{
  const start=worker.indexOf('function '+name+'(');
  if(start<0)throw Error('worker_source_key_missing_'+name);
  const next=worker.indexOf('\nfunction ',start+10);
  if(next<start)throw Error('worker_source_key_boundary_missing_'+name);
  return worker.slice(start,next);
 });
 const context=vm.createContext({});
 vm.runInContext(extracted.join('\n'),context,{timeout:1000});
 const actual=context.buildSourceOfferKeyFromOferta;
 const examples=[
  [{iddetalle:123,id:'SOLR-999',idoferta:'567'},'D_123'],
  [{id:'solr-001',idoferta:'567'},'D_001'],
  [{idoferta:'567'},'O_567'],
  [{iddetalle:'0042',idoferta:'567'},'D_0042']
 ];
 for(const [doc,key] of examples)
  assert.equal(actual(doc),key);
});

test('strict expiry interprets Argentine local timestamps with UTC-03',()=>{
 assert.equal(parseAbcCloseInstantLab('08/11/2026 09:00'),
  Date.parse('2026-11-08T12:00:00.000Z'));
 assert.equal(parseAbcCloseInstantLab('2026-11-08T09:00'),
  Date.parse('2026-11-08T12:00:00.000Z'));
 assert.equal(parseAbcCloseInstantLab('2026-11-08T12:00:00Z'),
  Date.parse('2026-11-08T12:00:00.000Z'));
 assert.equal(parseAbcCloseInstantLab('2026-11-08T09:00:00-03:00'),
  Date.parse('2026-11-08T12:00:00.000Z'));
 for(const invalid of ['','08/11/2026','2026-11-08','31/02/2026 09:00',
  '2026-02-31T09:00:00','2026-11-08T30:00',
  '2026-11-08T09:00:00+14:30','9999-12-31T00:00:00Z'])
  assert.equal(parseAbcCloseInstantLab(invalid),null,invalid);
});
test('fresh direct ABC published offer is verified using current server preferences',async()=>{
 const f=fixture();
 const r=await f.verifier.verify({userId:USER,sourceOfferKey:'D_123'});
 assert.equal(r.source_offer_key,'D_123');
 assert.equal(r.matched_user_id,USER);
 assert.equal(r.compatible,true);
 assert.equal(r.published,true);
 assert.equal(r.source_current,true);
 assert.equal(r.currently_available,true);
 assert.equal(r.verified_at,iso(NOW));
 assert.equal(r.expires_at,iso(NOW+2*3600_000));
 assert.equal(f.counts.source,1);
 assert.equal(f.counts.prefs,1);
 assert.equal(f.counts.match,1);
 assert.equal(f.queries[0].searchParams.get('q'),'iddetalle:"123"');
 assert.ok(!JSON.stringify(r).includes('MUST_NOT_LEAVE_SOURCE'));
 assert.ok(!JSON.stringify(r).includes('PRECEPTOR'));
});
test('explicit closed ABC offer is not eligible even if still within closing window',async()=>{
 const d=plainDoc();d.estado='Cerrada';
 const f=fixture({doc:d});
 const r=await f.verifier.verify({userId:USER,sourceOfferKey:'D_123'});
 assert.equal(r.published,false);
 assert.equal(r.currently_available,false);
 assert.equal(r.compatible,false);
 assert.equal(f.counts.prefs,0);
 assert.equal(f.counts.match,0);
});
test('expired published ABC offer is not marked current, even if indexed as Publicada',async()=>{
 const d=plainDoc();d.finoferta='08/11/2026 06:59';
 const f=fixture({doc:d});
 const r=await f.verifier.verify({userId:USER,sourceOfferKey:'D_123'});
 assert.equal(r.currently_available,false);
 assert.equal(r.compatible,false);
 assert.equal(f.counts.match,0);
});
test('source identity mismatch is a hard error, not a different school offer',async()=>{
 const d=plainDoc();d.iddetalle='999';
 const f=fixture({doc:d});
 await assert.rejects(()=>f.verifier.verify({
  userId:USER,sourceOfferKey:'D_123'
 }),/abc_source_key_mismatch/);
 assert.equal(f.counts.match,0);
});
test('fallback id search follows current Worker D_ number policy',async()=>{
 const d=plainDoc();
 delete d.iddetalle;d.id='document-123';
 const f=fixture({replies:[abcJSON(0,[]),abcJSON(1,[d])]});
 const r=await f.verifier.verify({userId:USER,sourceOfferKey:'D_123'});
 assert.equal(r.compatible,true);
 assert.equal(f.counts.source,2);
 assert.deepEqual(f.queries.map(x=>x.searchParams.get('q')),
  ['iddetalle:"123"','id:"123"']);
});
test('O_ offer key is only accepted when Worker canonical identity also yields O_',async()=>{
 const d=plainDoc();delete d.iddetalle;delete d.id;
 const f=fixture({key:'O_567',doc:d});
 const r=await f.verifier.verify({userId:USER,sourceOfferKey:'O_567'});
 assert.equal(r.compatible,true);
 assert.equal(f.queries[0].searchParams.get('q'),'idoferta:"567"');
});
test('O_ alias for an offer that has a D_ identity is rejected',async()=>{
 const f=fixture();
 await assert.rejects(()=>f.verifier.verify({
  userId:USER,sourceOfferKey:'O_567'
 }),/abc_source_key_mismatch/);
});
test('source does not invent closure when ABC returns no indexed offer',async()=>{
 const f=fixture({replies:[abcJSON(0,[]),abcJSON(0,[])]});
 const result=await f.verifier.verify({userId:USER,sourceOfferKey:'D_123'});
 assert.equal(result,null);
 assert.equal(f.counts.source,2);
 assert.equal(f.counts.match,0);
});
for(const [label,replies] of [
 ['multiple records',[abcJSON(2,[plainDoc(),plainDoc()])]],
 ['partial response',[abcJSON(1,[plainDoc()],{partialResults:true})]],
 ['non-success Solr header',[abcJSON(1,[plainDoc()],{status:503})]],
 ['truncated records',[abcJSON(1,[])]]
]){
 test('ABC '+label+' cannot authorize an alert',async()=>{
  const f=fixture({replies});
  await assert.rejects(()=>f.verifier.verify({
   userId:USER,sourceOfferKey:'D_123'
  }),/abc_source_ambiguous_or_partial/);
  assert.equal(f.counts.match,0);
 });
}
for(const opts of [
 {badJson:true},{oversize:true},{status:503},
 {type:'text/html'},{fail:true}
]){
 test('malformed or unavailable ABC source fails closed '+JSON.stringify(opts),async()=>{
  const f=fixture(opts);
  await assert.rejects(()=>f.verifier.verify({
   userId:USER,sourceOfferKey:'D_123'
  }),/abc_source_(unavailable|invalid_response)/);
  assert.equal(f.counts.match,0);
 });
}
for(const opts of [
 {missingPreferences:true},{prefEnabled:false},{prefUser:OTHER},
 {matcherUnknown:true}
]){
 test('server preferences or matcher ambiguity cannot produce ready '+JSON.stringify(opts),async()=>{
  const f=fixture(opts);
  const value=await f.verifier.verify({userId:USER,sourceOfferKey:'D_123'});
  assert.equal(value,null);
 });
}
test('verified, explicit APD mismatch returns incompatible without false offer closure',async()=>{
 const f=fixture({match:false});
 const v=await f.verifier.verify({userId:USER,sourceOfferKey:'D_123'});
 assert.equal(v.compatible,false);
 assert.equal(v.published,true);
 assert.equal(v.currently_available,true);
});
test('invalid dates, source keys, identities and dependencies never query ABC',async()=>{
 const f=fixture();
 for(const key of ['hello','D_notNumber','D_1 OR *:*','D_99999999999999999999']){
  await assert.rejects(()=>f.verifier.verify({
   userId:USER,sourceOfferKey:key
  }),/abc_verifier_identity_invalid/);
 }
 await assert.rejects(()=>f.verifier.verify({
  userId:OTHER.slice(1),sourceOfferKey:'D_123'
 }),/abc_verifier_identity_invalid/);
 assert.equal(f.counts.source,0);
 assert.throws(()=>createAbcCurrentOfferVerifierLab({
  fetchImpl:null,preferences:{getForUser:async()=>null},
  matchWithCurrentPreferences:async()=>({match:true})
 }),/abc_verifier_dependencies_invalid/);
 const bad=plainDoc();bad.finoferta='9999-12-31T00:00:00';
 const x=fixture({doc:bad});
 assert.equal(await x.verifier.verify({userId:USER,sourceOfferKey:'D_123'}),null);
 assert.equal(x.counts.match,0);
});
test('full SQL → trusted ABC recheck → Workerd-compatible dispatch gate, no sender',async()=>{
 const f=fixture();
 const event=createHmac('sha256',SECRET)
  .update(JSON.stringify([USER,DEVICE,'D_123'])).digest('hex');
 const claim={
  event_key:event,user_id:USER,device_id:DEVICE,lease_id:LEASE,
  source_offer_key:'D_123',transport:'expo',attempts:1
 };
 const dbase={
  claim:async()=>[claim],
  readActiveLease:async()=>({
   ...claim,status:'leased',leased_until:iso(NOW+60_000)
  }),
  readOwnedDevice:async()=>({
   id:DEVICE,user_id:USER,platform:'android',transport:'expo',
   enabled:true,opted_in:true,token_available:true,token_revoked:false
  }),
  cancel:async()=>true,retry:async()=>true
 };
 const plans={verify:async()=>({
  user_id:USER,access_active:true,verified_at:iso(NOW-10_000)
 })};
 const repo=createMobilePushServerRepositoryLab({
  database:dbase,plans,offers:f.verifier,now:()=>NOW
 });
 const run=createWorkerMobilePushDryRunLab({
  authorizeScheduledRun:async()=>true,
  repository:repo,hmacSecret:SECRET,now:()=>NOW
 });
 assert.deepEqual(await run({}),{
  ok:true,ready:1,cancelled:0,retried:0,provider_calls:0
 });
 assert.equal(f.counts.source,1);
 assert.equal(f.counts.match,1);
});
