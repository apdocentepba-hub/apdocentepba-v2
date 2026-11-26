import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {activeVersion,inspectCrons,verifyVersion,worker} from './apd-commercial-release-contracts.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
const version='0c83862f-ceaa-4436-a710-4c22d0ca65b4',hash='c291a47c6bc58ed6b9f0510d4b443ce8be2efb11280a045763c75a2a62b28113';
const helper=`async function apdCheckoutResumeV1(env,request){
 try{
  if(!request)return false;
  const user=await getSessionUserByBearer(env,request);
  if(!user?.id||user.activo!==true||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id))return false;
  const uid=encodeURIComponent(user.id);
  const permit=await supabaseSelect(env,"apd_commercial_checkout_pilot?user_id=eq."+uid+"&revoked_at=is.null&select=valid_until&limit=2");
  if(!Array.isArray(permit)||permit.length!==1||!(Date.parse(permit[0].valid_until)>Date.now()))return false;
  const rows=await supabaseSelect(env,"mercadopago_checkout_sessions?user_id=eq."+uid+"&plan_code=eq.COMPLETO&status=eq.ready&select=id,provider_payload&limit=2");
  return Array.isArray(rows)&&rows.length===1&&String(rows[0].provider_payload?.price_ars)==="2000"&&typeof rows[0].provider_payload?.preference_id==="string"&&rows[0].provider_payload.preference_id.length>0;
 }catch{return false;}
}`;
function once(source,a,b){assert.equal(source.split(a).length,2,'Expected exact anchor');return source.replace(a,()=>b);}
export function patch(source){
 const start='async function handlePlanes(env) {\n try {\n const catalog=';
 const route='return await handlePlanes(env);';
 const reply='commercial_enrollment_open:enrollment,founder_price_policy';
 let candidate=once(source,start,'async function handlePlanes(env,request) {\n try {\n const catalog=');
 candidate=once(candidate,route,'return await handlePlanes(env,request);');
 candidate=once(candidate,reply,'commercial_enrollment_open:enrollment,commercial_checkout_resume:!enrollment&&await apdCheckoutResumeV1(env,request),founder_price_policy');
 // Catalog response shape is preserved; verify the live JSON helper's cache policy separately.
 const end='founder_price_policy:{active:false},planes});';
 const startReply='return json({ok:true,commercial_model:"free_complete_v1",trial_days:14,';
 const privateReply='const response=json({ok:true,commercial_model:"free_complete_v1",trial_days:14,';
 const privateEnd='founder_price_policy:{active:false},planes}); response.headers.set("Cache-Control","private, no-store"); response.headers.set("Vary","Authorization, Origin"); return response;';
 candidate=once(candidate,startReply,privateReply);
 candidate=once(candidate,end,privateEnd);
 assert.ok(!source.includes('apdCheckoutResumeV1'));
 candidate=helper+'\n'+candidate;
 let reverse=candidate.slice(helper.length+1);
 reverse=once(reverse,'async function handlePlanes(env,request) {\n try {\n const catalog=',start);
 reverse=once(reverse,'return await handlePlanes(env,request);',route);
 reverse=once(reverse,privateReply,startReply);
 reverse=once(reverse,privateEnd,end);
 reverse=once(reverse,'commercial_enrollment_open:enrollment,commercial_checkout_resume:!enrollment&&await apdCheckoutResumeV1(env,request),founder_price_policy',reply);
 assert.equal(reverse,source);
 return candidate;
}
const token=process.env.CLOUDFLARE_API_TOKEN;
async function get(path){const res=await fetch('https://api.cloudflare.com/client/v4'+path,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('CF HTTP '+res.status);const d=await res.json();assert.equal(d.success,true);return d.result;}
const accounts=await get('/accounts?per_page=50'),account=process.env.CONFIGURED_ACCOUNT_ID||(accounts.length===1?accounts[0].id:null);
assert.ok(account&&accounts.some(a=>a.id===account));const root='/accounts/'+encodeURIComponent(account)+'/workers/';
assert.equal(activeVersion(await get(root+'scripts/'+worker+'/deployments')),version);
const d=await get(root+'workers/'+worker+'/versions/'+version+'?include=modules');verifyVersion(d,version,hash,902914);inspectCrons(await get(root+'scripts/'+worker+'/schedules'));
const src=Buffer.from(d.modules[0].content_base64,'base64').toString('utf8'),candidate=patch(src);verifyTrialCandidateSyntax(candidate);
const uid='00000000-0000-4000-8000-000000000071',other='00000000-0000-4000-8000-000000000072';
let user=null,permit=[],rows=[],queries=0,fail=false;
const ctx=vm.createContext({getSessionUserByBearer:async()=>user,supabaseSelect:async(_env,path)=>{queries++;assert.ok(path.includes('user_id=eq.'+user.id));if(fail)throw Error('fixture failure');return path.startsWith('apd_commercial_checkout_pilot?')?permit:rows;},encodeURIComponent,Date});
vm.runInContext(helper,ctx);
const call=()=>ctx.apdCheckoutResumeV1({},{});assert.equal(await call(),false);assert.equal(queries,0);
user={id:uid,activo:true};assert.equal(await call(),false);
permit=[{valid_until:new Date(Date.now()-1000).toISOString()}];assert.equal(await call(),false);
permit=[{valid_until:new Date(Date.now()+60000).toISOString()}];assert.equal(await call(),false);
rows=[{id:'fixture',provider_payload:{price_ars:2000,preference_id:'fixture'}}];assert.equal(await call(),true);
rows=[{id:'fixture',provider_payload:{price_ars:500,preference_id:'fixture'}}];assert.equal(await call(),false);
rows=[{id:'fixture',provider_payload:{price_ars:2000,preference_id:'fixture'}}];user={id:other,activo:true};permit=[];assert.equal(await call(),false);
fail=true;assert.equal(await call(),false);
const front=fs.readFileSync('plan_checkout_patch.js','utf8');const a=front.indexOf('  function planActualCode('),b=front.indexOf('    const currentPrice = currentPlanPrice(planInfo);',front.indexOf('  function transitionPolicy('));
const prefix=front.slice(a,b)+'return {allowed:false}; }';
const fctx=vm.createContext({window:{},normalizePlanCodeSafe:v=>String(v||'').toUpperCase()});vm.runInContext(prefix,fctx);
const pi={ok:true,access_active:true,subscription:{plan_code:'FREE',source:'apd_free_verified'},plan:{code:'FREE'}},plan={code:'COMPLETO',price_ars:2000,commercial_model:'free_complete_v1',commercial_enrollment_open:false};
assert.equal(fctx.transitionPolicy(plan,pi).allowed,false);
assert.equal(fctx.transitionPolicy({...plan,commercial_checkout_resume:true},pi).allowed,true);
assert.equal(fctx.transitionPolicy({...plan,commercial_checkout_resume:true},{...pi,subscription:{plan_code:'INSIGNE'},plan:{code:'INSIGNE'}}).allowed,false);
assert.equal(fctx.transitionPolicy({...plan,commercial_enrollment_open:true},pi).allowed,true);
console.log('APD_SCOPED_UI_CANDIDATE_PASS '+JSON.stringify({sha256:createHash('sha256').update(candidate).digest('hex'),bytes:Buffer.byteLength(candidate),serverCases:8,frontendCases:4,productionWrites:0,providerCalls:0,globalAdmissionChanged:false}));
