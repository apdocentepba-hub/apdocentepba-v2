import assert from 'node:assert/strict';
const {default:worker}=await import('../tmp/apd-career/worker-career-candidate.mjs');
const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-only'};
const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002',c:'00000000-0000-4000-8000-000000000003'};
const rows=new Map(),calls=[];
const expiry=new Date(Date.now()+86400000).toISOString(),revoked=new Date(Date.now()-86400000).toISOString();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const filter=(u,n)=>u.searchParams.get(n)?.replace(/^eq\./,'');
const nativeFetch=globalThis.fetch;
let badOwner=false,failWrite=false;
globalThis.fetch=async(input,init)=>{
 const req=new Request(input,init),u=new URL(req.url);
 assert.equal(u.origin,'https://fixture.invalid');assert.equal(req.headers.get('Authorization'),'Bearer fixture-server-only');
 const table=u.pathname.split('/').at(-1);calls.push(table);
 if(table==='sessions'){const token=filter(u,'token'),id=ids[token]||(token==='expired'?ids.a:null);return json(id?[{token,user_id:id,activo:true,expires_at:token==='expired'?revoked:expiry}]:[]);}
 if(table==='users'){const id=filter(u,'id');return json(Object.values(ids).includes(id)?[{id,activo:true,es_admin:false}]:[]);}
 if(table==='subscription_plans')return json([]);
 if(table==='user_subscriptions'){const id=filter(u,'user_id');return json([{id:'fixture-sub',user_id:id,plan_code:id===ids.c?'PLUS':'INSIGNE',status:'active',source:'mercadopago_checkout',started_at:new Date().toISOString(),current_period_ends_at:expiry}]);}
 if(table==='user_career_profile'){
  assert.equal(req.method,'GET');assert.equal(req.redirect,'error');
  const id=filter(u,'user_id'),row=rows.get(id);assert.ok(Object.values(ids).includes(id));
  return json(row?[{user_id:badOwner?ids.b:id,...row}]:[]);
 }
 assert.equal(u.pathname,'/rest/v1/rpc/apd_career_profile_cas');assert.equal(req.method,'POST');assert.equal(req.redirect,'error');
 const body=await req.json();assert.deepEqual(Object.keys(body).sort(),['p_profile','p_revision','p_user']);
 if(failWrite)return json({error:'private backend detail'},500);
 if((rows.get(body.p_user)?.revision||0)!==body.p_revision)return json([]);
 const row={profile:body.p_profile,revision:body.p_revision+1};rows.set(body.p_user,row);return json([row]);
};
const profile={schema:1,seniorityYears:10,positions:[{id:'c1',schoolKey:'0005MS0004',school:'Escuela fixture',role:'Matemática',level:'Secundaria',kind:'modulo',status:'titular',quantity:2,modules:['T1-1'],blocks:[{day:1,start:'14:00',end:'16:00'}]}]};
const run=(t,method='GET',body,query='',origin='https://alertasapd.com.ar')=>worker.fetch(new Request('https://worker.fixture.invalid/api/account/career'+query,{method,headers:{Origin:origin,...(t?{Authorization:'Bearer '+t}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){throw Error('Unexpected scheduled work');}});
const put=(t,revision,p=profile)=>run(t,'PUT',{profile:p,revision});
const value=async r=>(await r.json()).career;
try{
 assert.equal((await run(null,'OPTIONS')).status,204);
 assert.equal((await run(null,'OPTIONS',undefined,'','https://other.invalid')).headers.get('access-control-allow-origin'),null);
 assert.equal(calls.length,0);
 for(const t of [null,'expired','unknown'])assert.equal((await run(t)).status,401);
 assert.equal((await put('c',0)).status,403);
 assert.equal((await run('a','PUT',{profile,revision:0,user_id:ids.b})).status,400);
 assert.equal((await put('a',0,{...profile,positions:[{...profile.positions[0],school:'x'.repeat(70000)}]})).status,413);
 assert.deepEqual(await value(await run('a')),{profile:null,revision:0});
 const race=await Promise.all([put('a',0),put('a',0,{...profile,seniorityYears:12})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
 const saved=await value(race.find(r=>r.status===200));assert.equal(saved.revision,1);
 assert.deepEqual(await value(await run('b')),{profile:null,revision:0});
 assert.equal((await put('b',0,{...profile,seniorityYears:2})).status,200);
 const forged=await run('a','GET',undefined,'?user_id='+ids.b);
 assert.equal(forged.headers.get('cache-control'),'private, no-store');assert.deepEqual(await value(forged),saved);
 badOwner=true;assert.equal((await run('a')).status,503);badOwner=false;
 failWrite=true;const fail=await put('a',1);assert.equal(fail.status,503);assert.ok(!(await fail.text()).includes('private backend detail'));failWrite=false;
 assert.equal((await put('a',1,{schema:1,seniorityYears:10,positions:[]})).status,200);
 assert.deepEqual((await value(await run('a'))).profile.positions,[]);
 assert.equal((await value(await run('b'))).profile.seniorityYears,2);
 assert.equal((await run('a','DELETE')).status,405);
 console.log('APD_CAREER_FULL_WORKER_PASS synthetic sessions, entitlement, CORS, owner isolation, CAS, bounded payload; mocked PostgREST');
}finally{globalThis.fetch=nativeFetch;}
