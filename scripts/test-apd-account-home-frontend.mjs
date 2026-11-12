import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const script=fs.readFileSync('account_home_reference_patch.js','utf8');
const make=()=>{
 let token='session-a';
 const rows=new Map([
  ['session-a',{address_text:'Calle Ficticia 123',georef:null}],
  ['session-b',{address_text:'Calle Ficticia 456',georef:null}]
 ]);
 const calls=[];
 const events=[];
 const window={
  API_URL:'https://worker.example.invalid',
  obtenerAuthBearer:()=>token,
  addEventListener:()=>{},
  dispatchEvent:event=>events.push(event.type)
 };
 const document={
  readyState:'loading',
  addEventListener:()=>{},
  getElementById:()=>null
 };
 const fetch=async(url,opts)=>{
  assert.equal(url,'https://worker.example.invalid/api/account/home');
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.cache,'no-store');
  const bearer=String(opts.headers.Authorization||'').replace(/^Bearer /,'');
  calls.push({method:opts.method,bearer});
  if(opts.method==='GET')return {ok:true,status:200,json:async()=>({ok:true,home:rows.get(bearer)||null})};
  if(opts.method==='PUT'){
   const row=JSON.parse(opts.body);
   rows.set(bearer,row);
   return {ok:true,status:200,json:async()=>({ok:true,home:row})};
  }
  if(opts.method==='DELETE'){
   rows.delete(bearer);
   return {ok:true,status:200,json:async()=>({ok:true,home:null})};
  }
  throw Error('Unexpected HTTP method');
 };
 vm.runInNewContext(script,{window,document,fetch,Event});
 return {bridge:window.APD_accountHome,rows,calls,events,setToken:v=>{token=v}};
};
test('account home loads again after a new login without re-entering address',async()=>{
 const harness=make(),{bridge,calls,setToken}=harness;
 assert.equal(bridge.ready(),false);
 await bridge.reload();
 assert.equal(bridge.ready(),true);
 assert.equal(bridge.peek().address_text,'Calle Ficticia 123');
 setToken('session-b');
 assert.equal(bridge.ready(),false,'new account must invalidate old home immediately');
 assert.equal(bridge.peek(),null);
 await bridge.reload();
 assert.equal(bridge.peek().address_text,'Calle Ficticia 456');
 assert.deepEqual(calls.map(x=>[x.method,x.bearer]),[['GET','session-a'],['GET','session-b']]);
});
test('save, reload, delete remain restricted to the current authenticated user',async()=>{
 const {bridge,rows,setToken}=make();
 await bridge.reload();
 const edited={address_text:'Calle Ficticia 789',georef:null};
 await bridge.persist(edited);
 assert.equal(rows.get('session-a').address_text,edited.address_text);
 setToken('session-b');
 assert.equal(bridge.peek(),null);
 await bridge.reload();
 assert.equal(bridge.peek().address_text,'Calle Ficticia 456');
 await bridge.erase();
 assert.equal(rows.has('session-b'),false);
 assert.equal(bridge.peek(),null);
 assert.equal(rows.get('session-a').address_text,edited.address_text);
});
test('bridge does not perform any automatic network request before session check',()=>{
 const {bridge,calls,setToken}=make();
 assert.equal(calls.length,0);
 setToken('');
 assert.equal(bridge.ready(),false);
 assert.equal(bridge.peek(),null);
 assert.equal(calls.length,0);
});
