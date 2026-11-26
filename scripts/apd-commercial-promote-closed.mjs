// Dedicated release of an already verified uploaded version; no Wrangler deployment or secret changes.
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {OLD,NEXT,OLD_HASH,NEXT_HASH,worker,base,preview,activeVersion,inspectCrons,verifyVersion,compareBindings,smoke} from './apd-commercial-release-contracts.mjs';

export async function promoteClosed({active,checkDb,verifyVersions,checkCrons,checkHttp,post,log=console.log}){
 const initial=await active();
 if(initial!==OLD&&initial!==NEXT)throw Error('Unexpected active version; no traffic change');
 await checkDb();
 await verifyVersions();
 await checkCrons();
 await checkHttp();
 await checkDb();
 await checkCrons();
 if(await active()!==initial)throw Error('Concurrent deployment; no traffic change');
 if(initial===NEXT){log('APD_COMMERCIAL_ALREADY_ACTIVE_CLOSED');return {alreadyActive:true};}
 try{
  await post(NEXT);
  if(await active()!==NEXT)throw Error('Promotion not confirmed');
  await checkCrons();
  await checkDb();
  await checkHttp();
  if(await active()!==NEXT)throw Error('Concurrent deployment after promotion');
  log('APD_COMMERCIAL_WORKER_PROMOTION_PASS '+JSON.stringify({active:NEXT,traffic:100,rollback:OLD,admissionOpen:false,bindings:29,crons:4}));
  return {alreadyActive:false};
 }catch(e){
  // Lost response is not evidence of failure to apply. Read live state before rollback.
  const current=await active();
  if(current===OLD){log('APD_COMMERCIAL_OLD_VERSION_INTACT');throw e;}
  if(current!==NEXT)throw Error('URGENT: unexpected live version; no automatic overwrite');
  await checkDb(); // Never revert if commercial obligations exist or gate has opened.
  await post(OLD);
  if(await active()!==OLD)throw Error('URGENT: rollback not confirmed');
  await checkCrons();
  await checkHttp();
  log('APD_COMMERCIAL_ROLLBACK_VERIFIED');
  throw e;
 }
}
export function validateDbUrl(value){
 let u;try{u=new URL(value);}catch{throw Error('Invalid DB target');}
 const ref='vvgkinkvojqwfuqaxijh';
 const direct=u.hostname==='db.'+ref+'.supabase.co'&&u.username==='postgres';
 const pool=u.hostname.endsWith('.pooler.supabase.com')&&u.username==='postgres.'+ref;
 if(!['postgres:','postgresql:'].includes(u.protocol)||!(direct||pool)||u.pathname!=='/postgres'||u.port!=='5432'||!u.password)throw Error('Unexpected DB target');
}
const dbSql=`SELECT CASE WHEN
 (SELECT count(*) FROM public.apd_commercial_release_control)=1 AND
 (SELECT count(*) FROM public.apd_commercial_release_control WHERE singleton AND NOT enrollment_open)=1 AND
 (SELECT count(*) FROM public.subscription_plans WHERE code IN ('FREE','COMPLETO','TRIAL_14D') AND NOT is_active AND NOT public_visible)=3 AND
 NOT EXISTS(SELECT 1 FROM public.user_subscriptions WHERE plan_code IN ('FREE','COMPLETO','TRIAL_14D')) AND
 NOT EXISTS(SELECT 1 FROM public.mercadopago_checkout_sessions WHERE plan_code IN ('FREE','COMPLETO','TRIAL_14D')) AND
 NOT EXISTS(SELECT 1 FROM public.apd_complete_trial_claims) AND
 NOT EXISTS(SELECT 1 FROM public.apd_complete_payment_ledger) AND
 NOT EXISTS(SELECT 1 FROM public.apd_complete_payment_review)
 THEN 'APD_GATE_CLOSED' ELSE 'APD_GATE_UNSAFE' END;`;
export function verifyDbGuardResult(r){
 if(r.status!==0){
  // Only SQLSTATE and fixed process metadata. Never print raw stderr, URI, SQL or credentials.
  const state=String(r.stderr||'').match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1]||'unavailable';
  const kind=r.error?.code==='ETIMEDOUT'?'timeout':r.error?'spawn_error':'psql_error';
  throw Error('Production DB guard connection/query failed: '+kind+' sqlstate='+state+' exit='+String(r.status??'none'));
 }
 if(String(r.stdout||'').trim()!=='APD_GATE_CLOSED')throw Error('Production admission or obligations unsafe; no promotion');
}
function checkDb(){
 const uri=process.env.APD_SUPABASE_DB_URL||'';
 validateDbUrl(uri);
 const r=spawnSync('psql',[uri,'-X','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-c',"BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; "+dbSql+" COMMIT;"],{
  env:{...process.env,PGCONNECT_TIMEOUT:'10',PGSSLMODE:'require'},
  encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:25000});
 verifyDbGuardResult(r);
 console.log('APD_PRODUCTION_ADMISSION_CLOSED_VERIFIED');
}
async function main(){
 if(process.env.GITHUB_REPOSITORY!=='apdocentepba-hub/apdocentepba-v2'||process.env.GITHUB_EVENT_NAME!=='push'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.APD_PROMOTE_CLOSED!=='1')throw Error('Unapproved production release context');
 const token=process.env.CLOUDFLARE_API_TOKEN;if(!token)throw Error('Missing authentication');
 async function cf(path,body){
  const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error('Cloudflare HTTP '+r.status);
  const j=await r.json();if(j.success!==true)throw Error('Cloudflare request rejected');return j.result;
 }
 const accounts=await cf('/accounts?per_page=50');
 const id=process.env.CONFIGURED_ACCOUNT_ID||(accounts.length===1?accounts[0].id:'');
 if(!id||!accounts.some(a=>a.id===id))throw Error('Account not verified');
 const root='/accounts/'+encodeURIComponent(id)+'/workers/';
 const route=root+'scripts/'+worker+'/deployments';
 const checkHttp=()=>smoke(async(origin,path)=>{
  const r=await fetch(origin+path,{method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});
  const status=r.status;if(path==='/api/planes'&&status===200)return {status,data:await r.json()};
  await r.body?.cancel();return {status};
 });
 await promoteClosed({
  active:async()=>activeVersion(await cf(route)),checkDb,
  verifyVersions:async()=>{
   const get=version=>cf(root+'workers/'+worker+'/versions/'+version+'?include=modules');
   const old=await get(OLD),next=await get(NEXT);
   verifyVersion(old,OLD,OLD_HASH,865831);verifyVersion(next,NEXT,NEXT_HASH,902908);compareBindings(old,next);
  },
  checkCrons:async()=>inspectCrons(await cf(root+'scripts/'+worker+'/schedules')),
  checkHttp,
  post:async version=>{
   if(![OLD,NEXT].includes(version))throw Error('Unapproved version');
   return cf(route,{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':version===NEXT?'APD commercial closed admission verified release':'APD commercial rollback before obligations'}});
  }
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
