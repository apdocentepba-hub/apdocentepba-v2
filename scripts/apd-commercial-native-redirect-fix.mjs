import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {commercialRpc} from './apd-commercial-stage-checkout.mjs';
import {recoverCompletePreference} from './apd-commercial-recover-checkout.mjs';
import {claimCompleteTrial} from './apd-commercial-trial-adapter.mjs';
import {applyCompleteApproval} from './apd-commercial-payment-adapter.mjs';
import {persistFreePreferences} from './apd-commercial-persist-preferences.mjs';
import {verifyVersion,activeVersion,inspectCrons,NEXT,NEXT_HASH,worker} from './apd-commercial-release-contracts.mjs';
import {verifyTrialCandidateSyntax} from './apd-commercial-stage-trial.mjs';
import {verifyCommercialFullModule} from './apd-commercial-full-module-qa.mjs';
const specs=[[commercialRpc,'apdCommercialRpcV1',1],[recoverCompletePreference,'apdRecoverCompletePreferenceV1',2],[claimCompleteTrial,'apdClaimCompleteTrialV1',1],[applyCompleteApproval,'apdApplyCompleteApprovalV1',1],[persistFreePreferences,'apdPersistFreePrefsV1',1]];
export function patchExact(source){
 let candidate=source;const helpers=[],undo=[];
 for(const [fn,name,n] of specs){
  const old=fn.toString().replace('async function '+fn.name+'(','async function '+name+'(');
  assert.equal(source.split(old).length,2,'Exact live helper mismatch: '+name);
  assert.equal(old.split("redirect:'error'").length-1,n);
  const fresh=old.replaceAll("redirect:'error'","redirect:'manual'");
  assert.equal(fresh.split("redirect:'manual'").length-1,n);
  candidate=candidate.replace(old,()=>fresh);helpers.push(fresh);undo.push([old,fresh]);
 }
 let reversed=candidate;for(const [old,fresh] of undo.reverse())reversed=reversed.replace(fresh,()=>old);
 assert.equal(reversed,source);
 return {candidate,helpers,changed:6};
}
const token=process.env.CLOUDFLARE_API_TOKEN;
async function get(path){const res=await fetch('https://api.cloudflare.com/client/v4'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('CF metadata HTTP '+res.status);const d=await res.json();assert.equal(d.success,true);return d.result;}
const accounts=await get('/accounts?per_page=50');
const account=process.env.CONFIGURED_ACCOUNT_ID||(accounts.length===1?accounts[0].id:null);
assert.ok(account&&accounts.some(a=>a.id===account));
const root='/accounts/'+encodeURIComponent(account)+'/workers/';
assert.equal(activeVersion(await get(root+'scripts/'+worker+'/deployments')),NEXT);
const d=await get(root+'workers/'+worker+'/versions/'+NEXT+'?include=modules');
verifyVersion(d,NEXT,NEXT_HASH,902908);inspectCrons(await get(root+'scripts/'+worker+'/schedules'));
const source=Buffer.from(d.modules[0].content_base64,'base64').toString('utf8');
const fixed=patchExact(source);verifyTrialCandidateSyntax(fixed.candidate);
const sha=createHash('sha256').update(fixed.candidate).digest('hex');
console.log('APD_REDIRECT_CANDIDATE '+JSON.stringify({sha256:sha,bytes:Buffer.byteLength(fixed.candidate),changed:fixed.changed,unrelatedBytesPreserved:true}));
const harness=fixed.helpers.join('\n')+`
export default {async fetch(request){
 const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',MERCADOPAGO_ACCESS_TOKEN:'fixture-mp-only'};
 const uid='00000000-0000-4000-8000-000000000071',ref=uid+':COMPLETO:123';
 const checks=[
 ['reserve',()=>apdCommercialRpcV1(env,'apd_reserve_complete_checkout',{p_user_id:uid}),r=>r.ok&&r.mode==='create'],
 ['finalize',()=>apdCommercialRpcV1(env,'apd_finalize_complete_checkout',{p_user_id:uid,p_reference:ref}),r=>r.ok],
 ['trial',()=>apdClaimCompleteTrialV1(env,uid),r=>r.ok&&r.created===false],
 ['approval',()=>apdApplyCompleteApprovalV1(env,{id:700,external_reference:ref,live_mode:true,status:'approved',transaction_amount:2000,currency_id:'ARS',transaction_amount_refunded:0,date_approved:new Date().toISOString()}),r=>r.processed],
 ['refund',()=>apdApplyCompleteApprovalV1(env,{id:700,external_reference:ref,live_mode:true,status:'refunded',transaction_amount:2000,currency_id:'ARS',transaction_amount_refunded:2000}),r=>r.processed&&r.disposition==='revoke'],
 ['preferences',()=>apdPersistFreePrefsV1(env,uid,null,{user_id:uid}),r=>r[0].user_id===uid],
 ['recovery',()=>apdRecoverCompletePreferenceV1({env,userId:uid,reference:ref,finalize:async()=>({ok:true})}),r=>r.ok&&r.recovered]
 ];
 const result={};
 for(const [name,run,check] of checks){try{const val=await run();result[name]=Boolean(check(val));}catch{result[name]=false;}}
 try{await apdCommercialRpcV1({...env,SUPABASE_URL:'https://redirect.invalid'},'apd_reserve_complete_checkout',{p_user_id:uid});result.redirectRejected=false;}catch{result.redirectRejected=true;}
 return Response.json(result);
}};`;
let calls=0,redirects=0,unexpected=0;
const mf=new Miniflare({modules:true,script:harness,compatibilityDate:d.compatibility_date,compatibilityFlags:d.compatibility_flags||[],outboundService:async req=>{
 const u=new URL(req.url);calls++;
 if(u.hostname==='redirect.invalid'){redirects++;return new Response('',{status:302,headers:{location:'https://forbidden.invalid'}});}
 if(!['fixture.invalid','api.mercadopago.com'].includes(u.hostname)){unexpected++;return new Response('',{status:403});}
 const uid='00000000-0000-4000-8000-000000000071',ref=uid+':COMPLETO:123';
 const reply=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
 if(u.hostname==='fixture.invalid'){
  assert.equal(req.headers.get('authorization'),'Bearer fixture-only');
  const name=u.pathname.split('/').at(-1);
  if(name==='apd_reserve_complete_checkout')return reply({ok:true,mode:'create'});
  if(name==='apd_finalize_complete_checkout')return reply({ok:true});
  if(name==='apd_claim_complete_trial')return reply({ok:false,reason:'release_paused'});
  if(name==='apd_apply_complete_approval')return reply({ok:true,duplicate:false});
  if(name==='apd_review_complete_payment')return reply({ok:true,duplicate:false,disposition:'revoke'});
  if(name==='apd_save_free_preferences')return reply({ok:true,preferences:{user_id:uid}});
 }else{
  assert.equal(req.headers.get('authorization'),'Bearer fixture-mp-only');
  if(u.pathname==='/checkout/preferences/search')return reply({total:1,elements:[{id:'fixture-pref'}]});
  if(u.pathname==='/checkout/preferences/fixture-pref')return reply({id:'fixture-pref',external_reference:ref,items:[{id:'COMPLETO',currency_id:'ARS',quantity:1,unit_price:2000}],init_point:'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=fixture-pref'});
 }
 unexpected++;return new Response('',{status:404});
}});
try{
 const result=await (await mf.dispatchFetch('http://localhost/qa')).json();
 console.log('APD_NATIVE_REDIRECT_FIX '+JSON.stringify({result,calls,redirects,unexpected}));
 assert.ok(Object.values(result).every(Boolean));assert.equal(Object.keys(result).length,8);assert.equal(calls,9);assert.equal(redirects,1);assert.equal(unexpected,0);
}finally{await mf.dispose();}
const full=await verifyCommercialFullModule(fixed.candidate);
console.log('APD_FULL_MODULE_REDIRECT_REGRESSION_PASS '+JSON.stringify({sha256:sha,checks:full,productionWrites:0,providerCalls:0}));

if(process.argv.includes('--stage')){
 assert.equal(sha,'c291a47c6bc58ed6b9f0510d4b443ce8be2efb11280a045763c75a2a62b28113');
 const fs=await import('node:fs');
 const cfg=fs.readFileSync('wrangler.toml','utf8');
 assert.ok(cfg.includes('PRODUCTION_SOURCE_GUARD_V1'));
 const anchor='main = "worker-live/worker_hotfix.js"';
 assert.equal(cfg.split(anchor).length,2);
 const candidateConfig=cfg.replace(anchor,'main = "worker-diary-candidate.js"');
 const configSha256=createHash('sha256').update(candidateConfig).digest('hex');
 assert.equal(configSha256,'6d5a3846d6513986be8ad36cd689cfa4b46a4e0bea2e6ddc9d1fb2c2d87cb0be');
 const {stageZeroTraffic}=await import('./apd-commercial-stage-redirect-fix.mjs');
 await stageZeroTraffic({candidate:fixed.candidate,envelope:{candidateConfig,receipt:{candidateSha256:sha,configSha256,baseVersion:NEXT,rollbackVersion:NEXT}},details:d,account,worker,get,root,activeVersion,inspectCrons});
}
