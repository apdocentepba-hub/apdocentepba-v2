/** Offline builder: preserve baseline byte for byte except explicit route additions. */
import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('tmp/apd-career');
const base=path.resolve(process.env.APD_CAREER_LIVE_SOURCE||'worker-live/worker_hotfix.js');
if(process.env.APD_CAREER_LIVE_SOURCE&&!base.startsWith(dir+path.sep))throw Error('Untrusted baseline path');
const source=fs.readFileSync(base,'utf8');
const strip=p=>fs.readFileSync('scripts/'+p,'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
const bundle=[
 'const {validateModuleSchedule}=(()=>{'+strip('apd-account-schedule-core.mjs')+'\nreturn {validateModuleSchedule};})();',
 'const {validateCareerProfile,projectCareerSchedule}=(()=>{'+strip('apd-career-profile-core.mjs')+'\nreturn {validateCareerProfile,projectCareerSchedule};})();',
 'const {cleanCareer,validateCareerRecord,careerAccountRequest}=(()=>{'+strip('apd-career-account-core.mjs')+'\nreturn {cleanCareer,validateCareerRecord,careerAccountRequest};})();',
 strip('apd-application-diary.mjs'),
 strip('apd-application-diary-account.mjs'),
 strip('apd-career-account-storage.mjs')
].join('\n');
const handler='\nconst apdCareerCandidateV1=(()=>{\n'+bundle+'\nreturn {careerAccountRequest,createCareerStorage,diaryAccountRequest,createDiaryStorage};\n})();\n'+String.raw`
function apdCareerCorsV1(request,response){
 const origin=request.headers.get('Origin'),headers=new Headers(response?.headers);
 headers.delete('Access-Control-Allow-Credentials');headers.delete('Access-Control-Allow-Origin');
 headers.set('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
 headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
 headers.set('Cache-Control','private, no-store');headers.set('Vary','Origin');
 if(origin==='https://alertasapd.com.ar')headers.set('Access-Control-Allow-Origin',origin);
 return new Response(response?.body??null,{status:response?.status??204,headers});
}
async function hasAccountCareerAccessV1(env,id){
 const p=await resolverPlanUsuario(env,id);
 const code=String(p?.subscription?.plan_code||'').trim().toUpperCase();
 const planCode=String(p?.plan?.code||'').trim().toUpperCase();
 const status=String(p?.subscription?.status||'').trim().toUpperCase();
 if(!['ACTIVE','AUTHORIZED','APPROVED'].includes(status)||!isPlanActivo(p))return false;
 if(['COMPLETO','TRIAL_14D'].includes(code)){
  const sub=p.subscription;
  const end=code==='TRIAL_14D'?sub.trial_ends_at:sub.current_period_ends_at;
  const start=Date.parse(sub.started_at),expiry=Date.parse(end),now=Date.now();
  return sub.user_id===id&&String(sub.source||'').toUpperCase()!=='FALLBACK_FRONTEND'&&planCode===code&&typeof sub.started_at==='string'&&typeof end==='string'&&Number.isFinite(start)&&Number.isFinite(expiry)&&start<=now&&now<expiry;
 }
 const legacy=['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'];
 return legacy.includes(code)&&(!planCode||legacy.includes(planCode));
}
async function handleAccountCareerSecureV1(request,env,diary=false){
 try{
  const {createDiaryStorage,createCareerStorage,diaryAccountRequest,careerAccountRequest}=apdCareerCandidateV1;
  const storage=(diary?createDiaryStorage:createCareerStorage)({base:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY});
  const result=await (diary?diaryAccountRequest:careerAccountRequest)(request,{
   authenticate:req=>getSessionUserByBearer(env,req),
   entitled:id=>hasAccountCareerAccessV1(env,id),
   read:storage.read,compareAndSet:storage.compareAndSet
  });
  return apdCareerCorsV1(request,json2(result.body,result.status));
 }catch{return apdCareerCorsV1(request,json2({ok:false,message:'No se pudo confirmar la operación'},503));}
}
`;
const mark='async function handleAccountPreferencesSecureV1(request, env) {';
const route='    if (path === API_URL_PREFIX3 + "/account/preferences") {';
const fetchMark='async fetch(request, env, ctx) {';
const routePosition=source.indexOf(route),fetchPosition=source.lastIndexOf(fetchMark,routePosition);
if(routePosition<0||fetchPosition<0||routePosition-fetchPosition>16000||source.includes('handleAccountCareerSecureV1')||source.split(mark).length!==2||source.split(route).length!==2)throw Error('Baseline drift');
const diaryPath='/account/application-diary';
const diaryRouteExists=source.includes(diaryPath);
const candidatePaths=['/account/career',...(!diaryRouteExists?[diaryPath]:[])];
const addedRoute=candidatePaths.map(path=>
 '    if (path === API_URL_PREFIX3 + '+JSON.stringify(path)+') {\n'+
 '      return await handleAccountCareerSecureV1(request, env'+(path===diaryPath?', true':'')+');\n    }\n'
).join('');
const optionsRoute='\n    if (request.method === "OPTIONS" && '+JSON.stringify(candidatePaths.map(path=>'/api'+path))+
 '.includes(new URL(request.url).pathname)) return apdCareerCorsV1(request);\n';
if(diaryRouteExists)console.log('APD_EXISTING_DIARY_ROUTE_PRESERVED');
const at=fetchPosition+fetchMark.length;
const candidate=(source.slice(0,at)+optionsRoute+source.slice(at)).replace(mark,()=>handler+mark).replace(route,addedRoute+route);
if(candidate.replace(handler,'').replace(addedRoute,'').replace(optionsRoute,'')!==source)throw Error('Unrelated drift');
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'worker-career-candidate.mjs'),candidate);
console.log('APD_CAREER_WORKER_BUILD_PASS baseline preserved; offline only');
