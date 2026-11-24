/** Offline builder. Never uploads, changes traffic or writes data. */
import fs from 'node:fs';
import path from 'node:path';
const requested=process.env.APD_ACCOUNT_SCHEDULE_LIVE_SOURCE;
const base=path.resolve(requested||'worker-live/worker_hotfix.js');
if(requested&&!base.startsWith(path.resolve('tmp/apd-account-schedule')+path.sep))throw Error('Untrusted baseline path');
const source=fs.readFileSync(base,'utf8');
const core=fs.readFileSync('scripts/apd-account-schedule-core.mjs','utf8').replaceAll('export function ','function ').replaceAll('export async function ','async function ');
const handler=String.raw`
function accountScheduleCors(request,response){
 const origin=request.headers.get('Origin');
 const headers=new Headers(response?.headers);
 headers.delete('Access-Control-Allow-Credentials');
 headers.delete('Access-Control-Allow-Origin');
 headers.set('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
 headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
 headers.set('Cache-Control','private, no-store');
 headers.set('Vary','Origin');
 if(origin==='https://alertasapd.com.ar')headers.set('Access-Control-Allow-Origin',origin);
 return new Response(response?.body??null,{status:response?.status??204,headers});
}
async function handleAccountScheduleSecureV1(request,env){
 const table=env.SUPABASE_URL+'/rest/v1/user_module_schedule';
 const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'};
 const query=id=>'?user_id=eq.'+encodeURIComponent(id)+'&select=modules,revision';
 const result=await accountScheduleRequest(request,{
  authenticate:req=>getSessionUserByBearer(env,req),
  entitled:async id=>{
   const resolved=await resolverPlanUsuario(env,id);
   return isPlanActivo(resolved)&&['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'].includes(String(resolved?.subscription?.plan_code||'').toUpperCase())&&['ACTIVE','AUTHORIZED','APPROVED'].includes(String(resolved?.subscription?.status||'').toUpperCase());
  },
  read:async id=>{
   const rows=await supabaseSelect(env,'user_module_schedule'+query(id));
   if(!Array.isArray(rows)||rows.length>1)throw Error('Invalid rows');
   return rows[0]||null;
  },
  compareAndSet:async(id,{modules,revision})=>{
   // No retry on ambiguous write. Next GET recovers authoritative state.
   const insert=revision===0;
   const url=insert?table+'?select=modules,revision':table+query(id)+'&revision=eq.'+revision;
   const body={modules,revision:revision+1,updated_at:new Date().toISOString(),...(insert?{user_id:id}:{})};
   const res=await fetch(url,{method:insert?'POST':'PATCH',headers,body:JSON.stringify(body)});
   if(insert&&res.status===409)return null;
   if(!res.ok)throw Error('Storage error');
   const rows=await res.json();
   if(!Array.isArray(rows)||rows.length>1)throw Error('Invalid write response');
   return rows[0]||null;
  }
 });
 const response=json2(result.body,result.status);
 response.headers.set('Cache-Control','private, no-store');
 return accountScheduleCors(request,response);
}
`;
const mark='async function handleAccountPreferencesSecureV1(request, env) {';
const route='    if (path === API_URL_PREFIX3 + "/account/preferences") {';
const addedRoute='    if (path === API_URL_PREFIX3 + "/account/schedule") {\n      return await handleAccountScheduleSecureV1(request, env);\n    }\n';
const fetchMark='async fetch(request, env, ctx) {';
const routePosition=source.indexOf(route);
const fetchPosition=source.lastIndexOf(fetchMark,routePosition);
if(fetchPosition<0||routePosition-fetchPosition>8000)throw Error('Cannot locate schedule router entry');
const optionsRoute='\n    if (request.method === "OPTIONS" && new URL(request.url).pathname === API_URL_PREFIX3 + "/account/schedule") return accountScheduleCors(request);\n';
if(source.includes('handleAccountScheduleSecureV1')||source.split(mark).length!==2||source.split(route).length!==2)throw Error('Baseline drift');
const added=core+'\n'+handler+'\n';
const at=fetchPosition+fetchMark.length;
const withOptions=source.slice(0,at)+optionsRoute+source.slice(at);
const candidate=withOptions.replace(mark,added+mark).replace(route,addedRoute+route);
if(candidate.replace(added,'').replace(addedRoute,'').replace(optionsRoute,'')!==source)throw Error('Unrelated drift');
fs.mkdirSync('tmp/apd-account-schedule',{recursive:true});
fs.writeFileSync('tmp/apd-account-schedule/worker-schedule-candidate.mjs',candidate);
console.log('PASS: isolated route candidate; no deployment; production baseline must be captured separately');
