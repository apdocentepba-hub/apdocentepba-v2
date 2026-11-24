/** Execute the complete captured Worker router and auth against synthetic PostgREST.
 * All outbound fetch is intercepted; no actual customer credentials or records.
 */
import assert from 'node:assert/strict';
import {createScheduleClient} from './apd-account-schedule-client.mjs';
const {default:worker}=await import('../tmp/apd-account-schedule/worker-schedule-candidate.mjs');
const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-only'};
const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002',c:'00000000-0000-4000-8000-000000000003'};
const rows=new Map(),calls=[];
const expiry=new Date(Date.now()+86400000).toISOString();
const revoked=new Date(Date.now()-86400000).toISOString();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const filter=(url,name)=>url.searchParams.get(name)?.replace(/^eq\./,'');
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const req=new Request(input,init),url=new URL(req.url);
 assert.equal(url.origin,'https://fixture.invalid','Unexpected outbound host');
 assert.equal(req.headers.get('Authorization'),'Bearer fixture-server-only');
 const table=url.pathname.split('/').at(-1);
 calls.push({table,method:req.method});
 if(table==='sessions'){
  const token=filter(url,'token'),id=ids[token]||((token==='expired')?ids.a:null);
  return json(id?[{token,user_id:id,activo:true,expires_at:token==='expired'?revoked:expiry}]:[]);
 }
 if(table==='users'){const id=filter(url,'id');return json(Object.values(ids).includes(id)?[{id,activo:true,es_admin:false}]:[]);}
 if(table==='subscription_plans')return json([]);
 if(table==='user_subscriptions'){
  const user_id=filter(url,'user_id');
  return json([{id:'fixture-sub',user_id,plan_code:user_id===ids.c?'PLUS':'INSIGNE',status:'active',source:'mercadopago_checkout',started_at:new Date().toISOString(),current_period_ends_at:expiry}]);
 }
 assert.equal(table,'user_module_schedule');
 if(req.method==='GET'){const row=rows.get(filter(url,'user_id'));return json(row?[row]:[]);}
 const body=await req.json();
 if(req.method==='POST'){
  assert.ok(Object.values(ids).includes(body.user_id));if(rows.has(body.user_id))return json({code:'23505'},409);
  const row={modules:body.modules,revision:body.revision};rows.set(body.user_id,row);return json([row],201);
 }
 assert.equal(req.method,'PATCH');const id=filter(url,'user_id'),old=rows.get(id);
 assert.ok(!Object.hasOwn(body,'user_id'));
 if(!old||old.revision!==Number(filter(url,'revision')))return json([]);
 const row={modules:body.modules,revision:body.revision};rows.set(id,row);return json([row]);
};
const base='https://worker.fixture.invalid';
const run=(token,method='GET',body,query='')=>worker.fetch(new Request(base+'/api/account/schedule'+query,{
 method,headers:{Origin:'https://alertasapd.com.ar',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})
}),env,{waitUntil(){throw Error('Unexpected scheduled work');}});
const client=token=>createScheduleClient({getToken:()=>token,base,fetcher:(url,init)=>worker.fetch(new Request(url,{...init,headers:{...init.headers,Origin:'https://alertasapd.com.ar'}}),env,{waitUntil(){throw Error('Unexpected scheduled work');}})});
try{
 assert.equal((await run(null)).status,401);
 assert.equal((await run('expired')).status,401);
 assert.equal((await run('unknown')).status,401);
 assert.equal((await run('c','PUT',{modules:['M1-1'],revision:0})).status,403);
 assert.equal((await run('a','PUT',{user_id:ids.b,modules:['M1-1'],revision:0})).status,400);
 const a=client('a'),b=client('b'),a2=client('a');
 assert.deepEqual(await a.reload(),{modules:[],revision:0});
 assert.deepEqual(await b.reload(),{modules:[],revision:0});
 await a2.reload();
 assert.deepEqual(await a.persist(['M1-1']),{modules:['M1-1'],revision:1});
 await assert.rejects(()=>a2.persist(['T1-2']),/otro dispositivo/);
 assert.deepEqual(await b.persist(['T0-2']),{modules:['T0-2'],revision:1});
 const forged=await run('a','GET',undefined,'?user_id='+ids.b);
 assert.equal(forged.status,200);
 assert.equal(forged.headers.get('access-control-allow-origin'),'https://alertasapd.com.ar');
 assert.deepEqual((await forged.json()).schedule,{modules:['M1-1'],revision:1});
 assert.deepEqual(await a.reload(),{modules:['M1-1'],revision:1});
 assert.deepEqual(await a.persist([]),{modules:[],revision:2});
 assert.deepEqual(await b.reload(),{modules:['T0-2'],revision:1});
 assert.equal(rows.size,2);
 assert.ok(calls.some(v=>v.table==='sessions'));
 console.log('APD_SCHEDULE_FULL_WORKER_PASS two authenticated synthetic accounts, expired and invalid sessions, plan gate, ownership, CAS, clear, reload; mocked PostgREST; no network');
}finally{globalThis.fetch=nativeFetch;}
