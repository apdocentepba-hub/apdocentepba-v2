import test from 'node:test';
import assert from 'node:assert/strict';
import {createFavoriteStorage} from './apd-account-favorites-storage.mjs';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const response=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
function setup(handler){const calls=[];const storage=createFavoriteStorage({base:'https://fixture.invalid',serviceKey:'fixture-only',fetcher:async(url,opts)=>{calls.push({url:new URL(url),opts});return handler(calls.at(-1));}});return {calls,storage};}
test('read scoped to owner and fails closed on foreign rows',async()=>{
 const f=setup(()=>response([{user_id:B,keys:['D_1'],revision:1}]));
 await assert.rejects(f.storage.read(A),/Owner mismatch/);
 assert.equal(f.calls[0].url.searchParams.get('user_id'),'eq.'+A);
 await assert.rejects(f.storage.read(A+',or=(x)'),/Invalid owner/);assert.equal(f.calls.length,1);
});
test('first write POST never upserts; duplicate conflict only 23505',async()=>{
 const f=setup(()=>response({code:'23505'},409));assert.equal(await f.storage.compareAndSet(A,{keys:['D_1'],revision:0}),null);
 const c=f.calls[0];assert.equal(c.opts.method,'POST');assert.equal(c.opts.headers.Prefer,'return=representation');assert.equal(c.opts.redirect,'manual');assert.equal(JSON.parse(c.opts.body).user_id,A);
 const g=setup(()=>response({code:'23503'},409));await assert.rejects(g.storage.compareAndSet(A,{keys:['D_1'],revision:0}));
});
test('patch requires both owner and old revision, no owner in body',async()=>{
 const f=setup(()=>response([{user_id:A,keys:[],revision:2}]));
 assert.deepEqual(await f.storage.compareAndSet(A,{keys:[],revision:1}),{keys:[],revision:2});
 const c=f.calls[0];assert.equal(c.opts.method,'PATCH');assert.equal(c.url.searchParams.get('user_id'),'eq.'+A);assert.equal(c.url.searchParams.get('revision'),'eq.1');assert.equal('user_id' in JSON.parse(c.opts.body),false);
});
test('zero-row stale update is conflict and wrong acknowledgment fails',async()=>{
 const f=setup(()=>response([]));assert.equal(await f.storage.compareAndSet(A,{keys:[],revision:1}),null);
 await assert.rejects(f.storage.compareAndSet(A,{keys:['D_1'],revision:0}),/Insert not confirmed/);
 const g=setup(()=>response([{user_id:A,keys:['D_wrong'],revision:2}]));await assert.rejects(g.storage.compareAndSet(A,{keys:[],revision:1}),/Write mismatch/);
});
test('network failure never retries and unsafe revision never sends request',async()=>{
 const f=setup(()=>{throw Error('network');});
 await assert.rejects(f.storage.compareAndSet(A,{keys:['D_1'],revision:0}));assert.equal(f.calls.length,1);
 await assert.rejects(f.storage.compareAndSet(A,{keys:[],revision:Number.MAX_SAFE_INTEGER}));assert.equal(f.calls.length,1);
});

test('Cloudflare-compatible manual redirect rejects all 3xx without following or retrying',async()=>{
 const f=setup(()=>new Response(null,{status:302,headers:{Location:'https://foreign.invalid'}}));
 await assert.rejects(f.storage.read(A),/Storage error/);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].opts.redirect,'manual');
 await assert.rejects(f.storage.compareAndSet(A,{keys:['D_1'],revision:0}),/Storage error/);
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].opts.redirect,'manual');
});
