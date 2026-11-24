import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createCareerClient} from './apd-career-account-client.mjs';

const {default: candidate}=await import('../tmp/apd-career/worker-career-candidate.mjs');
const baselinePath=new URL('../tmp/apd-career/worker-career-baseline.mjs',import.meta.url);
writeFileSync(baselinePath,readFileSync(new URL('../worker-live/worker_hotfix.js',import.meta.url)));
const {default: baseline}=await import(baselinePath);
const env={SUPABASE_URL:'https://career-db.invalid',SUPABASE_SERVICE_ROLE_KEY:'disposable-service-role'};
const workerOrigin='https://career-worker.invalid';
const nativeFetch=globalThis.fetch;

globalThis.fetch=async (input,init)=>{
 const request=new Request(input,init);
 const url=new URL(request.url);
 // Never forward credentials or fixture data outside the disposable container.
 assert.equal(url.origin,env.SUPABASE_URL);
 assert.ok(url.pathname.startsWith('/rest/v1/'));
 assert.equal(request.headers.get('Authorization'),'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
 const local=new URL(url.pathname.slice('/rest/v1'.length)+url.search,'http://127.0.0.1:3301');
 const headers=new Headers(request.headers);
 headers.delete('Authorization');
 headers.delete('apikey');
 return nativeFetch(local,{method:request.method,headers,redirect:'error',
  ...(request.body?{body:await request.arrayBuffer()}:{}),signal:request.signal});
};

const invoke=(worker,url,init)=>worker.fetch(new Request(url,init),env,{
 waitUntil(){throw Error('Unexpected background operation');}
});
async function login(account){
 const response=await invoke(candidate,workerOrigin+'/api/login',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:'career-'+account+'@example.invalid',password:'career-fixture-'+account})
 });
 assert.equal(response.status,200,'password login');
 const session=await response.json();
 assert.equal(session.ok,true);
 assert.match(session.session_token,/^[0-9a-f]{64}$/);
 return session.session_token;
}
const client=(token,worker=candidate)=>createCareerClient({
 base:workerOrigin,getToken:()=>token,fetcher:(url,opts)=>invoke(worker,url,opts)
});
const vacancy={profile:null,revision:0};
const profile={schema:1,seniorityYears:10,positions:[{
 id:'one',schoolKey:'0005DC0709',school:'Escuela de ensayo',role:'Matemática',
 level:'Secundaria',kind:'modulo',status:'titular',quantity:2,
 modules:['T1-1'],blocks:[{day:1,start:'14:00',end:'16:00'}]
}]};
try{
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
 const baselineResponse=await invoke(baseline,workerOrigin+'/api/account/career',{
  headers:{Authorization:'Bearer '+newTokenA}
 });
 assert.equal(baselineResponse.status,404,'rollback removes the career route');
 assert.deepEqual(await newSession.reload(),saved,'restoring the candidate preserves account A');
 assert.deepEqual(await b.reload(),other,'restoring the candidate preserves account B');
 console.log('APD_CAREER_HTTP_PASS: password login, new session, separate accounts, stale revision, Worker rollback and recovery');
}finally{
 globalThis.fetch=nativeFetch;
}
