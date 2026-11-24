/** Offline only; never deploys or writes to any database. */
import fs from 'node:fs';
import path from 'node:path';
const requested=process.env.APD_ACCOUNT_FAVORITES_LIVE_SOURCE;
const dir=path.resolve('tmp/apd-account-favorites');
const base=path.resolve(requested||'worker-live/worker_hotfix.js');
if(requested&&!base.startsWith(dir+path.sep))throw Error('Untrusted baseline path');
const source=fs.readFileSync(base,'utf8');
const load=p=>fs.readFileSync('scripts/'+p,'utf8');
const strip=s=>s.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
const comparator=load('apd-comparador-criterios.mjs');
const start=comparator.indexOf('function validDate('),end=comparator.indexOf('function validGeoPoint(');
if(start<0||end<=start)throw Error('Closure parser drift');
const parser="const asString=v=>String(v??'').trim().slice(0,180);\n"+strip(comparator.slice(start,end));
const modules=[parser,strip(load('apd-account-favorites-core.mjs')),strip(load('apd-account-favorites-storage.mjs')),strip(load('apd-account-favorites-resolver.mjs'))].join('\n');
const handler="\nconst apdFavoritesCandidateV1=(()=>{\n"+modules+"\nreturn {accountFavoritesRequest,createFavoriteStorage,createFavoriteResolver};\n})();\n"+String.raw`
function apdFavoriteCorsV1(request,response){
 const origin=request.headers.get('Origin'),headers=new Headers(response?.headers);
 headers.delete('Access-Control-Allow-Credentials');headers.delete('Access-Control-Allow-Origin');
 headers.set('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
 headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
 headers.set('Cache-Control','private, no-store');headers.set('Vary','Origin');
 if(origin==='https://alertasapd.com.ar')headers.set('Access-Control-Allow-Origin',origin);
 return new Response(response?.body??null,{status:response?.status??204,headers});
}
async function handleAccountFavoritesSecureV1(request,env){
 try{
  const storage=apdFavoritesCandidateV1.createFavoriteStorage({base:env.SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY});
  const result=await apdFavoritesCandidateV1.accountFavoritesRequest(request,{
   authenticate:req=>getSessionUserByBearer(env,req),
   entitled:async id=>{
    const p=await resolverPlanUsuario(env,id);
    return isPlanActivo(p)&&['INSIGNE','INSIGNE_ANUAL','SIGNATURE','SIGNATURE_ANUAL'].includes(String(p?.subscription?.plan_code||'').toUpperCase())&&['ACTIVE','AUTHORIZED','APPROVED'].includes(String(p?.subscription?.status||'').toUpperCase());
   },
   read:storage.read,compareAndSet:storage.compareAndSet,
   resolveOffer:apdFavoritesCandidateV1.createFavoriteResolver({select:q=>supabaseSelect(env,q)})
  });
  return apdFavoriteCorsV1(request,json2(result.body,result.status));
 }catch{return apdFavoriteCorsV1(request,json2({ok:false,message:'No se pudo confirmar la operación. Volvé a consultar.'},503));}
}
`;
const mark='async function handleAccountPreferencesSecureV1(request, env) {';
const route='    if (path === API_URL_PREFIX3 + "/account/preferences") {';
const fetchMark='async fetch(request, env, ctx) {';
const routePosition=source.indexOf(route),fetchPosition=source.lastIndexOf(fetchMark,routePosition);
if(fetchPosition<0||routePosition-fetchPosition>8000||source.includes('handleAccountFavoritesSecureV1')||source.split(mark).length!==2||source.split(route).length!==2)throw Error('Baseline drift');
const addedRoute='    if (path === API_URL_PREFIX3 + "/account/favorites") {\n      return await handleAccountFavoritesSecureV1(request, env);\n    }\n';
const optionsRoute='\n    if (request.method === "OPTIONS" && new URL(request.url).pathname === API_URL_PREFIX3 + "/account/favorites") return apdFavoriteCorsV1(request);\n';
const at=fetchPosition+fetchMark.length;
const candidate=(source.slice(0,at)+optionsRoute+source.slice(at)).replace(mark,()=>handler+mark).replace(route,addedRoute+route);
if(candidate.replace(handler,'').replace(addedRoute,'').replace(optionsRoute,'')!==source)throw Error('Unrelated drift');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'worker-favorites-candidate.mjs'),candidate);
console.log('PASS favorites route inserted without unrelated changes; offline only');
