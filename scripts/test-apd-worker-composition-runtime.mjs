import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {composeWorkerSnapshot} from './apd-worker-composition.mjs';
const source=readFileSync(new URL('../worker-live/worker_hotfix.js',import.meta.url),'utf8');
const {candidate}=composeWorkerSnapshot(source);
// Execute only extracted composed handlers and their route branches, never the full historical module.
const section=(start,end)=>{assert.equal(candidate.split(start).length,2,'ambiguous start');const i=candidate.indexOf(start),j=candidate.indexOf(end,i);assert.ok(i>=0&&j>i);return candidate.slice(i,j);};
const fn=name=>{const i=candidate.indexOf('function '+name+'(');assert.ok(i>=0);const start=candidate.slice(i-6,i)==='async '?i-6:i;const end=candidate.indexOf('\n__name('+name+',',i);assert.ok(end>i);return candidate.slice(start,end);};
const bundle=section('const apdCareerCandidateV1=(()=>{','async function handleAccountPreferencesSecureV1(request, env) {');
const helpers=section('function apdSessionIsCurrentAuditV1(','\n'+source.slice(0,100));
const channel=section('function apdChannelAllowedAuditV1(','\nfunction apdUniqueWhatsAppAccountAuditV1(');
const routes=section('    if (path === API_URL_PREFIX3 + "/account/career") {','    if (path === API_URL_PREFIX3 + "/account/preferences") {');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
function fixture(){
 const now=Date.now(),future=new Date(now+86400000).toISOString(),past=new Date(now-86400000).toISOString();
 const users=new Map([[A,{id:A,activo:true,es_admin:false}],[B,{id:B,activo:true,es_admin:true}]]);
 const sessions=new Map([['A',{user_id:A,activo:true,expires_at:future}],['B',{user_id:B,activo:true,expires_at:future}]]);
 const plans=new Map([[A,'FREE'],[B,'COMPLETO']]);
 const profiles=new Map([[A,{profile:{schema:1,seniorityYears:7,positions:[]},revision:1}],[B,{profile:{schema:1,seniorityYears:12,positions:[]},revision:1}]]);
 const calls=[];let writes=0;
 const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
 const fetch=async(url,init)=>{
  const u=new URL(url);assert.equal(u.origin,'https://fixture.invalid');assert.equal(init.headers.Authorization,'Bearer fixture-only');calls.push([u.pathname,init.method]);
  if(u.pathname==='/rest/v1/user_career_profile'&&init.method==='GET'){
   const id=u.searchParams.get('user_id').slice(3),row=profiles.get(id);return json(row?[{user_id:id,...row}]:[]);
  }
  if(u.pathname==='/rest/v1/rpc/apd_career_profile_cas'&&init.method==='POST'){
   const p=JSON.parse(init.body);assert.ok(users.has(p.p_user));const row=profiles.get(p.p_user);
   if((row?.revision||0)!==p.p_revision)return json([]);
   writes++;const saved={profile:p.p_profile,revision:p.p_revision+1};profiles.set(p.p_user,saved);return json([saved]);
  }
  if(u.pathname==='/rest/v1/user_application_diary'&&init.method==='GET')return json([]);
  throw Error('Unexpected fixture endpoint');
 };
 const supabaseSelect=async(env,q)=>{
  if(q.startsWith('sessions?token=eq.')){const token=q.split('&')[0].slice('sessions?token=eq.'.length);const row=sessions.get(token);return row?[row]:[];}
  if(q.startsWith('users?id=eq.')){const id=q.split('&')[0].slice('users?id=eq.'.length);return users.has(id)?[users.get(id)]:[];}
  if(q.startsWith('sessions?select=user_id,'))return [...sessions.values()].map(s=>({...s,token:'synthetic-secret',metodo:'fixture',created_at:past}));
  throw Error('Unexpected fixture query');
 };
 const resolverPlanUsuario=async(env,id)=>{
  const code=plans.get(id);return {plan:{code,feature_flags:{whatsapp:true}},subscription:{user_id:id,plan_code:code,status:'ACTIVE',source:code==='FREE'?'apd_free_verified':'fixture',started_at:past,current_period_ends_at:future,trial_ends_at:future}};
 };
 const ctx=vm.createContext({Request,Response,Headers,URL,URLSearchParams,AbortSignal,TextDecoder,fetch,supabaseSelect,resolverPlanUsuario,isPlanActivo:()=>true,json2:json,adminJson:json,API_URL_PREFIX3:'/api'});
 vm.runInContext(helpers+'\n'+channel+'\n'+['getBearerToken','getSessionUserByBearer','requireAdmin','handleAdminSesiones','resolveTelegramEntitlement','resolveWhatsAppEntitlement'].map(fn).join('\n')+'\n'+bundle+'\nasync function dispatch(request,env){const path=new URL(request.url).pathname;'+routes+'return json2({},404);}',ctx);
 const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'};
 const request=(token,path='/api/account/career',method='GET',body)=>new Request('https://fixture.invalid'+path,{method,headers:{Origin:'https://alertasapd.com.ar',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {ctx,env,request,sessions,users,profiles,plans,calls,get writes(){return writes},run:(...args)=>ctx.dispatch(request(...args),env)};
}
test('composed route authenticates owner, prevents cross-account access and denies expired sessions',async()=>{
 const f=fixture();
 assert.equal((await f.run(null)).status,401);assert.equal(f.calls.length,0);
 const r=await f.run('A','/api/account/career?user_id='+B);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('access-control-allow-origin'),'https://alertasapd.com.ar');
 assert.equal((await r.json()).career.profile.seniorityYears,7);
 f.sessions.get('A').expires_at=new Date(Date.now()-1).toISOString();
 assert.equal((await f.run('A')).status,401);assert.equal(f.calls.length,1);
});
test('composed route enforces paid writes, rejects injected owner, CAS conflicts and preserves other account',async()=>{
 const f=fixture(),body={profile:{schema:1,seniorityYears:20,positions:[]},revision:1};
 assert.equal((await f.run('A','/api/account/career','PUT',body)).status,403);
 assert.equal((await f.run('B','/api/account/career','PUT',{...body,user_id:A})).status,400);
 assert.equal(f.writes,0);
 const r=await f.run('B','/api/account/career','PUT',body);assert.equal(r.status,200);assert.equal((await r.json()).career.revision,2);
 assert.equal((await f.run('B','/api/account/career','PUT',body)).status,409);
 assert.equal(f.writes,1);assert.equal(f.profiles.get(A).profile.seniorityYears,7);
});
test('composed diary and channel gates agree: free telegram only, complete diary and whatsapp',async()=>{
 const f=fixture();
 assert.equal((await f.run('A','/api/account/application-diary')).status,403);
 assert.equal((await f.run('B','/api/account/application-diary')).status,200);
 assert.equal((await f.ctx.resolveTelegramEntitlement(f.env,A)).allowed,true);
 assert.equal((await f.ctx.resolveWhatsAppEntitlement(f.env,A)).allowed,false);
 assert.equal((await f.ctx.resolveWhatsAppEntitlement(f.env,B)).allowed,true);
});
test('composed admin route checks current session and redacts even unexpected token fields',async()=>{
 const f=fixture();
 assert.equal((await f.ctx.handleAdminSesiones(f.request('A'),f.env)).status,403);
 const r=await f.ctx.handleAdminSesiones(f.request('B'),f.env);assert.equal(r.status,200);assert.ok(!(await r.text()).includes('synthetic-secret'));
 f.sessions.get('B').expires_at='invalid';assert.equal((await f.ctx.handleAdminSesiones(f.request('B'),f.env)).status,401);
});

test('admin privileges require explicit boolean role and do not grant paid features',async()=>{
 const f=fixture(),body={profile:{schema:1,seniorityYears:20,positions:[]},revision:1};
 f.plans.set(B,'FREE');
 assert.equal((await f.ctx.handleAdminSesiones(f.request('B'),f.env)).status,200);
 assert.equal((await f.run('B','/api/account/career','PUT',body)).status,403);
 assert.equal((await f.run('B','/api/account/application-diary')).status,403);
 assert.equal((await f.ctx.resolveWhatsAppEntitlement(f.env,B)).allowed,false);
 assert.equal(f.writes,0);
 for(const invalid of [false,null,undefined,'false','true',1,{}]){
  f.users.get(B).es_admin=invalid;
  assert.equal((await f.ctx.handleAdminSesiones(f.request('B'),f.env)).status,403);
 }
 f.plans.set(A,'COMPLETO');
 assert.equal((await f.ctx.handleAdminSesiones(f.request('A'),f.env)).status,403);
 assert.equal((await f.run('A','/api/account/career','PUT',body)).status,200);
});
