import assert from 'node:assert/strict';
const {default:worker}=await import('../tmp/apd-account-diary/worker-diary-candidate.mjs');
const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-only'};
const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002',c:'00000000-0000-4000-8000-000000000003'};
const rows=new Map(),calls=[];
const expiry=new Date(Date.now()+86400000).toISOString(),revoked=new Date(Date.now()-86400000).toISOString();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const filter=(u,n)=>u.searchParams.get(n)?.replace(/^eq\./,'');
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const req=new Request(input,init),u=new URL(req.url);
 assert.equal(u.origin,'https://fixture.invalid');assert.equal(req.headers.get('Authorization'),'Bearer fixture-server-only');
 const table=u.pathname.split('/').at(-1);calls.push(table);
 if(table==='sessions'){const token=filter(u,'token'),id=ids[token]||(token==='expired'?ids.a:null);return json(id?[{token,user_id:id,activo:true,expires_at:token==='expired'?revoked:expiry}]:[]);}
 if(table==='users'){const id=filter(u,'id');return json(Object.values(ids).includes(id)?[{id,activo:true,es_admin:false}]:[]);}
 if(table==='subscription_plans')return json([]);
 if(table==='user_subscriptions'){const id=filter(u,'user_id');return json([{id:'fixture-sub',user_id:id,plan_code:id===ids.c?'PLUS':'INSIGNE',status:'active',source:'mercadopago_checkout',started_at:new Date().toISOString(),current_period_ends_at:expiry}]);}
 if(table==='apd_ofertas_global_current'){const key=filter(u,'source_offer_key');return json(key==='D_missing'?[]:key==='D_duplicate'?[{source_offer_key:key},{source_offer_key:key}]:[{source_offer_key:key}]);}
 assert.equal(table,'user_application_diary');assert.equal(req.redirect,'manual');
 if(req.method==='GET'){const row=rows.get(filter(u,'user_id'));return json(row?[row]:[]);}
 const body=await req.json();
 if(req.method==='POST'){if(rows.has(body.user_id))return json({code:'23505'},409);const row={user_id:body.user_id,entries:body.entries,revision:body.revision};rows.set(body.user_id,row);return json([row],201);}
 assert.equal(req.method,'PATCH');const id=filter(u,'user_id'),old=rows.get(id);assert.ok(!Object.hasOwn(body,'user_id'));if(!old||old.revision!==Number(filter(u,'revision')))return json([]);const row={user_id:id,entries:body.entries,revision:body.revision};rows.set(id,row);return json([row]);
};
const run=(t,method='GET',body,query='',origin='https://alertasapd.com.ar')=>worker.fetch(new Request('https://worker.fixture.invalid/api/account/application-diary'+query,{method,headers:{Origin:origin,...(t?{Authorization:'Bearer '+t}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){throw Error('Unexpected scheduled work');}});
const put=(t,key,revision,status='postulada')=>run(t,'PUT',{action:'set',key,revision,status});
const value=async r=>(await r.json()).diary;
try{
 assert.equal((await run(null,'OPTIONS')).status,204);
 assert.equal((await run(null,'OPTIONS',undefined,'','https://other.invalid')).headers.get('access-control-allow-origin'),null);
 assert.equal(calls.length,0);
 for(const t of [null,'expired','unknown'])assert.equal((await run(t)).status,401);
 assert.equal((await put('c','D_1',0)).status,403);
 assert.equal((await run('a','PUT',{action:'set',key:'D_1',status:'postulada',revision:0,user_id:ids.b})).status,400);
 assert.equal((await run('a','PUT',{action:'set',key:'x'.repeat(2000),status:'postulada',revision:0})).status,413);
 assert.equal((await put('a','D_missing',0)).status,422);
 assert.equal((await put('a','D_duplicate',0)).status,503);
 assert.deepEqual(await value(await run('a')),{entries:[],revision:0});
 const race=await Promise.all([put('a','D_1',0),put('a','D_2',0)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
 const saved=await value(race.find(r=>r.status===200));assert.equal(saved.entries[0].origin,'self_reported');assert.equal(saved.revision,1);
 assert.deepEqual(await value(await run('b')),{entries:[],revision:0});
 assert.equal((await put('b','D_3',0,'adjudicada')).status,200);
 const forged=await run('a','GET',undefined,'?user_id='+ids.b);assert.equal(forged.headers.get('cache-control'),'private, no-store');assert.deepEqual(await value(forged),saved);
 assert.equal((await put('a',saved.entries[0].key,1,'retirada')).status,200);
 assert.equal((await run('a','PUT',{action:'remove',key:saved.entries[0].key,revision:2})).status,200);
 assert.deepEqual(await value(await run('a')),{entries:[],revision:3});
 assert.equal((await value(await run('b'))).entries[0].status,'adjudicada');
 console.log('APD_DIARY_FULL_WORKER_PASS synthetic auth, isolation, entitlement, CORS, bounded payload, identity, CAS and removal; mocked PostgREST');
}finally{globalThis.fetch=nativeFetch;}
