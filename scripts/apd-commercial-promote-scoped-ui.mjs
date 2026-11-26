// Promote only the exact scoped UI candidate already staged at 0%.
// This release changes only the authenticated catalog, never payment or admission data.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {worker,base,activeVersion,inspectCrons,verifyVersion,compareBindings} from './apd-commercial-release-contracts.mjs';
import {validateDbUrl} from './apd-commercial-promote-closed.mjs';
export const OLD='0c83862f-ceaa-4436-a710-4c22d0ca65b4', NEXT='8dd0369a-b6bc-4924-952c-d82ceeb05af1';
const preview='https://'+NEXT.slice(0,8)+'-'+worker+'.apdocentepba.workers.dev';
const OLD_HASH='c291a47c6bc58ed6b9f0510d4b443ce8be2efb11280a045763c75a2a62b28113';
const NEXT_HASH='a8591683e867542d504c2e91243b036b3b0c886f9bb361fc23c1dd79ebf22c85';
export function closedCatalog(data,{scoped=false,cache='',vary=''}={}){
 assert.equal(data?.ok,true);
 assert.equal(data.commercial_model,'free_complete_v1');
 assert.equal(data.trial_days,14);
 assert.equal(data.commercial_enrollment_open,false);
 assert.notEqual(data.commercial_checkout_resume,true);
 if(scoped){
  assert.equal(data.commercial_checkout_resume,false);
  assert.match(cache,/(?:^|,\s*)private(?:,|$)/i);
  assert.match(cache,/(?:^|,\s*)no-store(?:,|$)/i);
  assert.ok(vary.split(',').map(x=>x.trim().toLowerCase()).includes('authorization'));
 }
 assert.ok(Array.isArray(data.planes));
 const plans=data.planes.map(p=>[p.code,Number(p.price_ars),Number(p.max_distritos),Number(p.max_cargos)]).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(plans,[['COMPLETO',2000,5,10],['FREE',0,1,1]]);
 return plans;
}
export async function promoteScoped({active,checkDb,versions,crons,smoke,deploy,log=console.log}){
 const initial=await active();
 if(initial!==OLD&&initial!==NEXT)throw Error('Unexpected active version');
 await checkDb(); await versions(); await crons();
 await smoke(initial);
 await checkDb(); await crons();
 if(await active()!==initial)throw Error('Concurrent deployment');
 if(initial===NEXT){log('APD_SCOPED_UI_ALREADY_ACTIVE');return;}
 try{
  await deploy(NEXT);
  if(await active()!==NEXT)throw Error('Activation not confirmed');
  await crons(); await checkDb(); await smoke(NEXT);
  if(await active()!==NEXT)throw Error('Concurrent deployment after activation');
  log('APD_SCOPED_UI_PROMOTED '+JSON.stringify({version:NEXT,trafficPercent:100,rollbackVersion:OLD,admissionOpen:false,providerCalls:0,databaseWrites:0}));
 }catch(e){
  const live=await active();
  if(live===OLD)throw e;
  if(live!==NEXT)throw Error('Unexpected deployment; rollback refused');
  // OLD and NEXT share the same payment handlers; reverting the catalog cannot cancel a checkout.
  await deploy(OLD);
  if(await active()!==OLD)throw Error('Rollback not confirmed');
  await crons(); await smoke(OLD);
  log('APD_SCOPED_UI_ROLLBACK_CONFIRMED');
  throw e;
 }
}
const sql=`SELECT CASE WHEN
 (SELECT count(*) FROM public.apd_commercial_release_control)=1 AND
 (SELECT count(*) FROM public.apd_commercial_release_control WHERE singleton AND NOT enrollment_open)=1 AND
 (SELECT count(*) FROM public.apd_commercial_checkout_pilot WHERE revoked_at IS NULL AND valid_until>now())=1 AND
 (SELECT count(*) FROM public.mercadopago_checkout_sessions WHERE plan_code='COMPLETO')=1 AND
 (SELECT count(*) FROM public.mercadopago_checkout_sessions s JOIN public.apd_commercial_checkout_pilot p USING(user_id)
  JOIN public.users u ON u.id=s.user_id
  WHERE p.revoked_at IS NULL AND p.valid_until>now() AND u.activo IS TRUE AND s.plan_code='COMPLETO' AND s.status='ready'
   AND s.provider_payload->>'price_ars'='2000' AND coalesce(s.provider_payload->>'preference_id','')<>'' AND s.checkout_url IS NOT NULL)=1 AND
 (SELECT count(*) FROM public.apd_complete_payment_ledger)=0
 THEN 'APD_SINGLE_READY_CLOSED' ELSE 'APD_UNSAFE' END;`;
function checkDb(){
 const uri=process.env.APD_SUPABASE_DB_URL||'';
 validateDbUrl(uri);
 const p=spawnSync('psql',[uri,'-X','-Atq','-v','ON_ERROR_STOP=1','-c',"BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; "+sql+" COMMIT;"],{env:{...process.env,PGCONNECT_TIMEOUT:'10',PGSSLMODE:'require'},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:25000});
 if(p.status!==0||String(p.stdout||'').trim()!=='APD_SINGLE_READY_CLOSED')throw Error('Single checkout / closed admission DB guard failed');
}
async function main(){
 if(process.env.GITHUB_REPOSITORY!=='apdocentepba-hub/apdocentepba-v2'||process.env.GITHUB_EVENT_NAME!=='push'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.APD_PROMOTE_SCOPED_UI!=='1')throw Error('Unauthorized release context');
 const token=process.env.CLOUDFLARE_API_TOKEN;if(!token)throw Error('Missing Cloudflare authentication');
 async function cf(path,body){
  const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw Error('Cloudflare HTTP '+response.status);
  const j=await response.json();if(j.success!==true)throw Error('Cloudflare request rejected');return j.result;
 }
 const accounts=await cf('/accounts?per_page=50'),account=process.env.CONFIGURED_ACCOUNT_ID||(accounts.length===1?accounts[0].id:null);
 if(!account||!accounts.some(a=>a.id===account))throw Error('Account not verified');
 const root='/accounts/'+encodeURIComponent(account)+'/workers/', route=root+'scripts/'+worker+'/deployments';
 async function read(origin,path,authorization){
  return fetch(origin+path,{method:'GET',redirect:'error',cache:'no-store',headers:authorization?{Authorization:authorization,Origin:'https://alertasapd.com.ar'}:{Origin:'https://alertasapd.com.ar'},signal:AbortSignal.timeout(20000)});
 }
 async function verifyOrigin(origin,scoped){
  for(const bearer of [undefined,'Bearer apd-invalid-qa-token']){
   const r=await read(origin,'/api/planes',bearer);
   assert.equal(r.status,200);
   closedCatalog(await r.json(),{scoped,cache:r.headers.get('cache-control')||'',vary:r.headers.get('vary')||''});
  }
  for(const [path,status] of [['/api/version',200],['/api/mi-plan',401],['/api/account/profile',401],['/api/mis-alertas',401],['/api/historico-resumen',401]]){
   const r=await read(origin,path);assert.equal(r.status,status,'HTTP contract '+path);await r.body?.cancel();
  }
 }
 await promoteScoped({
  active:async()=>activeVersion(await cf(route)),checkDb,
  versions:async()=>{
   const get=v=>cf(root+'workers/'+worker+'/versions/'+v+'?include=modules');
   const [old,next]=await Promise.all([get(OLD),get(NEXT)]);
   verifyVersion(old,OLD,OLD_HASH,902914);verifyVersion(next,NEXT,NEXT_HASH,904105);compareBindings(old,next);
  },
  crons:async()=>inspectCrons(await cf(root+'scripts/'+worker+'/schedules')),
  smoke:async live=>{await verifyOrigin(preview,true);await verifyOrigin(base,live===NEXT);},
  deploy:async version=>{
   if(![OLD,NEXT].includes(version))throw Error('Unapproved version');
   return cf(route,{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':version===NEXT?'APD scoped existing checkout UI':'APD scoped UI rollback'}});
  }
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
