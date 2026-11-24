import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiaryClient} from './apd-account-diary-client.mjs';
import {updateApplicationDiary} from './apd-application-diary.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
function fixture(){
 let token='a',hold=null;const rows=new Map(),calls=[];
 const client=createDiaryClient({base:'https://fixture.invalid',getToken:()=>token,fetcher:async(url,opts)=>{
  const owner=opts.headers.Authorization.slice(7);calls.push({url,opts,owner});
  const before=rows.get(owner)||{entries:[],revision:0};
  if(hold){const wait=hold;hold=null;await wait;}
  if(opts.method==='GET')return json({ok:true,diary:before});
  const r=updateApplicationDiary(before,JSON.parse(opts.body),new Date('2026-11-24T15:00:00Z'));
  if(!r.ok)return json({ok:false},409);rows.set(owner,r.record);return json({ok:true,diary:r.record});
 }});
 return {client,rows,calls,setToken:t=>token=t,hold:p=>hold=p};
}
test('explicit load, save and readback, no optimistic data, cloned results',async()=>{
 const f=fixture(),c=f.client;assert.equal(c.peek(),null);assert.equal(f.calls.length,0);
 await assert.rejects(c.mutate('set','D_1','postulada'),/Cargá/);
 await c.reload();const result=await c.mutate('set','D_1','postulada');
 assert.equal(result.revision,1);assert.equal(result.entries[0].origin,'self_reported');
 assert.deepEqual(f.calls.map(x=>x.opts.method),['GET','PUT','GET']);
 assert.equal(f.calls[1].opts.credentials,'omit');
 result.entries[0].status='retirada';assert.equal(c.peek().entries[0].status,'postulada');
 await c.mutate('remove','D_1');assert.deepEqual(c.peek(),{entries:[],revision:2});
});
test('late response cannot cross accounts; explicit reset also invalidates',async()=>{
 const f=fixture(),c=f.client;let release;f.hold(new Promise(r=>release=r));const pending=c.reload();
 f.setToken('b');assert.equal(c.peek(),null);await c.reload();release();await assert.rejects(pending,/sesión cambió/);assert.equal(c.peek().revision,0);
 let end;f.hold(new Promise(r=>end=r));const p=c.reload();c.reset();end();await assert.rejects(p,/sesión cambió/);assert.equal(c.peek(),null);
});
test('stale mutation invalidates cached row, does not retry',async()=>{
 const f=fixture(),c=f.client;await c.reload();f.rows.set('a',{entries:[],revision:1});
 await assert.rejects(c.mutate('set','D_1','postulada'),/cambió/);assert.equal(c.peek(),null);assert.equal(f.calls.length,2);
});
test('bad response or failed readback cannot become confirmed state',async()=>{
 let call=0;const c=createDiaryClient({base:'https://fixture.invalid',getToken:()=> 'a',fetcher:async()=>{call++;return call===1?json({ok:true,diary:{revision:0,entries:[]}}):json({ok:true,diary:{revision:1,entries:[]}});}});
 await c.reload();await assert.rejects(c.mutate('set','D_1','postulada'),/Guardado no confirmado/);assert.equal(c.peek(),null);
});
