/** Offline only; never deploys or writes to any database. */
import fs from 'node:fs';
import path from 'node:path';
const requested=process.env.APD_ACCOUNT_DIARY_LIVE_SOURCE;
const dir=path.resolve('tmp/apd-account-diary');
const base=path.resolve(requested||'worker-live/worker_hotfix.js');
if(requested&&!base.startsWith(dir+path.sep))throw Error('Untrusted baseline path');
const source=fs.readFileSync(base,'utf8');
const load=p=>fs.readFileSync('scripts/'+p,'utf8');
const strip=s=>s.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
const modules=['apd-application-diary.mjs','apd-account-diary-core.mjs','apd-account-diary-storage.mjs'].map(p=>strip(load(p))).join('\n');
const handler="\nconst apdDiaryCandidateV1=(()=>{\n"+modules+"\nreturn {accountDiaryRequest,createDiaryStorage};\n})();\n"+String.raw`
function apdDiaryCorsV1(request,response){
 const origin=request.headers.get('Origin'),headers=new Headers(response?.headers);
 headers.delete('Access-Control-Allow-Credentials');headers.delete('Access-Control-Allow-Origin');
 headers.set('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
 headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
 headers.set('Cache-Control','private, no-store');headers.set('Vary','Origin');
 if(origin==='https://alertasapd.com.ar')headers.set('Access-Control-Allow-Origin',origin);
 return new Response(response?.body??null,{status:response?.status??204,headers});
}
async function handleAccountDiarySecureV1(request,env){
 try{
  const storage=apdDiaryCandidateV1.createDiaryStorage({base:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY});
  const result=await apdDiaryCandidateV1.accountDiaryRequest(request,{
   authenticate:req=>getSessionUserByBearer(env,req),
   entitled:async id=>{
    const p=await resolverPlanUsuario(env,id);
    return isPlanActivo(p)&&['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'].includes(String(p?.subscription?.plan_code||'').toUpperCase())&&['ACTIVE','AUTHORIZED','APPROVED'].includes(String(p?.subscription?.status||'').toUpperCase());
   },
   read:storage.read,compareAndSet:storage.compareAndSet,
   knownIdentity:async key=>{
    const rows=await supabaseSelect(env,'apd_ofertas_global_current?source_offer_key=eq.'+encodeURIComponent(key)+'&select=source_offer_key&limit=2');
    if(!Array.isArray(rows)||rows.length>1||rows.length===1&&rows[0].source_offer_key!==key)throw Error('Identity mismatch');
    return rows.length===1;
   }
  });
  return apdDiaryCorsV1(request,json2(result.body,result.status));
 }catch{return apdDiaryCorsV1(request,json2({ok:false,message:'No se pudo confirmar la operación. Volvé a consultar.'},503));}
}
`;
const mark='async function handleAccountPreferencesSecureV1(request, env) {';
const route='    if (path === API_URL_PREFIX3 + "/account/preferences") {';
const fetchMark='async fetch(request, env, ctx) {';
const routePosition=source.indexOf(route),fetchPosition=source.lastIndexOf(fetchMark,routePosition);
if(fetchPosition<0||routePosition-fetchPosition>8000||source.includes('handleAccountDiarySecureV1')||source.split(mark).length!==2||source.split(route).length!==2)throw Error('Baseline drift');
const addedRoute='    if (path === API_URL_PREFIX3 + "/account/application-diary") {\n      return await handleAccountDiarySecureV1(request, env);\n    }\n';
const optionsRoute='\n    if (request.method === "OPTIONS" && new URL(request.url).pathname === API_URL_PREFIX3 + "/account/application-diary") return apdDiaryCorsV1(request);\n';
const at=fetchPosition+fetchMark.length;
const candidate=(source.slice(0,at)+optionsRoute+source.slice(at)).replace(mark,()=>handler+mark).replace(route,addedRoute+route);
if(candidate.replace(handler,'').replace(addedRoute,'').replace(optionsRoute,'')!==source)throw Error('Unrelated drift');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'worker-diary-candidate.mjs'),candidate);
console.log('PASS diary route inserted without unrelated changes; offline only');
