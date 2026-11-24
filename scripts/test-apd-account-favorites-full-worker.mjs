import assert from 'node:assert/strict';
import {createFavoriteResolver} from './apd-account-favorites-resolver.mjs';
const {default:worker}=await import('../tmp/apd-account-favorites/worker-favorites-candidate.mjs');
const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-only'};
const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002',c:'00000000-0000-4000-8000-000000000003'};
const rows=new Map(),calls=[];
const expiry=new Date(Date.now()+86400000).toISOString(),revoked=new Date(Date.now()-86400000).toISOString();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const filter=(u,n)=>u.searchParams.get(n)?.replace(/^eq\./,'');
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const req=new Request(input,init),url=new URL(req.url);
 assert.equal(url.origin,'https://fixture.invalid');assert.equal(req.headers.get('Authorization'),'Bearer fixture-server-only');
 const table=url.pathname.split('/').at(-1);calls.push({table,method:req.method});
 if(table==='sessions'){
  const token=filter(url,'token'),id=ids[token]||(token==='expired'?ids.a:null);
  return json(id?[{token,user_id:id,activo:true,expires_at:token==='expired'?revoked:expiry}]:[]);
 }
 if(table==='users'){const id=filter(url,'id');return json(Object.values(ids).includes(id)?[{id,activo:true,es_admin:false}]:[]);}
 if(table==='subscription_plans')return json([]);
 if(table==='user_subscriptions'){
  const user_id=filter(url,'user_id');
  return json([{id:'fixture-sub',user_id,plan_code:user_id===ids.c?'PLUS':'INSIGNE',status:'active',source:'mercadopago_checkout',started_at:new Date().toISOString(),current_period_ends_at:expiry}]);
 }
 if(table==='apd_ofertas_global_current'){
  const key=filter(url,'source_offer_key');
  assert.equal(url.searchParams.get('select'),'source_offer_key,estado,finoferta');
  if(key==='D_missing')return json([]);
  if(key==='D_duplicate')return json([{source_offer_key:key},{source_offer_key:key}]);
  return json([{source_offer_key:key,estado:key==='D_closed'?'FINALIZADA':'PUBLICADA',finoferta:key==='D_expired'?revoked:expiry}]);
 }
 assert.equal(table,'user_favorite_offers');
 if(req.method==='GET'){const row=rows.get(filter(url,'user_id'));return json(row?[row]:[]);}
 const body=await req.json();
 if(req.method==='POST'){
  assert.ok(Object.values(ids).includes(body.user_id));if(rows.has(body.user_id))return json({code:'23505'},409);
  const row={user_id:body.user_id,keys:body.keys,revision:body.revision};rows.set(body.user_id,row);return json([row],201);
 }
 assert.equal(req.method,'PATCH');const id=filter(url,'user_id'),old=rows.get(id);
 assert.ok(!Object.hasOwn(body,'user_id'));if(!old||old.revision!==Number(filter(url,'revision')))return json([]);
 const row={user_id:id,keys:body.keys,revision:body.revision};rows.set(id,row);return json([row]);
};
const run=(token,method='GET',body,query='',origin='https://alertasapd.com.ar')=>worker.fetch(new Request('https://worker.fixture.invalid/api/account/favorites'+query,{
 method,headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})
}),env,{waitUntil(){throw Error('Unexpected scheduled work');}});
const put=(t,action,key,revision)=>run(t,'PUT',{action,key,revision});
const value=async r=>(await r.json()).favorites;
try{
 const pre=await run(null,'OPTIONS');assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'https://alertasapd.com.ar');
 assert.equal((await run(null,'OPTIONS',undefined,'','https://other.invalid')).headers.get('access-control-allow-origin'),null);assert.equal(calls.length,0);
 for(const token of [null,'expired','unknown'])assert.equal((await run(token)).status,401);
 assert.equal((await put('c','add','D_1',0)).status,403);
 assert.equal((await run('a','PUT',{action:'add',key:'D_1',revision:0,user_id:ids.b})).status,400);
 for(const key of ['D_missing','D_closed','D_expired'])assert.equal((await put('a','add',key,0)).status,422);
 assert.equal((await put('a','add','D_duplicate',0)).status,503);
 assert.deepEqual(await value(await run('a')),{keys:[],revision:0});
 const results=await Promise.all([put('a','add','D_1',0),put('a','add','D_2',0)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const saved=await value(results.find(r=>r.status===200));
 assert.equal(saved.revision,1);assert.equal(saved.keys.length,1);
 assert.deepEqual(await value(await run('b')),{keys:[],revision:0});
 assert.equal((await put('b','add','D_3',0)).status,200);
 const forged=await run('a','GET',undefined,'?user_id='+ids.b);
 assert.equal(forged.headers.get('cache-control'),'private, no-store');assert.deepEqual(await value(forged),saved);
 assert.equal((await put('a','remove',saved.keys[0],1)).status,200);
 assert.deepEqual(await value(await run('b')),{keys:['D_3'],revision:1});
 rows.set(ids.c,{user_id:ids.c,keys:['D_3'],revision:1});
 assert.equal((await put('c','remove','D_3',1)).status,200);
 assert.equal((await run('a','GET',undefined,'','https://evil.invalid')).headers.get('access-control-allow-origin'),null);
 const resolver=createFavoriteResolver({select:async()=>[{source_offer_key:'D_1',estado:'PUBLICADA',finoferta:'2026-11-24T14:00:00Z'}],now:()=>Date.parse('2026-11-24T16:00:00Z')});
 assert.deepEqual(await resolver('D_1'),{key:'D_1',status:'unknown'});
 await assert.rejects(resolver('D_2'),/identity mismatch/);
 console.log('APD_FAVORITES_FULL_WORKER_PASS synthetic auth, entitlement, CORS, closed/missing/ambiguous identity, CAS, ownership; mocked PostgREST');
}finally{globalThis.fetch=nativeFetch;}
