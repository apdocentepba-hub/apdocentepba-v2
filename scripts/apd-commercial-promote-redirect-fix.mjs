import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {NEXT,NEXT_HASH,worker,base,activeVersion,inspectCrons,verifyVersion,compareBindings} from './apd-commercial-release-contracts.mjs';
import {validateDbUrl,verifyDbGuardResult} from './apd-commercial-promote-closed.mjs';
const target='0c83862f-ceaa-4436-a710-4c22d0ca65b4',sha='c291a47c6bc58ed6b9f0510d4b443ce8be2efb11280a045763c75a2a62b28113';
const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
assert.equal(process.env.GITHUB_REPOSITORY,'apdocentepba-hub/apdocentepba-v2');
assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request');assert.equal(event.number,343);
assert.equal(event.pull_request.head.repo.full_name,process.env.GITHUB_REPOSITORY);
assert.equal(event.pull_request.head.ref,'feat/scoped-checkout-pilot-20261126');
assert.equal(process.env.APD_PROMOTE_REDIRECT,'1');
const token=process.env.CLOUDFLARE_API_TOKEN;
async function cf(path,body){const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Cloudflare HTTP '+r.status);const j=await r.json();if(j.success!==true)throw Error('Cloudflare request rejected');return j.result;}
const accounts=await cf('/accounts?per_page=50'),id=process.env.CONFIGURED_ACCOUNT_ID||(accounts.length===1?accounts[0].id:'');
assert.ok(id&&accounts.some(a=>a.id===id));
const root='/accounts/'+encodeURIComponent(id)+'/workers/',route=root+'scripts/'+worker+'/deployments',preview='https://'+target.slice(0,8)+'-'+worker+'.apdocentepba.workers.dev';
const active=async()=>activeVersion(await cf(route));
const crons=async()=>inspectCrons(await cf(root+'scripts/'+worker+'/schedules'));
function checkDb(){
 const uri=process.env.APD_SUPABASE_DB_URL;validateDbUrl(uri);
 const sql=`SELECT CASE WHEN
 (SELECT count(*) FROM public.apd_commercial_release_control)=1 AND
 (SELECT count(*) FROM public.apd_commercial_release_control WHERE singleton AND NOT enrollment_open)=1 AND
 (SELECT count(*) FROM public.subscription_plans WHERE code IN ('FREE','COMPLETO','TRIAL_14D') AND is_active)=3 AND
 (SELECT count(*) FROM public.subscription_plans WHERE (code='FREE' AND price_ars=0 AND max_distritos=1 AND max_cargos=1 AND public_visible) OR (code='COMPLETO' AND price_ars=2000 AND max_distritos=5 AND max_cargos=10 AND public_visible) OR (code='TRIAL_14D' AND trial_days=14 AND NOT public_visible))=3 AND
 NOT EXISTS(SELECT 1 FROM public.mercadopago_checkout_sessions WHERE plan_code='COMPLETO') AND
 NOT EXISTS(SELECT 1 FROM public.user_subscriptions WHERE plan_code='COMPLETO') AND
 NOT EXISTS(SELECT 1 FROM public.apd_complete_payment_ledger)
 THEN 'APD_GATE_CLOSED' ELSE 'APD_GATE_UNSAFE' END;`;
 const r=spawnSync('psql',[uri,'-X','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-c',"BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; "+sql+" COMMIT;"],{env:{...process.env,PGCONNECT_TIMEOUT:'10',PGSSLMODE:'require'},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:25000});
 verifyDbGuardResult(r);
}
async function smoke(origin){
 for(const [path,status] of [['/api/version',200],['/api/planes',200],['/api/mi-plan',401],['/api/account/profile',401],['/api/account/preferences',401],['/api/account/application-diary',401],['/api/mis-alertas',401],['/api/historico-resumen',401]]){
  const r=await fetch(origin+path,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,status,'Smoke '+path);
  if(path==='/api/planes'){
   const data=await r.json();assert.equal(data.commercial_model,'free_complete_v1');assert.equal(data.commercial_enrollment_open,false);assert.equal(data.trial_days,14);
   assert.deepEqual(data.planes.map(p=>[p.code,Number(p.price_ars),Number(p.max_distritos),Number(p.max_cargos)]),[['FREE',0,1,1],['COMPLETO',2000,5,10]]);
  }else await r.body?.cancel();
 }
 const r=await fetch(origin+'/api/mercadopago/create-checkout-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan_code:'COMPLETO'}),redirect:'manual',signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,401,'Unauthenticated checkout should reject');await r.body?.cancel();
}
const initial=await active();assert.ok([NEXT,target].includes(initial),'Active version drift');
checkDb();await crons();
const get=version=>cf(root+'workers/'+worker+'/versions/'+version+'?include=modules');
const old=await get(NEXT),fresh=await get(target);
verifyVersion(old,NEXT,NEXT_HASH,902908);verifyVersion(fresh,target,sha,902914);compareBindings(old,fresh);
await smoke(base);await smoke(preview);checkDb();await crons();assert.equal(await active(),initial);
const deploy=version=>{assert.ok([NEXT,target].includes(version));return cf(route,{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':version===target?'APD native redirect fix verified release':'APD native redirect fix rollback before obligations'}});};
if(initial!==target){
 try{await deploy(target);assert.equal(await active(),target);await smoke(base);await crons();checkDb();}
 catch(e){const current=await active();if(current===target){checkDb();await deploy(NEXT);assert.equal(await active(),NEXT);await smoke(base);await crons();console.log('APD_REDIRECT_ROLLBACK_PASS');}else assert.equal(current,NEXT,'Unexpected active version; stop');throw e;}
}
assert.equal(await active(),target);
console.log('APD_REDIRECT_PROMOTION_PASS '+JSON.stringify({active:target,sha256:sha,traffic:100,rollback:NEXT,bindings:29,crons:4,admissionOpen:false,anonymousCheckoutDenied:true,providerCalls:0}));
