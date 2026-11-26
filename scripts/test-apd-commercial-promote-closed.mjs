import test from 'node:test';
import assert from 'node:assert/strict';
import {promoteClosed,validateDbUrl,verifyDbGuardResult} from './apd-commercial-promote-closed.mjs';
import {OLD,NEXT} from './apd-commercial-release-contracts.mjs';
function fixture({initial=OLD,failAfter=false,lost=false,unsafe=false,drift=false}={}){
 let current=initial,checks=0;const posts=[],logs=[];
 const opt={active:async()=>current,checkDb:async()=>{if(unsafe)throw Error('gate open');},verifyVersions:async()=>{if(drift)throw Error('source drift');},checkCrons:async()=>{},checkHttp:async()=>{checks++;if(failAfter&&current===NEXT)throw Error('bad route');},post:async v=>{posts.push(v);current=v;if(lost&&v===NEXT)throw Error('response lost');},log:x=>logs.push(x)};
 return {opt,posts,logs,current:()=>current};
}
test('promote exact version, recheck and idempotent replay',async()=>{const f=fixture();await promoteClosed(f.opt);assert.deepEqual(f.posts,[NEXT]);assert.equal(f.current(),NEXT);await promoteClosed(f.opt);assert.deepEqual(f.posts,[NEXT]);});
test('post-deployment failure rolls back verified original',async()=>{const f=fixture({failAfter:true});await assert.rejects(promoteClosed(f.opt),/bad route/);assert.deepEqual(f.posts,[NEXT,OLD]);assert.equal(f.current(),OLD);assert.ok(f.logs.includes('APD_COMMERCIAL_ROLLBACK_VERIFIED'));});
test('lost response still reconciles remote state and reverts',async()=>{const f=fixture({lost:true});await assert.rejects(promoteClosed(f.opt),/response lost/);assert.deepEqual(f.posts,[NEXT,OLD]);});
test('unsafe gate, fingerprint drift, unexpected live version cause zero posts',async()=>{for(const f of [fixture({unsafe:true}),fixture({drift:true}),fixture({initial:'unknown'})]){await assert.rejects(promoteClosed(f.opt));assert.deepEqual(f.posts,[]);}});
test('rollback forbidden if obligations arise',async()=>{const f=fixture({failAfter:true});let n=0;f.opt.checkDb=async()=>{if(++n>=4)throw Error('new obligations');};await assert.rejects(promoteClosed(f.opt),/new obligations/);assert.deepEqual(f.posts,[NEXT]);});
test('only project scoped DB connection',()=>{validateDbUrl('postgresql://postgres.vvgkinkvojqwfuqaxijh:fake@aws-1-us-east-1.pooler.supabase.com:5432/postgres');for(const u of ['postgresql://postgres:fake@evil.invalid:5432/postgres','postgresql://postgres.other:fake@aws-1-us-east-1.pooler.supabase.com:5432/postgres'])assert.throws(()=>validateDbUrl(u));});

test('DB guard accepts only exact closed output, logs fixed diagnostic without credentials',()=>{verifyDbGuardResult({status:0,stdout:'APD_GATE_CLOSED\n'});for(const r of [{status:0,stdout:'APD_GATE_UNSAFE'},{status:0,stdout:''},{status:2,stderr:'psql: FATAL: 28P01 secret-uri-private'},{status:null,error:{code:'ETIMEDOUT'}}])assert.throws(()=>verifyDbGuardResult(r),e=>!e.message.includes('secret-uri-private'));});
