import test from 'node:test';
import assert from 'node:assert/strict';
import {createFavoriteClient} from './apd-account-favorites-client.mjs';
const res=(favorites,status=200)=>new Response(JSON.stringify({ok:status===200,favorites}),{status});
test('explicit reload then mutation, readback and no owner metadata',async()=>{
 let value={keys:[],revision:0};const calls=[];
 const c=createFavoriteClient({base:'https://fixture.invalid',getToken:()=>'A',fetcher:async(u,o)=>{calls.push(o);if(o.method==='PUT'){assert.deepEqual(JSON.parse(o.body),{action:'add',key:'D_1',revision:0});value={keys:['D_1'],revision:1};}return res(value);}});
 assert.equal(c.peek(),null);assert.equal(calls.length,0);await assert.rejects(c.mutate('add','D_1'));
 await c.reload();assert.deepEqual(await c.mutate('add','D_1'),value);assert.deepEqual(calls.map(o=>o.method),['GET','PUT','GET']);assert.ok(calls.every(o=>o.redirect==='error'&&o.cache==='no-store'));
});
test('conflict and ambiguous network error invalidate revision and do not retry',async()=>{
 for(const fail of [()=>res(null,409),()=>{throw Error('network');}]){
  let calls=0;const c=createFavoriteClient({base:'https://fixture.invalid',getToken:()=>'A',fetcher:async(u,o)=>{calls++;return o.method==='PUT'?fail():res({keys:[],revision:0});}});
  await c.reload();await assert.rejects(c.mutate('add','D_1'));assert.equal(c.peek(),null);
  await assert.rejects(c.mutate('add','D_1'));assert.equal(calls,2);
 }
});
test('switch accounts while old response pending cannot leak favorites',async()=>{
 let token='A',release;const c=createFavoriteClient({base:'https://fixture.invalid',getToken:()=>token,fetcher:async(u,o)=>o.headers.Authorization==='Bearer A'?new Promise(r=>release=r):res({keys:['D_B'],revision:1})});
 const pending=c.reload();token='B';assert.deepEqual(await c.reload(),{keys:['D_B'],revision:1});
 release(res({keys:['D_A'],revision:1}));await assert.rejects(pending,/sesión cambió/);assert.deepEqual(c.peek(),{keys:['D_B'],revision:1});
});
test('explicit logout reset invalidates response even if same bearer later',async()=>{
 let release;const c=createFavoriteClient({base:'https://fixture.invalid',getToken:()=>'A',fetcher:async()=>new Promise(r=>release=r)});
 const pending=c.reload();c.reset();release(res({keys:['D_A'],revision:1}));await assert.rejects(pending,/sesión cambió/);assert.equal(c.peek(),null);
});
test('post-mutation readback mismatch does not display saved state',async()=>{
 let calls=0;const c=createFavoriteClient({base:'https://fixture.invalid',getToken:()=>'A',fetcher:async()=>{calls++;return res(calls===1?{keys:[],revision:0}:calls===2?{keys:['D_1'],revision:1}:{keys:['D_2'],revision:2});}});
 await c.reload();await assert.rejects(c.mutate('add','D_1'),/cambiaron/);assert.equal(c.peek(),null);assert.equal(calls,3);
});
