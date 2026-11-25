import assert from 'node:assert/strict';
import {wrapDiaryQA} from './apd-diary-qa-worker-guard.mjs';
const current=1800000000000,key='a'.repeat(64),db='b'.repeat(64);
const env={APD_QA_START_MS:String(current-1000),APD_QA_EXPIRES_MS:String(current+60000),
 APD_QA_ACCESS_KEY:key,APD_QA_DB_KEY:db,APD_QA_DB_URL:'https://synthetic-qa.trycloudflare.com',
 SUPABASE_URL:'https://production.invalid',SUPABASE_SERVICE_ROLE_KEY:'production-secret',CRON:'production'};
const calls=[];
const guarded=wrapDiaryQA({async fetch(req,bindings,ctx){
 calls.push({path:new URL(req.url).pathname,method:req.method});
 assert.deepEqual(bindings,{SUPABASE_URL:env.APD_QA_DB_URL,SUPABASE_SERVICE_ROLE_KEY:db});
 assert.equal(req.headers.get('X-APD-QA-Key'),null);
 assert.throws(()=>ctx.waitUntil(Promise.resolve()));
 return new Response('fixture',{status:200});
}},{now:()=>current});
const path='/api/account/application-diary';
const req=(p=path,method='GET',secret=key)=>new Request('https://fixture.invalid'+p,{method,headers:secret?{'X-APD-QA-Key':secret}:{}});
const denied=await guarded.fetch(req(path,'GET',''),env);
assert.equal(denied.status,404);
assert.equal(denied.headers.get('X-APD-QA-Stage'),'guard');
assert.equal((await guarded.fetch(req(),{...env,APD_QA_DB_KEY:key})).headers.get('X-APD-QA-Stage'),'configuration');
assert.equal((await guarded.fetch(req('/api/login','POST'),env)).status,404);
assert.equal((await guarded.fetch(req(path+'?x=1'),env)).status,404);
assert.equal((await guarded.fetch(req(path,'DELETE'),env)).status,404);
for(const change of [
 {APD_QA_EXPIRES_MS:String(current)},
 {APD_QA_EXPIRES_MS:String(current+3600000)},
 {APD_QA_START_MS:String(current+1)},
 {APD_QA_DB_KEY:key},
 {APD_QA_DB_URL:'https://production.supabase.co'},
 {APD_QA_DB_URL:'https://example.trycloudflare.com.evil.invalid'}
]) assert.equal((await guarded.fetch(req(),{...env,...change})).status,503);
assert.equal(calls.length,0);
for(const method of ['GET','PUT','OPTIONS']){
 const response=await guarded.fetch(req(path,method),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('X-APD-QA-Stage'),'application');
}
assert.equal(calls.length,3);
assert.equal(guarded.scheduled,undefined);
console.log('APD_DIARY_QA_WORKER_GUARD_PASS');
