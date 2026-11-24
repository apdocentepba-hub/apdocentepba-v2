import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
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
 const response=await fetch(local,{method:request.method,headers,redirect:'error',
  ...(request.body?{body:await request.arrayBuffer()}:{}),signal:request.signal});
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
 if(readFileSync(baselineSource,'utf8').includes('/account/application-diary')){
  // Test the new persistence route against the packaged baseline only.
  // The independently deployed route retains precedence in the active baseline.
  execFileSync(process.execPath,['scripts/build-apd-career-worker-candidate.mjs'],{
   env:{...process.env,APD_CAREER_LIVE_SOURCE:''},stdio:'inherit'
  });
  await runtime.setOptions(options(candidatePath));
  console.log('APD_DIARY_PACKAGED_BASELINE_TEST');
 }
 const diaryURL=workerOrigin+'/api/account/application-diary';
 const diaryRequest=(token,mutation)=>invoke(diaryURL,{
  method:mutation?'PUT':'GET',
  headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
  body:mutation?JSON.stringify(mutation):undefined
 });
 async function diaryResult(response,status=200){
  assert.equal(response.status,status);
  return response.json();
 }
 assert.equal((await diaryRequest(null)).status,401);
 assert.deepEqual((await diaryResult(await diaryRequest(tokenA))).diary,{entries:[],revision:0});
 const set={action:'set',key:'D_121',status:'postulada',revision:0};
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
