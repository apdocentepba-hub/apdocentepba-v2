import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compactCaptureFromPages} from './apd-offer-compact-capture.mjs';
import {createABCOfficialStatusVerifier}
 from './apd-abc-official-status-verifier.mjs';
import {createABCTransitionCorrelator}
 from './apd-abc-transition-correlator.mjs';

const KEY='D_123456',SCOPE='AVELLANEDA';
const CAPTURED='2026-11-09T08:00:00Z';
const NOW=Date.parse('2026-11-09T09:01:00Z');
const row={
 source_offer_key:KEY,distrito:SCOPE,estado:'Publicada',
 finoferta:'2026-11-12T07:30:00Z',turno:'Mañana',
 cargo:'Preceptor'
};
const compact=(rows=[row],capturedAt=CAPTURED,scope=SCOPE)=>
 compactCaptureFromPages({scope,capturedAt,
  pages:[{offset:0,sourceTotal:rows.length,rows}]});
function official(state='Anulada',opts={}){
 const calls=[];
 const fetchImpl=async(url,options)=>{
  const u=new URL(url);calls.push({u,options});
  const params=Object.fromEntries(u.searchParams);
  const currentState=opts.secondState&&calls.length===2?
   opts.secondState:state;
  const reply={
   responseHeader:{status:0,params},
   response:{numFound:opts.none?0:1,start:0,
    docs:opts.none?[]:[{
     iddetalle:'123456',idoferta:'900001',
     descdistrito:opts.wrongDistrict?'QUILMES':SCOPE,
     estado:currentState
    }]}
  };
  if(opts.fail)throw Error('NEVER_LOG_RAW_DETAILS');
  return new Response(JSON.stringify(reply),{
   status:200,headers:{'content-type':'application/json'}
  });
 };
 return {calls,verifier:createABCOfficialStatusVerifier({
  enabled:true,fetchImpl,maxChecks:3
 })};
}
const correlate=(verifier,cap=compact(),sourceOfferKey=KEY,clock=()=>NOW)=>
 createABCTransitionCorrelator({enabled:true,verifier,clock})
  .inspect({previousCapture:cap,sourceOfferKey});

test('module disabled unless explicitly enabled',()=>{
 assert.throws(()=>createABCTransitionCorrelator({verifier:{inspect:()=>{}}}),
  /disabled/);
});

test('Published in prior compact capture -> double-read Anulada yields NON-deliverable candidate',async()=>{
 const abc=official();
 const candidate=await correlate(abc.verifier);
 assert.equal(candidate.verified,true);
 assert.equal(candidate.reviewCandidate,true);
 assert.equal(candidate.previousObservedState,'PUBLICADA');
 assert.equal(candidate.laterObservedState,'ANULADA');
 assert.equal(candidate.previousObservedAt,CAPTURED);
 assert.equal(candidate.laterVerifiedAt,'2026-11-09T09:01:00.000Z');
 assert.equal(candidate.sourceScope,SCOPE);
 assert.equal(candidate.evidenceHash.length,64);
 assert.equal(candidate.originalCaptureAttestedByABC,false);
 assert.equal(candidate.historicTransitionProven,false);
 assert.equal(candidate.exactStateTransitionTimeKnown,false);
 assert.equal(candidate.notificationAllowed,false);
 assert.equal(candidate.eventsCreated,0);
 assert.equal(candidate.recordsStored,0);
 assert.equal(candidate.candidateOnly,true);
 assert.equal(abc.calls.length,2);
 assert.equal(JSON.stringify(candidate).includes('123456'),false);
 assert.equal(JSON.stringify(candidate).includes('900001'),false);
 assert.equal(Object.hasOwn(candidate,'push_body'),false);
});

test('stable candidate digest permits offline dedup without a public identifier',async()=>{
 const a=await correlate(official().verifier);
 const b=await correlate(official().verifier);
 assert.equal(a.evidenceHash,b.evidenceHash);
 const modified=compact([{...row,turno:'Tarde'}]);
 const c=await correlate(official().verifier,modified);
 assert.notEqual(c.evidenceHash,a.evidenceHash);
});

test('Published/Designada/Desierta/Renunciada are NOT annulments',async()=>{
 for(const state of ['Publicada','Designada','Desierta','Renunciada']){
  const abc=official(state);
  const c=await correlate(abc.verifier);
  assert.equal(c.verified,false);
  assert.equal(c.reason,'status_is_not_anulada');
  assert.equal(c.reviewCandidate,false);
  assert.equal(c.notificationAllowed,false);
  assert.equal(abc.calls.length,2);
 }
});

test('bad prior identity, original state, district and missing row prevent any network',async()=>{
 const scenarios=[
  {capture:compact(),key:'O_123456'},
  {capture:compact(),key:'D_123456 OR *:*'},
  {capture:compact(),key:'D_88888'},
  {capture:compact([{...row,estado:'Anulada'}]),key:KEY},
  {capture:compact([{...row,source_offer_key:'D_0001'}]),key:KEY},
  {capture:compact([{...row,distrito:'QUILMES'}]),key:KEY},
  {capture:compact([row,row]),key:KEY},
  {capture:{...compact(),complete:false},key:KEY},
 ];
 for(const {capture,key} of scenarios){
  const abc=official();
  const result=await correlate(abc.verifier,capture,key);
  assert.equal(result.verified,false);
  assert.equal(abc.calls.length,0);
 }
});

test('mutated snapshot digest and unwanted field fail closed without GET',async()=>{
 const first=compact();
 const changed={...first,rows:[{...first.rows[0],cargo:'Director'}]};
 const extra={...first,rows:[{
  ...first.rows[0],email:'private@example.org'
 }]};
 for(const cap of [changed,extra]){
  const abc=official();
  const result=await correlate(abc.verifier,cap);
  assert.equal(result.verified,false);
  assert.equal(abc.calls.length,0);
 }
});

test('capturedAt must be BEFORE subsequent verification, recent and valid UTC',async()=>{
 const times=[
  '2026-11-09T09:01:00Z', // same instant
  '2026-11-09T09:02:00Z', // future
  '2026-11-07T09:00:00Z', // too old
  '2026-02-30T09:00:00Z', // invalid calendar
  '2026-11-09T08:00:00' // not UTC-qualified
 ];
 for(const stamp of times){
  const abc=official();
  const result=await correlate(abc.verifier,compact([row],stamp));
  assert.equal(result.verified,false,stamp);
  assert.equal(abc.calls.length,0);
 }
});

test('a targeted ABC status read error never becomes a review candidate',async()=>{
 for(const opts of [{fail:true},{wrongDistrict:true},
  {none:true},{secondState:'Publicada'}]){
  const abc=official('Anulada',opts);
  const c=await correlate(abc.verifier);
  assert.equal(c.verified,false);
  assert.equal(c.reason,'targeted_abc_verification_failed');
  assert.equal(c.notificationAllowed,false);
  assert.equal(JSON.stringify(c).includes('NEVER_LOG_RAW_DETAILS'),false);
 }
});

test('a forged result cannot claim data without the required verifier provenance',async()=>{
 const bad=[
  {verified:true,source:'ABC_public_detail_lookup',scope:SCOPE,
   checks:1,candidateOnly:true,historicTransitionProven:false,
   notificationAllowed:false,recordsStored:0,eventsCreated:0,
   officialState:'ANULADA',classification:'officially_annulled'},
  {verified:true,source:'FAKE_OFFICIAL_SOURCE',scope:SCOPE,
   checks:2,candidateOnly:true,historicTransitionProven:false,
   notificationAllowed:false,recordsStored:0,eventsCreated:0,
   officialState:'ANULADA',classification:'officially_annulled'},
  {verified:true,source:'ABC_public_detail_lookup',scope:'QUILMES',
   checks:2,candidateOnly:true,historicTransitionProven:false,
   notificationAllowed:false,recordsStored:0,eventsCreated:0,
   officialState:'ANULADA',classification:'officially_annulled'}
 ];
 for(const record of bad){
  const c=await correlate({inspect:async()=>record});
  assert.equal(c.verified,false);
  assert.equal(c.reason,'targeted_status_result_not_trusted');
 }
});

test('a verifier cannot take more than one minute without invalidating candidate',async()=>{
 let time=NOW;
 const clock=()=>{const now=time;time+=61000;return now;};
 const abc=official();
 const result=await correlate(abc.verifier,compact(),KEY,clock);
 assert.equal(result.verified,false);
 assert.equal(result.reason,'verification_time_invalid');
});

test('module has no network operations, messages, user data, or storage',()=>{
 const source=readFileSync(new URL('./apd-abc-transition-correlator.mjs',
  import.meta.url),'utf8');
 assert.doesNotMatch(source,
  /\bfetch\s*\(|supabase|sendgrid|mailgun|whatsapp|telegram|nodemailer|localStorage|WebSocket|smtp/i);
 assert.match(source,/enabled=false/);
 assert.match(source,/notificationAllowed:false/);
 assert.match(source,/originalCaptureAttestedByABC:false/);
});
