import test from 'node:test';
import assert from 'node:assert/strict';
import {careerAccountRequest,combineCareerWithSchedule,cleanCareer} from './apd-career-account-core.mjs';
const profile={schema:1,seniorityYears:10,positions:[{id:'c1',schoolKey:'0005MS0004',school:'Escuela de ensayo',role:'Matemática',level:'Secundaria',kind:'modulo',status:'titular',quantity:2,modules:['T1-1'],blocks:[{day:1,start:'14:00',end:'16:00'}]}]};
function fixture(){
 const rows=new Map();
 const deps={authenticate:async req=>({BearerA:{id:'A'},BearerB:{id:'B'}})[req.headers.get('authorization')],entitled:async id=>id==='A',read:async id=>rows.get(id)||null,compareAndSet:async(id,data)=>{if((rows.get(id)?.revision||0)!==data.revision)return null;const result={profile:data.profile,revision:data.revision+1};rows.set(id,result);return result;}};
 const call=(method,auth,data)=>careerAccountRequest(new Request('https://fixture.invalid/api/account/career',{method,headers:{authorization:auth,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})}),deps);
 return {rows,call,deps};
}
test('unauthenticated denied and missing profile distinct from empty',async()=>{
 const {call}=fixture();assert.equal((await call('GET','A')).status,401);
 assert.deepEqual((await call('GET','BearerA')).body.career,{profile:null,revision:0});
});
test('save/readback, owner isolation, expired plan can read but not write',async()=>{
 const {call,rows}=fixture();
 assert.equal((await call('PUT','BearerA',{profile,revision:0})).status,200);
 assert.deepEqual((await call('GET','BearerA')).body.career,{profile,revision:1});
 assert.deepEqual((await call('GET','BearerB')).body.career,{profile:null,revision:0});
 assert.equal((await call('PUT','BearerB',{profile,revision:0})).status,403);
 assert.equal(rows.size,1);
});
test('stale revision, spoofed owner, invalid payload and excess size rejected',async()=>{
 const {call}=fixture();await call('PUT','BearerA',{profile,revision:0});
 assert.equal((await call('PUT','BearerA',{profile,revision:0})).status,409);
 assert.equal((await call('PUT','BearerA',{profile,revision:1,user_id:'B'})).status,400);
 assert.equal((await call('PUT','BearerA',{profile:{...profile,salary:999},revision:1})).status,400);
 assert.equal((await call('PUT','BearerA',{profile:{...profile,positions:[{...profile.positions[0],school:'x'.repeat(70000)}]},revision:1})).status,413);
 assert.equal((await call('GET','BearerA')).body.career.revision,1);
});
test('projection is nonmutating and preserves legacy occupied modules',()=>{
 const legacy=['M1-2','T1-1'];const result=combineCareerWithSchedule(profile,legacy);
 assert.deepEqual(result.modules,legacy);assert.deepEqual(result.unassignedModules,['M1-2']);assert.equal(result.jobs.length,1);assert.deepEqual(legacy,['M1-2','T1-1']);
});
test('unknown fields and excess aggregate blocks are rejected',()=>{
 assert.throws(()=>cleanCareer({...profile,positions:[{...profile.positions[0],unknown:true}]}));
 const p=profile.positions[0];assert.throws(()=>cleanCareer({...profile,positions:[{...p,blocks:Array(42).fill(p.blocks[0])},{...p,id:'c2',modules:[]}]}));
});
test('storage error fails closed',async()=>{
 const {deps}=fixture();deps.read=async()=>{throw Error('private detail');};
 const r=await careerAccountRequest(new Request('https://fixture.invalid',{headers:{authorization:'BearerA'}}),deps);
 assert.equal(r.status,503);assert.ok(!JSON.stringify(r).includes('private detail'));
});

import {createCareerClient} from './apd-career-account-client.mjs';
test('client uses real session, confirms GET PUT GET and isolates account changes',async()=>{
 const {deps}=fixture();let token='BearerA';const calls=[];
 deps.authenticate=async req=>({'Bearer BearerA':{id:'A'},'Bearer BearerB':{id:'B'}})[req.headers.get('authorization')];
 const fetcher=async(url,opts)=>{calls.push([opts.method,opts.headers.Authorization]);const r=await careerAccountRequest(new Request(url,opts),deps);return new Response(JSON.stringify(r.body),{status:r.status});};
 const client=createCareerClient({base:'https://fixture.invalid',getToken:()=>token,fetcher});
 await client.reload();const save=await client.persist(profile);
 assert.deepEqual(save,{profile,revision:1});
 assert.deepEqual(calls.map(x=>x[0]),['GET','PUT','GET']);
 const copy=client.peek();copy.profile.positions.length=0;assert.equal(client.peek().profile.positions.length,1);
 token='BearerB';assert.equal(client.peek(),null);
});
test('client discards an old response after a session changes',async()=>{
 let token='A',release;const client=createCareerClient({base:'https://fixture.invalid',getToken:()=>token,fetcher:()=>new Promise(r=>release=r)});
 const pending=client.reload();token='B';assert.equal(client.peek(),null);
 release(new Response(JSON.stringify({ok:true,career:{profile,revision:1}})));
 await assert.rejects(pending,/sesión cambió/);assert.equal(client.peek(),null);
});
test('client requires a confirmed read before mutation and invalidates uncertain revision',async()=>{
 let fail=false;const {deps}=fixture();deps.authenticate=async()=>({id:'A'});
 const fetcher=async(url,opts)=>{if(fail&&opts.method==='PUT')throw Error('red');const r=await careerAccountRequest(new Request(url,opts),deps);return new Response(JSON.stringify(r.body),{status:r.status});};
 const client=createCareerClient({base:'https://fixture.invalid',getToken:()=>'A',fetcher});
 await assert.rejects(client.persist(profile),/Recuperá/);await client.reload();fail=true;
 await assert.rejects(client.persist(profile),/red/);assert.equal(client.peek(),null);
});

import {createSchoolCatalog} from './apd-career-school-catalog.mjs';
test('public school catalog searches exact identity and preserves unknown classification',()=>{
 const first={schoolKey:'0005MS0004',name:'Escuela Secundaria N° 4',district:'Avellaneda',level:'Secundaria',area:'Rural',classification:null,surveyPeriod:'2026'};
 const other={...first,schoolKey:'0005MS0005',name:'Escuela Secundaria N° 5',classification:'0'};
 const snap={schema:1,source:'DGCYE_PBA',datasetId:'4becb4b7-0a21-4fef-8f2c-30df7f345a01',resourceId:'00000000-0000-4000-8000-000000000001',sha256:'a'.repeat(64),catalogModified:'2026-11-18',schools:[first,other]};
 const catalog=createSchoolCatalog(snap);
 assert.equal(catalog.exact(first.schoolKey).classification,null);
 assert.equal(catalog.exact(other.schoolKey).classification,'0');
 assert.equal(catalog.search('secundaria 4','avellaneda').length,1);
 assert.equal(catalog.search('secundaria','quilmes').length,0);
 assert.equal(catalog.exact('0005MS0006'),null);
 assert.throws(()=>createSchoolCatalog({...snap,schools:[first,first]}));
});

import {loadReviewedSchoolCatalog} from './apd-career-school-loader.mjs';
test('reviewed school loader fails closed without approval or matching content digest',async()=>{
 const snapshot={schema:1,source:'DGCYE_PBA',datasetId:'4becb4b7-0a21-4fef-8f2c-30df7f345a01',resourceId:'3951210e-7e0e-4fed-bbf1-0183e704c9ae',sha256:'a'.repeat(64),catalogModified:'2026-11-18',schools:[{schoolKey:'0005MS0004',name:'Escuela fixture',district:'Avellaneda',level:'Secundaria',area:'Rural',classification:null,surveyPeriod:'2026'}]};
 const bytes=new TextEncoder().encode(JSON.stringify(snapshot));
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const manifest={approved:true,indexDigest:'sha256:'+digest,sourceDigest:snapshot.sha256,resourceId:snapshot.resourceId,catalogModified:snapshot.catalogModified,path:'data/career-schools-'+digest.slice(0,16)+'.json'};
 let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(new URL(url).origin,'https://alertasapd.com.ar');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return new Response(bytes);};
 assert.equal(await loadReviewedSchoolCatalog({manifest:{...manifest,approved:false},origin:'https://alertasapd.com.ar',fetcher}),null);
 assert.equal(calls,0);
 const catalog=await loadReviewedSchoolCatalog({manifest,origin:'https://alertasapd.com.ar',fetcher});
 assert.equal(catalog.exact('0005MS0004').classification,null);
 await assert.rejects(loadReviewedSchoolCatalog({manifest:{...manifest,indexDigest:'sha256:'+'b'.repeat(64)},origin:'https://alertasapd.com.ar',fetcher}),/Integridad/);
 await assert.rejects(loadReviewedSchoolCatalog({manifest:{...manifest,sourceDigest:'b'.repeat(64)},origin:'https://alertasapd.com.ar',fetcher}),/Procedencia/);
 assert.equal(await loadReviewedSchoolCatalog({manifest:{...manifest,path:'https://foreign.invalid/index.json'},origin:'https://alertasapd.com.ar',fetcher}),null);
});

import {seniorityPercent,disadvantagePercent,statutoryComponents} from './apd-career-statutory-pay.mjs';
test('statutory seniority thresholds and boundaries',()=>{
 for(const [years,rate] of [[0,0],[1,10],[2,20],[3,20],[4,30],[6,30],[7,40],[9,40],[10,50],[11,50],[12,60],[14,60],[15,70],[16,70],[17,80],[19,80],[20,100],[21,100],[22,110],[23,110],[24,120],[40,120]])assert.equal(seniorityPercent(years),rate);
 for(const n of [-1,1.5,null,81])assert.throws(()=>seniorityPercent(n));
});
test('disadvantage requires legal classification, not geography or raw data',()=>{
 for(const [c,r] of [['NORMAL',0],['I',30],['II',60],['III',90],['IV',100],['V',120]])assert.equal(disadvantagePercent(c),r);
 for(const c of ['Rural','U0','0','1',null,'__proto__'])assert.equal(disadvantagePercent(c),null);
});
test('known statutory components never masquerade as full gross or take-home pay',()=>{
 const a=statutoryComponents({recognizedYears:10,monthlyAssignmentCentavos:10000000,confirmedLegalClass:'II'});
 assert.equal(a.seniorityCentavos,5000000);assert.equal(a.disadvantageCentavos,null);assert.equal(a.knownSubtotalCentavos,15000000);assert.equal(a.netCentavos,null);assert.equal(a.grossCentavos,null);
 const b=statutoryComponents({recognizedYears:10,monthlyAssignmentCentavos:10000000,confirmedLegalClass:'II',confirmedDisadvantageBaseCentavos:8000000});
 assert.equal(b.disadvantageCentavos,4800000);assert.equal(b.knownSubtotalCentavos,19800000);assert.equal(b.status,'partial');
 assert.throws(()=>statutoryComponents({recognizedYears:10,monthlyAssignmentCentavos:NaN}));
});

import {mergeConfirmedCareerPlanner} from './apd-career-profile-core.mjs';
import {checkScheduleOverlap} from './apd-mi-jornada-comparador.mjs?v=20261124-modulos';
test('confirmed career affects availability without altering the original schedule',()=>{
 const base={jobs:[],moduleSchedule:['M1-2'],travelGapMinutes:0};
 const profile={schema:1,seniorityYears:10,positions:[{id:'c1',schoolKey:'0005MS0004',school:'Escuela de prueba',role:'Matemática',level:'Secundaria',kind:'modulo',status:'titular',quantity:2,modules:[],blocks:[{day:1,start:'14:00',end:'16:00'}]}]};
 const before=JSON.stringify(base),merged=mergeConfirmedCareerPlanner(base,{profile,revision:1});
 assert.equal(JSON.stringify(base),before);
 assert.equal(checkScheduleOverlap('Lunes: 15:00 a 16:00',merged).status,'overlap');
 assert.deepEqual(merged.moduleSchedule,['M1-2']);
 assert.equal(checkScheduleOverlap('Lunes: 17:00 a 18:00',merged).status,'no-overlap');
 assert.equal(mergeConfirmedCareerPlanner(base,{profile:null,revision:0}),base);
});
test('unresolved afternoon modules are retained instead of manufacturing compatibility',()=>{
 const base={jobs:[],moduleSchedule:['T1-1'],travelGapMinutes:0};
 const profile={schema:1,seniorityYears:5,positions:[{id:'c1',schoolKey:'0005MS0004',school:'Escuela fixture',role:'Matemática',level:'Secundaria',kind:'modulo',status:'titular',quantity:1,modules:['T1-1'],blocks:[{day:1,start:'14:00',end:'15:00'}]}]};
 const result=mergeConfirmedCareerPlanner(base,{profile,revision:1});
 assert.equal(checkScheduleOverlap('Lunes: 17:00 a 18:00',result).status,'unverified');
 assert.deepEqual(result.moduleSchedule,['T1-1']);
});

import {payrollCapReview} from './apd-career-statutory-pay.mjs';
test('salary cap warnings are aggregate and never apply an invented deduction',()=>{
 const p=(kind,quantity)=>({kind,quantity});
 const a=payrollCapReview({positions:[p('modulo',12),p('modulo',8)]});
 assert.equal(a.totals.modulo,20);assert.deepEqual(a.warnings,[]);
 const b=payrollCapReview({positions:[p('modulo',12),p('modulo',9)]});
 assert.equal(b.warnings[0].id,'teaching-cap');assert.equal(b.automaticDeduction,false);
 const c=payrollCapReview({positions:[p('cargo',1),p('cargo',1),p('cargo',1),p('hora_catedra',31)]});
 assert.deepEqual(c.warnings.map(x=>x.id),['cargo-cap','teaching-cap','mixed-units']);
 assert.throws(()=>payrollCapReview({positions:[p('cargo',2)]}));
});


import {readFileSync as readCareerBuilder} from 'node:fs';
import {runInNewContext as careerVm} from 'node:vm';
import {hasInsignePlannerAccess as uiCareerAccess} from './apd-insigne-planner-entitlement.mjs';
test('career Worker and UI agree for verified new plans, reject expired and contradictory plans',async()=>{
 const source=readCareerBuilder(new URL('./build-apd-career-worker-candidate.mjs',import.meta.url),'utf8');
 const fragment=source.slice(source.indexOf('async function hasAccountCareerAccessV1('),source.indexOf('async function handleAccountCareerSecureV1('));
 assert.ok(fragment.startsWith('async function hasAccountCareerAccessV1('));
 const now=Date.now(),future=new Date(now+60000).toISOString(),past=new Date(now-60000).toISOString();
 for(const code of ['COMPLETO','TRIAL_14D']){
  const snapshot={ok:true,access_active:true,plan:{code},subscription:{user_id:'A',plan_code:code,status:'ACTIVE',source:'fixture',trial_ends_at:future,current_period_ends_at:future}};
  const check=async(p,active=true,id='A')=>careerVm(fragment+'\n hasAccountCareerAccessV1({},id)',{resolverPlanUsuario:async()=>p,isPlanActivo:()=>active,Date,id});
  assert.equal(await check(snapshot),true);assert.equal(uiCareerAccess(snapshot,now),true);
  for(const patch of [{status:'PENDING'},{source:'FALLBACK_FRONTEND'},{trial_ends_at:past,current_period_ends_at:past},{trial_ends_at:null,current_period_ends_at:null}]){
   const invalid={...snapshot,subscription:{...snapshot.subscription,...patch}};
   assert.equal(await check(invalid),false);assert.equal(uiCareerAccess(invalid,now),false);
  }
  const mismatch={...snapshot,plan:{code:'FREE'}};
  assert.equal(await check(mismatch),false);assert.equal(uiCareerAccess(mismatch,now),false);
  assert.equal(await check(snapshot,true,'B'),false);
  assert.equal(await check(snapshot,false),false);
 }
 const legacy={plan:{code:'INSIGNE'},subscription:{plan_code:'INSIGNE',status:'ACTIVE'}};
 const free={plan:{code:'FREE'},subscription:{plan_code:'FREE',status:'ACTIVE'}};
 for(const [p,expected] of [[legacy,true],[free,false]])assert.equal(await careerVm(fragment+'\n hasAccountCareerAccessV1({}, "A")',{resolverPlanUsuario:async()=>p,isPlanActivo:()=>true,Date}),expected);
});

test('career API rejects ambiguous or insecure base before transmitting credentials',()=>{
 for(const base of ['http://fixture.invalid','https://user:pass@fixture.invalid','https://fixture.invalid/path','https://fixture.invalid?x=1','https://fixture.invalid/#fragment']){
  assert.throws(()=>createCareerClient({base,getToken:()=> 'secret-fixture',fetcher:()=>{throw Error('unexpected network');}}),/API inválida/);
 }
});
test('switch during write confirmation prevents readback under another account',async()=>{
 let token='A',reads=0;const calls=[];
 const client=createCareerClient({base:'https://fixture.invalid/',getToken:()=>token,fetcher:async(url,opts)=>{
  calls.push([url,opts.method,opts.headers.Authorization]);
  if(opts.method==='GET'){reads++;return new Response(JSON.stringify({ok:true,career:{profile:null,revision:0}}));}
  const response={ok:true,json:async()=>{token='B';return {ok:true,career:{profile,revision:1}};}};
  return response;
 }});
 await client.reload();
 await assert.rejects(client.persist(profile),/sesión cambió/);
 assert.equal(reads,1);assert.equal(client.peek(),null);
 assert.ok(calls.every(([url,,auth])=>url==='https://fixture.invalid/api/account/career'&&auth==='Bearer A'));
});

test('career revocation during body processing denies persistence while own read remains available',async()=>{
 for(const mode of ['session','plan']){
  const {deps,rows,call}=fixture();
  let auth=0,rights=0;
  deps.authenticate=async()=>mode==='session'&&++auth>1?null:{id:'A'};
  deps.entitled=async()=>mode==='plan'?++rights===1:true;
  const r=await call('PUT','BearerA',{profile,revision:0});
  assert.equal(r.status,mode==='session'?401:403);assert.equal(rows.size,0);
 }
});
