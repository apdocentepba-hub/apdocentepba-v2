import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createApplicationDiaryClient} from './apd-application-diary-client.mjs';
import {verifyHostedDiary} from './test-apd-diary-hosted.mjs';
import {createCareerClient} from './apd-career-account-client.mjs';

const requireRuntime=createRequire(new URL('../tmp/apd-career-runtime/package.json',import.meta.url));
const {Miniflare}=requireRuntime('miniflare');
const candidatePath=fileURLToPath(new URL('../tmp/apd-career/worker-career-candidate.mjs',import.meta.url));
const baselinePath=new URL('../tmp/apd-career/worker-career-baseline.mjs',import.meta.url);
const baselineSource=process.env.APD_CAREER_LIVE_SOURCE
 ? new URL('../tmp/apd-career/active-worker.mjs',import.meta.url)
 : new URL('../worker-live/worker_hotfix.js',import.meta.url);
writeFileSync(baselinePath,readFileSync(baselineSource));
const env={SUPABASE_URL:'https://career-db.invalid',SUPABASE_SERVICE_ROLE_KEY:'disposable-service-role'};
const workerOrigin='https://career-worker.invalid';
let diaryContractCalls=null;

async function disposableDatabase(request){
 const url=new URL(request.url);
 // Never forward credentials or fixture data outside the disposable container.
 assert.equal(url.origin,env.SUPABASE_URL);
 assert.ok(url.pathname.startsWith('/rest/v1/'));
 assert.equal(request.headers.get('Authorization'),'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
 const local=new URL(url.pathname.slice('/rest/v1'.length)+url.search,'http://127.0.0.1:3301');
 const headers=new Headers(request.headers);
 headers.delete('Authorization');
 headers.delete('apikey');
 const payload=request.body?await request.arrayBuffer():undefined;
 const response=await fetch(local,{method:request.method,headers,redirect:'error',body:payload,signal:request.signal});
 if(diaryContractCalls&&/^\/(?:rpc\/)?[a-z_]+$/.test(local.pathname)){
  const params=payload&&headers.get('Content-Type')?.includes('application/json')
   ? Object.keys(JSON.parse(new TextDecoder().decode(payload))).sort()
   : [];
  diaryContractCalls.push({resource:local.pathname,method:request.method,status:response.status,params});
 }
 if(!response.ok&&local.pathname.includes('application_diary')){
  const error=await response.clone().json().catch(()=>({}));
  console.error('Disposable diary storage error',local.pathname,response.status,error.code,error.message);
 }
 return response;
}
const options=scriptPath=>({
 modules:true,scriptPath,compatibilityDate:'2026-04-01',
 bindings:env,outboundService:disposableDatabase
});
const runtime=new Miniflare(options(candidatePath));
const invoke=(url,init)=>runtime.dispatchFetch(url,init);
async function login(account){
 const response=await invoke(workerOrigin+'/api/login',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:'career-'+account+'@example.invalid',password:'career-fixture-'+account})
 });
 assert.equal(response.status,200,'password login');
 const session=await response.json();
 assert.equal(session.ok,true);
 assert.match(session.session_token,/^[0-9a-f]{64}$/);
 return session.session_token;
}
const client=token=>createCareerClient({
 base:workerOrigin,getToken:()=>token,fetcher:invoke
});
const vacancy={profile:null,revision:0};
const profile={schema:1,seniorityYears:10,positions:[{
 id:'one',schoolKey:'0005DC0709',school:'Escuela de ensayo',role:'Matemática',
 level:'Secundaria',kind:'modulo',status:'titular',quantity:2,
 modules:['T1-1'],blocks:[{day:1,start:'14:00',end:'16:00'}]
}]};
try{
 const endpoint=workerOrigin+'/api/account/career';
 async function preflight(origin){
  return invoke(endpoint,{method:'OPTIONS',headers:{
   Origin:origin,'Access-Control-Request-Method':'PUT',
   'Access-Control-Request-Headers':'authorization,content-type'
  }});
 }
 const trustedOrigin='https://alertasapd.com.ar';
 const allowed=await preflight(trustedOrigin);
 assert.equal(allowed.status,204);
 assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),trustedOrigin);
 assert.equal((await preflight('https://unrelated.invalid')).headers.get('Access-Control-Allow-Origin'),null);
 assert.equal((await invoke(endpoint)).status,401);
 const [tokenA,tokenB]=await Promise.all([login('a'),login('b')]);
 assert.notEqual(tokenA,tokenB);
 const a=client(tokenA),b=client(tokenB),competing=client(tokenA);
 assert.deepEqual(await a.reload(),vacancy);
 assert.deepEqual(await competing.reload(),vacancy);
 const saved=await a.persist(profile);
 assert.deepEqual(saved,{profile,revision:1});
 await assert.rejects(competing.persist({...profile,seniorityYears:11}),/Recuperá la versión actual/);
 assert.deepEqual(await b.reload(),vacancy);
 const other=await b.persist({...profile,seniorityYears:2});
 const newTokenA=await login('a');
 assert.notEqual(newTokenA,tokenA);
 const newSession=client(newTokenA);
 assert.deepEqual(await newSession.reload(),saved);
 await runtime.setOptions(options(fileURLToPath(baselinePath)));
 const baselineResponse=await invoke(endpoint,{
  headers:{Authorization:'Bearer '+newTokenA}
 });
 assert.equal(baselineResponse.status,404,'rollback removes the career route');
 await runtime.setOptions(options(candidatePath));
 assert.deepEqual(await newSession.reload(),saved,'restoring the candidate preserves account A');
 assert.deepEqual(await b.reload(),other,'restoring the candidate preserves account B');
 console.log('APD_CAREER_WORKERD_PASS: CORS, password login, new session, separate accounts, stale revision, Worker rollback and recovery');
 const diaryURL=workerOrigin+'/api/account/application-diary';
 const diaryRequest=(token,mutation)=>invoke(diaryURL,{
  method:mutation?'PUT':'GET',
  headers:{Origin:trustedOrigin,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
  body:mutation?JSON.stringify(mutation):undefined
 });
 const set={action:'set',key:'D_121',status:'postulada',revision:0};
 if(readFileSync(baselineSource,'utf8').includes('/account/application-diary')){
  diaryContractCalls=[];
  const anonymous=await diaryRequest(null);
  const read=await diaryRequest(tokenA);
  const before=await read.json().catch(()=>({}));
  const write=await diaryRequest(tokenA,set);
  const after=await write.json().catch(()=>({}));
  console.log('APD_DEPLOYED_DIARY_FIXTURE_CONTRACT '+JSON.stringify({
   anonymous:anonymous.status,read:read.status,write:write.status,
   readKeys:Object.keys(before?.diary||{}).sort(),
   writeKeys:Object.keys(after?.diary||{}).sort(),
   cors:read.headers.get('Access-Control-Allow-Origin')===trustedOrigin,
   calls:diaryContractCalls
  }));
  diaryContractCalls=null;
  assert.equal(write.status,200,'The deployed diary must accept the fixture write');
  {
   const browserFetch=(url,init)=>invoke(url,{...init,headers:{...init.headers,Origin:trustedOrigin}});
   const diaryFor=token=>createApplicationDiaryClient({base:workerOrigin,getToken:()=>token,fetcher:browserFetch});
   const restored=await diaryFor(newTokenA).reload();
   assert.equal(restored.entries.find(entry=>entry.key===set.key)?.status,set.status);
   assert.deepEqual((await diaryFor(tokenB).reload()).entries,[]);
   const unauthenticatedWrite=await diaryRequest(null,set);
   assert.equal(unauthenticatedWrite.status,401);
   const contest=await Promise.all([
    diaryRequest(tokenA,{...set,status:'en_evaluacion',revision:restored.revision}),
    diaryRequest(newTokenA,{...set,status:'retirada',revision:restored.revision})
   ]);
   const statuses=contest.map(response=>response.status).sort();
   console.log('APD_DEPLOYED_DIARY_CONCURRENT_WRITE '+JSON.stringify(statuses));
   assert.deepEqual(statuses,[200,409],'The active route must reject a stale concurrent write');
   const winner=(await contest.find(response=>response.ok).json()).diary;
   const current=await diaryFor(newTokenA).reload();
   assert.deepEqual(current,winner);
   const removed=await diaryFor(newTokenA).mutate({action:'remove',key:set.key,revision:current.revision});
   assert.deepEqual(removed.entries,[]);
   console.log('APD_DEPLOYED_DIARY_BROWSER_CLIENT_PASS_WITH_FIXTURE');
   await verifyHostedDiary({base:workerOrigin,tokens:[tokenA,newTokenA,tokenB],fetcher:invoke});
   console.log('APD_DIARY_HOSTED_CHECKS_PASS_WITH_FIXTURE');

  }
  // Reset any fixture data before exercising the packaged candidate.
  execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','5432','-U','postgres','-d','apd_career_http','-c','TRUNCATE public.user_application_diary'],{stdio:'inherit'});
  execFileSync(process.execPath,['scripts/build-apd-career-worker-candidate.mjs'],{
   env:{...process.env,APD_CAREER_LIVE_SOURCE:''},stdio:'inherit'
  });
  await runtime.setOptions(options(candidatePath));
  console.log('APD_DIARY_PACKAGED_BASELINE_TEST');
 }
 async function diaryResult(response,status=200){
  assert.equal(response.status,status);
  return response.json();
 }
 assert.equal((await diaryRequest(null)).status,401);
 assert.deepEqual((await diaryResult(await diaryRequest(tokenA))).diary,{entries:[],revision:0});
 const race=await Promise.all([diaryRequest(tokenA,set),diaryRequest(tokenA,{...set,status:'retirada'})]);
 const raceStatuses=race.map(response=>response.status).sort();
 if(raceStatuses.includes(503)){
  const diagnostics=await Promise.all(race.filter(response=>response.status===503).map(response=>response.clone().text()));
  console.error('Fixture diary responses:',diagnostics);
 }
 assert.deepEqual(raceStatuses,[200,409]);
 const {diary:storedDiary}=await diaryResult(race.find(response=>response.status===200));
 assert.equal(storedDiary.revision,1);
 assert.equal(storedDiary.entries[0].origin,'self_reported');
 assert.deepEqual((await diaryResult(await diaryRequest(tokenB))).diary,{entries:[],revision:0});
 assert.deepEqual((await diaryResult(await diaryRequest(newTokenA))).diary,storedDiary);
 assert.equal((await diaryRequest(tokenB,{...set,user_id:'11111111-1111-4111-8111-111111111111'})).status,400);
 const {diary:removed}=await diaryResult(await diaryRequest(newTokenA,{action:'remove',key:'D_121',revision:1}));
 assert.deepEqual(removed,{entries:[],revision:2});
 console.log('APD_DIARY_WORKERD_PASS: stored, recovered, isolated, stale write rejected, record removed');
}finally{
 await runtime.dispose();
}
